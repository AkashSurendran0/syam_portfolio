require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { execFile } = require('child_process');
const cloudinary = require('cloudinary').v2;
const { connectDB, Category, Project } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEYWORD = (process.env.SECRET_KEYWORD || 'syam_interior_2026').trim();

// Stateless HMAC-SHA256 session tokens (safe across Vercel serverless instances)
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOKEN_SECRET = crypto
  .createHash('sha256')
  .update(`syam-portfolio-session:${(process.env.SESSION_SECRET || SECRET_KEYWORD).trim()}`)
  .digest();
const revokedTokens = new Set();

function createSessionToken() {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
    jti: crypto.randomBytes(16).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadB64)
    .digest('hex');
  return `${payloadB64}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || revokedTokens.has(token)) {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigHex] = parts;
  if (!payloadB64 || !sigHex) return false;

  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadB64)
    .digest('hex');

  try {
    const sigBuf = Buffer.from(sigHex, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length === 0 || sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return false;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && Date.now() < payload.exp;
  } catch (e) {
    return false;
  }
}

// Configure Cloudinary
const cloudinaryUrl = (process.env.CLOUDINARY_URL || '').trim();
const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

if (cloudinaryUrl) {
  try {
    const parsed = new URL(cloudinaryUrl);
    cloudinary.config({
      cloud_name: decodeURIComponent(parsed.hostname),
      api_key: decodeURIComponent(parsed.username),
      api_secret: decodeURIComponent(parsed.password)
    });
  } catch (e) {
    console.warn('⚠️ Invalid CLOUDINARY_URL format');
  }
} else if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
}

// Upload buffer directly to Cloudinary (No local folders needed!)
function uploadToCloudinary(buffer, filename = 'image') {
  return new Promise((resolve, reject) => {
    const isCloudinaryConfigured = Boolean(
      cloudinaryUrl ||
      (cloudName && apiKey && apiSecret)
    );

    if (!isCloudinaryConfigured) {
      console.warn('⚠️ Cloudinary credentials not found in .env, saving as Base64 Data URI fallback');
      const base64 = buffer.toString('base64');
      return resolve({
        secure_url: `data:image/jpeg;base64,${base64}`,
        public_id: ''
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'syam_portfolio/projects',
        resource_type: 'image',
        transformation: [
          { quality: 'auto:good', fetch_format: 'auto' } // Auto WebP / compression
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

// Helper: Slugify string
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// ===================================================================
// FILE STORAGE FALLBACK HELPERS
// ===================================================================
const CATEGORIES_FILE = path.join(__dirname, 'data', 'categories.js');
const PROJECTS_FILE = path.join(__dirname, 'data', 'projects.js');
const PROJECTS_JSON = path.join(__dirname, 'data', 'projects.json');

const defaultCategories = [
  { id: 'residential', label: 'Residential' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'living', label: 'Living & Dining' },
  { id: 'outdoor', label: 'Outdoor & Landscape' }
];

let inMemoryCategories = null;
let inMemoryProjects = null;

// Helper: Read Categories from .js file
function readCategories() {
  if (inMemoryCategories && Array.isArray(inMemoryCategories) && inMemoryCategories.length > 0) {
    return inMemoryCategories;
  }
  try {
    const data = require('./data/categories.js');
    inMemoryCategories = Array.isArray(data) ? data : defaultCategories;
    return inMemoryCategories;
  } catch (err) {
    try {
      if (fs.existsSync(CATEGORIES_FILE)) {
        delete require.cache[require.resolve(CATEGORIES_FILE)];
        const data = require(CATEGORIES_FILE);
        inMemoryCategories = Array.isArray(data) ? data : defaultCategories;
        return inMemoryCategories;
      }
    } catch(e) {}
    inMemoryCategories = defaultCategories;
    return inMemoryCategories;
  }
}

// Helper: Write Categories to .js file
function writeCategories(categories) {
  inMemoryCategories = categories;
  try {
    const fileContent = `// Portfolio Categories Configuration (Stored in .js file)\nmodule.exports = ${JSON.stringify(categories, null, 2)};\n`;
    fs.writeFileSync(CATEGORIES_FILE, fileContent, 'utf8');
    delete require.cache[require.resolve(CATEGORIES_FILE)];
    return true;
  } catch (err) {
    return true;
  }
}

// Helper: Read Projects from .js file
function readProjects() {
  if (inMemoryProjects && Array.isArray(inMemoryProjects) && inMemoryProjects.length > 0) {
    return inMemoryProjects;
  }
  try {
    const data = require('./data/projects.js');
    inMemoryProjects = Array.isArray(data) ? data : [];
    return inMemoryProjects;
  } catch (err) {
    try {
      if (fs.existsSync(PROJECTS_FILE)) {
        delete require.cache[require.resolve(PROJECTS_FILE)];
        const data = require(PROJECTS_FILE);
        inMemoryProjects = Array.isArray(data) ? data : [];
        return inMemoryProjects;
      }
    } catch(e) {}
    try {
      if (fs.existsSync(PROJECTS_JSON)) {
        const jsonContent = fs.readFileSync(PROJECTS_JSON, 'utf8');
        inMemoryProjects = JSON.parse(jsonContent);
        return inMemoryProjects;
      }
    } catch(e) {}
    return [];
  }
}

// Helper: Write Projects to .js file
function writeProjects(projects) {
  inMemoryProjects = projects;
  try {
    const fileContent = `// Portfolio Projects Configuration (Stored in .js file)\nmodule.exports = ${JSON.stringify(projects, null, 2)};\n`;
    fs.writeFileSync(PROJECTS_FILE, fileContent, 'utf8');
    delete require.cache[require.resolve(PROJECTS_FILE)];
    try {
      fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2), 'utf8');
    } catch(e) {}
    return true;
  } catch (err) {
    return true;
  }
}

// Multer in-memory storage (Zero disk writes, zero folders!)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max per image
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|avif|heic|heif/i;
    const ext = path.extname(file.originalname || '');
    const isExtAllowed = Boolean(ext && allowed.test(ext));
    const mime = file.mimetype || '';
    const isMimeAllowed = Boolean(mime && allowed.test(mime));
    const isGenericMime = !mime || mime === 'application/octet-stream';

    if ((isExtAllowed && (isMimeAllowed || isGenericMime)) || (!ext && isMimeAllowed)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, HEIC, AVIF) are allowed!'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Normalize URL in case serverless rewrite alters req.url
app.use((req, res, next) => {
  const originalUrl = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'];
  if (originalUrl) {
    req.url = originalUrl;
  }
  if (!req.url.startsWith('/api') && (
    req.url.startsWith('/categories') ||
    req.url.startsWith('/projects') ||
    req.url.startsWith('/auth')
  )) {
    req.url = '/api' + req.url;
  }
  next();
});

// Auth Verification Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please sign in.' });
  }
  const token = authHeader.split(' ')[1];
  if (!verifySessionToken(token)) {
    return res.status(401).json({ success: false, message: 'Session expired or invalid. Please sign in again.' });
  }
  next();
}

// ===================================================================
// AUTH ROUTES
// ===================================================================

// Login: Compare SHA-256 hash or plaintext secretKeyword
app.post(['/api/auth/login', '/auth/login'], (req, res) => {
  const { keyHash, secretKeyword } = req.body || {};
  const expectedHash = crypto.createHash('sha256').update(SECRET_KEYWORD).digest('hex');

  let isValid = false;
  if (keyHash && typeof keyHash === 'string') {
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(keyHash.toLowerCase(), 'hex'),
        Buffer.from(expectedHash, 'hex')
      );
    } catch (e) {
      isValid = false;
    }
  } else if (secretKeyword && typeof secretKeyword === 'string') {
    isValid = secretKeyword.trim() === SECRET_KEYWORD;
  }

  if (isValid) {
    const token = createSessionToken();
    return res.json({ success: true, token, message: 'Authentication successful.' });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid secret keyword. Please verify and try again.' });
  }
});

// Verify Session
app.get(['/api/auth/verify', '/auth/verify'], (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (verifySessionToken(token)) {
      return res.json({ authenticated: true });
    }
  }
  return res.json({ authenticated: false });
});

// Logout
app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    revokedTokens.add(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ===================================================================
// CATEGORIES API (MongoDB with File Storage Fallback)
// ===================================================================

// GET /api/categories - Public
app.get(['/api/categories', '/categories'], async (req, res) => {
  try {
    const hasDB = await connectDB();
    if (hasDB) {
      let categories = await Category.find({}).sort({ createdAt: 1 }).lean();
      if (!categories || categories.length === 0) {
        // Auto-seed default categories on first MongoDB run
        try {
          await Category.insertMany(defaultCategories);
          categories = await Category.find({}).sort({ createdAt: 1 }).lean();
        } catch (seedErr) {}
      }
      if (categories && categories.length > 0) {
        return res.json({ success: true, categories });
      }
    }
  } catch (err) {
    console.warn('DB categories fetch error, using fallback:', err.message);
  }
  const categories = readCategories();
  res.json({ success: true, categories });
});

// POST /api/categories - Add Category (Protected)
app.post(['/api/categories', '/categories'], requireAuth, async (req, res) => {
  try {
    const { label, id } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Category label is required.' });
    }

    const categoryId = slugify(id || label);
    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Invalid category name.' });
    }

    const hasDB = await connectDB();
    if (hasDB) {
      const existing = await Category.findOne({ id: categoryId });
      if (existing) {
        return res.status(400).json({ success: false, message: `Category '${categoryId}' already exists.` });
      }
      const newCategory = await Category.create({ id: categoryId, label: label.trim() });
      const allCategories = await Category.find({}).sort({ createdAt: 1 }).lean();
      return res.status(201).json({ success: true, category: newCategory, categories: allCategories, message: 'Category added to MongoDB!' });
    }

    // Fallback file storage
    const categories = readCategories();
    if (categories.some(c => c.id === categoryId)) {
      return res.status(400).json({ success: false, message: `Category '${categoryId}' already exists.` });
    }

    const newCategory = { id: categoryId, label: label.trim() };
    categories.push(newCategory);
    writeCategories(categories);

    res.status(201).json({ success: true, category: newCategory, categories, message: 'Category added successfully.' });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ success: false, message: 'Server error adding category: ' + err.message });
  }
});

// PUT /api/categories/:id - Edit Category Label (Protected)
app.put(['/api/categories/:id', '/categories/:id'], requireAuth, async (req, res) => {
  try {
    const { label } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Category label is required.' });
    }

    const hasDB = await connectDB();
    if (hasDB) {
      const updated = await Category.findOneAndUpdate(
        { id: req.params.id },
        { label: label.trim() },
        { new: true }
      ).lean();
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Category not found.' });
      }
      const allCategories = await Category.find({}).sort({ createdAt: 1 }).lean();
      return res.json({ success: true, category: updated, categories: allCategories, message: 'Category updated in MongoDB!' });
    }

    // Fallback
    const categories = readCategories();
    const cat = categories.find(c => c.id === req.params.id);
    if (!cat) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    cat.label = label.trim();
    writeCategories(categories);

    res.json({ success: true, category: cat, categories, message: 'Category updated successfully.' });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ success: false, message: 'Server error updating category: ' + err.message });
  }
});

// DELETE /api/categories/:id - Delete Category (Protected)
app.delete(['/api/categories/:id', '/categories/:id'], requireAuth, async (req, res) => {
  try {
    const catId = req.params.id;
    const hasDB = await connectDB();
    if (hasDB) {
      const count = await Category.countDocuments();
      if (count <= 1) {
        return res.status(400).json({ success: false, message: 'At least one category must remain.' });
      }
      const deleted = await Category.findOneAndDelete({ id: catId }).lean();
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Category not found.' });
      }
      const allCategories = await Category.find({}).sort({ createdAt: 1 }).lean();
      return res.json({ success: true, deleted, categories: allCategories, message: `Category '${deleted.label}' deleted.` });
    }

    // Fallback
    const categories = readCategories();
    const index = categories.findIndex(c => c.id === catId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    if (categories.length <= 1) {
      return res.status(400).json({ success: false, message: 'At least one category must remain.' });
    }

    const deleted = categories.splice(index, 1)[0];
    writeCategories(categories);

    res.json({ success: true, deleted, categories, message: `Category '${deleted.label}' deleted.` });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ success: false, message: 'Server error deleting category: ' + err.message });
  }
});

// ===================================================================
// PROJECTS API (MongoDB + Cloudinary CDN)
// ===================================================================

// GET /api/projects - Public
app.get(['/api/projects', '/projects'], async (req, res) => {
  try {
    const hasDB = await connectDB();
    if (hasDB) {
      const projects = await Project.find({}).sort({ createdAt: -1 }).lean();
      return res.json({ success: true, projects });
    }
  } catch (err) {
    console.warn('DB projects fetch error, using fallback:', err.message);
  }
  const projects = readProjects();
  res.json({ success: true, projects });
});

// GET /api/projects/:id - Public
app.get(['/api/projects/:id', '/projects/:id'], async (req, res) => {
  try {
    const hasDB = await connectDB();
    if (hasDB) {
      const project = await Project.findOne({ id: req.params.id }).lean();
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }
      return res.json({ success: true, project });
    }
  } catch (err) {
    console.warn('DB project fetch error:', err.message);
  }
  const projects = readProjects();
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' });
  }
  res.json({ success: true, project });
});

// POST /api/projects - Create Project (Protected) -> Uploads to Cloudinary, saves to MongoDB
app.post(['/api/projects', '/projects'], requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    const { title, category, folderName, customLabels } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Project title is required.' });
    }

    const folderSlug = slugify(folderName || title);
    const projectId = folderSlug + '-' + Date.now().toString(36);

    let labels = [];
    try {
      if (customLabels) {
        labels = typeof customLabels === 'string' ? JSON.parse(customLabels) : customLabels;
      }
    } catch (e) {
      labels = [];
    }

    const angles = [];
    const files = req.files || [];

    // Upload each image buffer directly to Cloudinary (No local folders needed!)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const indexNum = i + 1;
      const label = labels[i] || `Angle 0${indexNum} — View`;

      const uploadResult = await uploadToCloudinary(file.buffer, `angle-${indexNum}`);
      angles.push({
        src: uploadResult.secure_url,
        publicId: uploadResult.public_id || '',
        label: label
      });
    }

    const newProjectData = {
      id: projectId,
      title: title.trim(),
      category: category || 'residential',
      folder: folderSlug,
      angles: angles
    };

    const hasDB = await connectDB();
    if (hasDB) {
      const created = await Project.create(newProjectData);
      return res.status(201).json({ success: true, project: created, message: 'Project created in MongoDB with Cloudinary images!' });
    }

    // Fallback file storage
    const projects = readProjects();
    projects.unshift(newProjectData);
    writeProjects(projects);

    res.status(201).json({ success: true, project: newProjectData, message: 'Project created successfully!' });
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ success: false, message: 'Server error creating project: ' + err.message });
  }
});

// PUT /api/projects/:id - Update Project Metadata & Angles (Protected)
app.put(['/api/projects/:id', '/projects/:id'], requireAuth, async (req, res) => {
  try {
    const { title, category, angles } = req.body;
    const updateFields = {};
    if (title && title.trim()) updateFields.title = title.trim();
    if (category) updateFields.category = category;
    if (Array.isArray(angles)) updateFields.angles = angles;

    const hasDB = await connectDB();
    if (hasDB) {
      const updated = await Project.findOneAndUpdate(
        { id: req.params.id },
        updateFields,
        { new: true }
      ).lean();
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      return res.json({ success: true, project: updated, message: 'Project updated in MongoDB!' });
    }

    // Fallback
    const projects = readProjects();
    const index = projects.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (title) projects[index].title = title.trim();
    if (category) projects[index].category = category;
    if (Array.isArray(angles)) projects[index].angles = angles;

    writeProjects(projects);
    res.json({ success: true, project: projects[index], message: 'Project updated successfully.' });
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ success: false, message: 'Error updating project: ' + err.message });
  }
});

// DELETE /api/projects/:id - Delete Project (Protected)
app.delete(['/api/projects/:id', '/projects/:id'], requireAuth, async (req, res) => {
  try {
    const hasDB = await connectDB();
    if (hasDB) {
      const project = await Project.findOneAndDelete({ id: req.params.id });
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }

      // Delete images from Cloudinary if publicId exists
      if (Array.isArray(project.angles)) {
        for (const angle of project.angles) {
          if (angle.publicId) {
            try { await cloudinary.uploader.destroy(angle.publicId); } catch (e) {}
          }
        }
      }
      return res.json({ success: true, message: 'Project and Cloudinary images deleted successfully.' });
    }

    // Fallback
    const projects = readProjects();
    const index = projects.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    projects.splice(index, 1);
    writeProjects(projects);
    res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ success: false, message: 'Error deleting project: ' + err.message });
  }
});

// POST /api/projects/:id/images - Add Angle/Image to existing project (Protected)
app.post(['/api/projects/:id/images', '/projects/:id/images'], requireAuth, upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded.' });
    }

    let labels = [];
    try {
      if (req.body.labels) {
        labels = typeof req.body.labels === 'string' ? JSON.parse(req.body.labels) : req.body.labels;
      }
    } catch (e) {
      labels = [];
    }

    const hasDB = await connectDB();
    if (hasDB) {
      const project = await Project.findOne({ id: req.params.id });
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const nextIndex = project.angles.length + 1;
        const label = labels[i] || req.body.label || `Angle 0${nextIndex} — View`;

        const uploadResult = await uploadToCloudinary(file.buffer, `angle-${nextIndex}`);
        project.angles.push({
          src: uploadResult.secure_url,
          publicId: uploadResult.public_id || '',
          label: label
        });
      }

      await project.save();
      return res.json({ success: true, project, message: 'Images uploaded to Cloudinary and added to project!' });
    }

    // Fallback
    const projects = readProjects();
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nextIndex = project.angles.length + 1;
      const label = labels[i] || req.body.label || `Angle 0${nextIndex} — View`;

      const uploadResult = await uploadToCloudinary(file.buffer, `angle-${nextIndex}`);
      project.angles.push({
        src: uploadResult.secure_url,
        publicId: uploadResult.public_id || '',
        label: label
      });
    }

    writeProjects(projects);
    res.json({ success: true, project, message: 'Images added successfully.' });
  } catch (err) {
    console.error('Error adding images:', err);
    res.status(500).json({ success: false, message: 'Error adding images: ' + err.message });
  }
});

// DELETE /api/projects/:id/images/:angleIndex - Remove Angle from project (Protected)
app.delete(['/api/projects/:id/images/:angleIndex', '/projects/:id/images/:angleIndex'], requireAuth, async (req, res) => {
  try {
    const angleIndex = parseInt(req.params.angleIndex, 10);
    const hasDB = await connectDB();
    if (hasDB) {
      const project = await Project.findOne({ id: req.params.id });
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      if (isNaN(angleIndex) || angleIndex < 0 || angleIndex >= project.angles.length) {
        return res.status(400).json({ success: false, message: 'Invalid angle index.' });
      }

      const [removedAngle] = project.angles.splice(angleIndex, 1);
      if (removedAngle && removedAngle.publicId) {
        try { await cloudinary.uploader.destroy(removedAngle.publicId); } catch (e) {}
      }

      await project.save();
      return res.json({ success: true, project, message: 'Image angle removed from project and Cloudinary.' });
    }

    // Fallback
    const projects = readProjects();
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (isNaN(angleIndex) || angleIndex < 0 || angleIndex >= project.angles.length) {
      return res.status(400).json({ success: false, message: 'Invalid angle index.' });
    }

    const [removedAngle] = project.angles.splice(angleIndex, 1);
    if (removedAngle && removedAngle.publicId) {
      try { await cloudinary.uploader.destroy(removedAngle.publicId); } catch (e) {}
    }

    writeProjects(projects);
    res.json({ success: true, project, message: 'Image angle removed successfully.' });
  } catch (err) {
    console.error('Error removing angle:', err);
    res.status(500).json({ success: false, message: 'Error removing angle: ' + err.message });
  }
});

// ===================================================================
// HTML ROUTING & STATIC ASSETS
// ===================================================================

// Route for /adminPortal
app.get(['/adminPortal', '/adminPortal.html', '/adminportal'], (req, res) => {
  const adminFile = fs.existsSync(path.join(__dirname, 'public', 'adminPortal.html'))
    ? path.join(__dirname, 'public', 'adminPortal.html')
    : path.join(__dirname, 'adminPortal.html');
  res.sendFile(adminFile);
});

// Static assets (serves from public/ first, then root as fallback)
if (fs.existsSync(path.join(__dirname, 'public'))) {
  app.use(express.static(path.join(__dirname, 'public')));
}
app.use(express.static(__dirname));

// Fallback to index.html for SPA/client routing (or 404 for unhandled API calls)
app.use((req, res) => {
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ success: false, message: `API endpoint ${req.url} not found` });
  }
  const indexFile = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
    ? path.join(__dirname, 'public', 'index.html')
    : path.join(__dirname, 'index.html');
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  res.status(404).send('Page not found');
});

// Express JSON error handler (prevents HTML 500 pages on Multer/upload errors)
app.use((err, req, res, next) => {
  if (!err) return next();
  console.error('Unhandled request error:', err);
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      success: false,
      message: err.code === 'LIMIT_FILE_SIZE'
        ? 'Image file exceeds the maximum allowed size.'
        : err.message
    });
  }
  res.status(err.status || 400).json({
    success: false,
    message: err.message || 'Server error processing request.'
  });
});

// Start Server when run directly (local development)
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  SyamKrishna Portfolio Server running on port ${PORT}`);
    console.log(`  Live Portfolio: http://localhost:${PORT}/`);
    console.log(`  Admin Portal:   http://localhost:${PORT}/adminPortal`);
    console.log(`=======================================================`);
  });
}

// Export app for Vercel Serverless Functions
module.exports = app;
