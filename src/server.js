/**
 * Hospital Management System - MedicarePro
 * Multi-Tenant SAAS Platform
 * Main Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// ═══════════════════════════════════════════════════════
// MIDDLEWARE CONFIGURATION
// ═══════════════════════════════════════════════════════

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - Allow all origins for Railway deployment
const corsOptions = {
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Hospital-ID', 'X-Requested-With', 'Accept'],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS before any other middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../public')));

// ═══════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════

// Import routes
const authRoutes = require('./routes/auth');
const hospitalRoutes = require('./routes/hospitals');
const userRoutes = require('./routes/users');
const patientRoutes = require('./routes/patients');
const opdRoutes = require('./routes/opd');
const consultationRoutes = require('./routes/consultations');
const labRoutes = require('./routes/lab');
const radiologyRoutes = require('./routes/radiology');
const pharmacyRoutes = require('./routes/pharmacy');
const billingRoutes = require('./routes/billing');
const inventoryRoutes = require('./routes/inventory');
const ipdRoutes = require('./routes/ipd');
const dashboardRoutes = require('./routes/dashboard');

// API endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/hospitals', hospitalRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/opd', opdRoutes);
app.use('/api/v1/consultations', consultationRoutes);
app.use('/api/v1/lab', labRoutes);
app.use('/api/v1/radiology', radiologyRoutes);
app.use('/api/v1/pharmacy', pharmacyRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/ipd', ipdRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    service: 'MedicarePro Hospital Management System',
    timestamp: new Date().toISOString()
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'MedicarePro Hospital Management API',
    version: '1.0.0',
    description: 'Multi-Tenant Hospital Management SAAS System',
    endpoints: {
      auth: '/api/v1/auth',
      hospitals: '/api/v1/hospitals',
      users: '/api/v1/users',
      patients: '/api/v1/patients',
      opd: '/api/v1/opd',
      consultations: '/api/v1/consultations',
      lab: '/api/v1/lab',
      radiology: '/api/v1/radiology',
      pharmacy: '/api/v1/pharmacy',
      billing: '/api/v1/billing',
      inventory: '/api/v1/inventory',
      ipd: '/api/v1/ipd',
      dashboard: '/api/v1/dashboard'
    }
  });
});

// ═══════════════════════════════════════════════════════
// FRONTEND ROUTING (SPA)
// ═══════════════════════════════════════════════════════

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

// ═══════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ═══════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     🏥 MedicarePro Hospital Management System                ║
║     Multi-Tenant SAAS Platform                                ║
║                                                               ║
║     Server running on port ${PORT}                             ║
║     Environment: ${process.env.NODE_ENV || 'development'}                         ║
║                                                               ║
║     API: http://localhost:${PORT}/api                          ║
║     Health: http://localhost:${PORT}/api/health                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
