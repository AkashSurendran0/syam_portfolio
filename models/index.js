const mongoose = require('mongoose');

let isConnected = false;

// Connect to MongoDB with caching for serverless environments
async function connectDB() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    return true;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    return false;
  }
  try {
    const conn = await mongoose.connect(uri.trim(), {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (err) {
    console.warn('⚠️ MongoDB connection attempt failed:', err.message);
    return false;
  }
}

// Category Schema
const CategorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true }
}, { timestamps: true });

// Project Angle Schema
const ProjectAngleSchema = new mongoose.Schema({
  src: { type: String, required: true },
  label: { type: String, default: '' },
  publicId: { type: String, default: '' }
}, { _id: false });

// Project Schema
const ProjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  folder: { type: String, default: '' },
  angles: [ProjectAngleSchema]
}, { timestamps: true });

const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

module.exports = {
  connectDB,
  Category,
  Project
};
