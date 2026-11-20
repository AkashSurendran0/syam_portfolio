// Vercel Serverless Function Entry Point
// Wraps Express app as a proper Vercel handler (req, res)
const app = require('../server.js');

module.exports = (req, res) => {
  // Vercel passes native Node IncomingMessage & ServerResponse — Express handles them directly
  return app(req, res);
};
