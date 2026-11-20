const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { execFile } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEYWORD = (process.env.SECRET_KEYWORD || 'syam_interior_2026').trim();

// In-memory active session tokens: token -> { createdAt }
const activeSessions = new Map();

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
// FILE STORAGE HELPERS (.JS FILES - ZERO DATABASE)
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
    console.warn('Note: File write skipped (read-only filesystem on serverless):', err.message);
    return true;
  }
}

// Helper: Read Projects from .js file (zero db)
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

// Helper: Write Projects to .js file (zero db)
function writeProjects(projects) {
  inMemoryProjects = projects;
  try {
    const fileContent = `// Portfolio Projects Configuration (Stored in .js file)\nmodule.exports = ${JSON.stringify(projects, null, 2)};\n`;
    fs.writeFileSync(PROJECTS_FILE, fileContent, 'utf8');
    delete require.cache[require.resolve(PROJECTS_FILE)];
    // Also keep JSON mirror synced
    try {
      fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2), 'utf8');
    } catch(e) {}
    return true;
  } catch (err) {
    console.warn('Note: File write skipped (read-only filesystem on serverless):', err.message);
    return true;
  }
}

// Helper: Async convert image to WebP using python Pillow script
function convertImageToWebP(filePath) {
  return new Promise((resolve) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.webp') {
      return resolve(filePath);
    }
    const scriptPath = path.join(__dirname, 'scripts', 'convert_webp.py');
    execFile('python3', [scriptPath, filePath], (error, stdout) => {
      if (error) {
        console.warn('Pillow WebP conversion failed, using original file:', error.message);
        return resolve(filePath);
      }
      const webpPath = stdout.trim();
      if (fs.existsSync(webpPath)) {
        resolve(webpPath);
      } else {
        resolve(filePath);
      }
    });
  });
}

// Multer Storage Configuration
const os = require('os');
const tempUploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'temp_uploads')
  : path.join(__dirname, 'images', 'temp_uploads');

try {
  fs.mkdirSync(tempUploadDir, { recursive: true });
} catch (e) {
  // Graceful fallback for read-only serverless filesystems
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'upload-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per file
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/i;
    const isExtAllowed = allowed.test(path.extname(file.originalname));
    const isMimeAllowed = allowed.test(file.mimetype);
    if (isExtAllowed && isMimeAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed!'));
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
  if (!activeSessions.has(token)) {
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
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, { createdAt: Date.now() });
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
    if (activeSessions.has(token)) {
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
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ===================================================================
// CATEGORIES API (Stored in data/categories.js - Zero DB)
// ===================================================================

// GET /api/categories - Public
app.get('/api/categories', (req, res) => {
  const categories = readCategories();
  res.json({ success: true, categories });
});

// POST /api/categories - Add Category (Protected)
app.post('/api/categories', requireAuth, (req, res) => {
  try {
    const { label, id } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Category label is required.' });
    }

    const categories = readCategories();
    const categoryId = slugify(id || label);

    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Invalid category name.' });
    }

    if (categories.some(c => c.id === categoryId)) {
      return res.status(400).json({ success: false, message: `Category '${categoryId}' already exists.` });
    }

    const newCategory = {
      id: categoryId,
      label: label.trim()
    };

    categories.push(newCategory);
    writeCategories(categories);

    res.status(201).json({ success: true, category: newCategory, categories, message: 'Category added successfully.' });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ success: false, message: 'Server error adding category: ' + err.message });
  }
});

// PUT /api/categories/:id - Edit Category Label (Protected)
app.put('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const { label } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Category label is required.' });
    }

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
app.delete('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const categories = readCategories();
    const catId = req.params.id;
    const index = categories.findIndex(c => c.id === catId);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    if (categories.length <= 1) {
      return res.status(400).json({ success: false, message: 'At least one category must remain.' });
    }

    const deleted = categories.splice(index, 1)[0];
    writeCategories(categories);

    // Reassign projects with deleted category to first remaining category
    const projects = readProjects();
    const fallbackCategory = categories[0].id;
    let projectsModified = false;
    projects.forEach(p => {
      if (p.category === catId) {
        p.category = fallbackCategory;
        projectsModified = true;
      }
    });
    if (projectsModified) {
      writeProjects(projects);
    }

    res.json({ success: true, deleted, categories, message: `Category '${deleted.label}' deleted.` });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ success: false, message: 'Server error deleting category: ' + err.message });
  }
});

// ===================================================================
// PROJECTS API (CRUD)
// ===================================================================

// GET /api/projects - Public
app.get('/api/projects', (req, res) => {
  const projects = readProjects();
  res.json({ success: true, projects });
});

// GET /api/projects/:id - Public
app.get('/api/projects/:id', (req, res) => {
  const projects = readProjects();
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' });
  }
  res.json({ success: true, project });
});

// POST /api/projects - Create Project (Protected)
app.post(['/api/projects', '/projects'], requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    const { title, category, folderName, customLabels } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Project title is required.' });
    }

    const projects = readProjects();
    const folderSlug = slugify(folderName || title);
    const projectId = folderSlug + '-' + Date.now().toString(36);
    const isVercel = Boolean(process.env.VERCEL);

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

    // Local directory (only created for non-serverless local disk storage)
    let projectDir = null;
    if (!isVercel) {
      projectDir = path.join(__dirname, 'images', 'projects', folderSlug);
      try {
        fs.mkdirSync(projectDir, { recursive: true });
      } catch (e) {}
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const indexNum = i + 1;
      const label = labels[i] || `Angle 0${indexNum} — View`;
      let angleSrc = '';

      if (isVercel) {
        // On Vercel: Read uploaded file into Base64 Data URI so it works 100% on serverless without disk writes
        try {
          const fileBuf = fs.readFileSync(file.path);
          const mime = file.mimetype || 'image/jpeg';
          angleSrc = `data:${mime};base64,${fileBuf.toString('base64')}`;
          try { fs.unlinkSync(file.path); } catch (e) {}
        } catch (readErr) {
          console.warn('Could not read buffer:', readErr.message);
          angleSrc = `images/projects/${folderSlug}/angle-${indexNum}.jpg`;
        }
      } else {
        // Local: Save file to disk and optimize with WebP
        const angleDestName = `angle-${indexNum}${path.extname(file.path)}`;
        const targetPath = path.join(projectDir, angleDestName);
        try {
          fs.renameSync(file.path, targetPath);
          const finalWebpPath = await convertImageToWebP(targetPath);
          const finalFilename = path.basename(finalWebpPath);
          angleSrc = `images/projects/${folderSlug}/${finalFilename}`;
        } catch (diskErr) {
          const fileBuf = fs.readFileSync(file.path);
          const mime = file.mimetype || 'image/jpeg';
          angleSrc = `data:${mime};base64,${fileBuf.toString('base64')}`;
        }
      }

      angles.push({
        src: angleSrc,
        label: label
      });
    }

    const newProject = {
      id: projectId,
      title: title.trim(),
      category: category || 'residential',
      folder: folderSlug,
      angles: angles
    };

    projects.unshift(newProject);
    writeProjects(projects);

    res.status(201).json({ success: true, project: newProject, message: 'Project created successfully!' });
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ success: false, message: 'Server error creating project: ' + err.message });
  }
});

// PUT /api/projects/:id - Update Project Metadata & Angles (Protected)
app.put('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const { title, category, angles } = req.body;
    const projects = readProjects();
    const index = projects.findIndex(p => p.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (title) projects[index].title = title.trim();
    if (category) projects[index].category = category;
    if (Array.isArray(angles)) {
      projects[index].angles = angles;
    }

    writeProjects(projects);
    res.json({ success: true, project: projects[index], message: 'Project updated successfully.' });
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ success: false, message: 'Error updating project: ' + err.message });
  }
});

// DELETE /api/projects/:id - Delete Project (Protected)
app.delete('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const projects = readProjects();
    const index = projects.findIndex(p => p.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const deletedProject = projects[index];
    projects.splice(index, 1);
    writeProjects(projects);

    // Remove folder if exists
    if (deletedProject.folder) {
      const folderPath = path.join(__dirname, 'images', 'projects', deletedProject.folder);
      if (fs.existsSync(folderPath)) {
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
        } catch (rmErr) {
          console.warn('Could not remove folder:', rmErr.message);
        }
      }
    }

    res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ success: false, message: 'Error deleting project: ' + err.message });
  }
});

// POST /api/projects/:id/images - Add Angle/Image to existing project (Protected)
app.post(['/api/projects/:id/images', '/projects/:id/images'], requireAuth, upload.array('images', 10), async (req, res) => {
  try {
    const projects = readProjects();
    const project = projects.find(p => p.id === req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded.' });
    }

    const isVercel = Boolean(process.env.VERCEL);
    let projectDir = null;
    if (!isVercel) {
      projectDir = path.join(__dirname, 'images', 'projects', project.folder);
      try {
        fs.mkdirSync(projectDir, { recursive: true });
      } catch (e) {}
    }

    let labels = [];
    try {
      if (req.body.labels) {
        labels = typeof req.body.labels === 'string' ? JSON.parse(req.body.labels) : req.body.labels;
      }
    } catch (e) {
      labels = [];
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nextIndex = project.angles.length + 1;
      const label = labels[i] || req.body.label || `Angle 0${nextIndex} — View`;
      let angleSrc = '';

      if (isVercel) {
        try {
          const fileBuf = fs.readFileSync(file.path);
          const mime = file.mimetype || 'image/jpeg';
          angleSrc = `data:${mime};base64,${fileBuf.toString('base64')}`;
          try { fs.unlinkSync(file.path); } catch (e) {}
        } catch (readErr) {
          angleSrc = `images/projects/${project.folder}/angle-${nextIndex}.jpg`;
        }
      } else {
        const angleDestName = `angle-${nextIndex}-${Date.now().toString(36)}${path.extname(file.path)}`;
        const targetPath = path.join(projectDir, angleDestName);
        try {
          fs.renameSync(file.path, targetPath);
          const finalWebpPath = await convertImageToWebP(targetPath);
          const finalFilename = path.basename(finalWebpPath);
          angleSrc = `images/projects/${project.folder}/${finalFilename}`;
        } catch (diskErr) {
          const fileBuf = fs.readFileSync(file.path);
          const mime = file.mimetype || 'image/jpeg';
          angleSrc = `data:${mime};base64,${fileBuf.toString('base64')}`;
        }
      }

      project.angles.push({
        src: angleSrc,
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
app.delete(['/api/projects/:id/images/:angleIndex', '/projects/:id/images/:angleIndex'], requireAuth, (req, res) => {
  try {
    const projects = readProjects();
    const project = projects.find(p => p.id === req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const angleIndex = parseInt(req.params.angleIndex, 10);
    if (isNaN(angleIndex) || angleIndex < 0 || angleIndex >= project.angles.length) {
      return res.status(400).json({ success: false, message: 'Invalid angle index.' });
    }

    const removedAngle = project.angles[angleIndex];
    project.angles.splice(angleIndex, 1);

    // Delete file from disk if path exists and not a data URI
    if (removedAngle && removedAngle.src && !removedAngle.src.startsWith('data:')) {
      try {
        const filePath = path.join(__dirname, removedAngle.src);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        const pngPath = filePath.replace(/\.webp$/i, '.png');
        if (fs.existsSync(pngPath)) {
          fs.unlinkSync(pngPath);
        }
      } catch (e) {}
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
