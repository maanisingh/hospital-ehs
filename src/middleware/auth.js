/**
 * Authentication Middleware
 * Handles JWT validation and role-based access control
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'hospital-ehs-secret-key-change-in-production';

// ═══════════════════════════════════════════════════════
// JWT AUTHENTICATION
// ═══════════════════════════════════════════════════════

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { hospital: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hospitalId: user.hospitalId,
      hospital: user.hospital
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// ═══════════════════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL
// ═══════════════════════════════════════════════════════

// Role hierarchy for permission checking
const roleHierarchy = {
  SUPERADMIN: 100,
  HOSPITAL_ADMIN: 90,
  DOCTOR: 70,
  NURSE: 60,
  BILLING_STAFF: 50,
  RECEPTION: 50,
  LAB_TECHNICIAN: 40,
  RADIOLOGY_TECHNICIAN: 40,
  PHARMACIST: 40,
  INVENTORY_STAFF: 30
};

// Check if user has required role
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: 'Access denied. Insufficient permissions.',
      required: allowedRoles,
      current: req.user.role
    });
  };
};

// Check if user belongs to a hospital (not superadmin)
const requireHospital = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role === 'SUPERADMIN') {
    return next(); // Superadmin can access all hospitals
  }

  if (!req.user.hospitalId) {
    return res.status(403).json({ error: 'No hospital assigned to user' });
  }

  next();
};

// Ensure user can only access their hospital's data
const enforceHospitalScope = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Superadmin can specify hospital via query or header
  if (req.user.role === 'SUPERADMIN') {
    req.hospitalId = req.query.hospitalId || req.headers['x-hospital-id'] || null;
    return next();
  }

  // Other users are scoped to their hospital
  req.hospitalId = req.user.hospitalId;
  next();
};

// ═══════════════════════════════════════════════════════
// MODULE-SPECIFIC PERMISSIONS
// ═══════════════════════════════════════════════════════

const modulePermissions = {
  // OPD Module
  opd: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE', 'BILLING_STAFF'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RECEPTION'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RECEPTION', 'DOCTOR'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Patient Module
  patients: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE', 'BILLING_STAFF', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'PHARMACIST'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RECEPTION'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Consultation Module
  consultations: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Lab Module
  lab: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'BILLING_STAFF'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'LAB_TECHNICIAN'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'LAB_TECHNICIAN'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Radiology Module
  radiology: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RADIOLOGY_TECHNICIAN', 'BILLING_STAFF'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'RADIOLOGY_TECHNICIAN'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'RADIOLOGY_TECHNICIAN'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Pharmacy Module
  pharmacy: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'PHARMACIST', 'DOCTOR', 'BILLING_STAFF'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'PHARMACIST'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'PHARMACIST'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Billing Module
  billing: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'BILLING_STAFF', 'RECEPTION'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'BILLING_STAFF'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'BILLING_STAFF'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Inventory Module
  inventory: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'INVENTORY_STAFF', 'PHARMACIST'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'INVENTORY_STAFF'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'INVENTORY_STAFF'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // IPD Module
  ipd: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'BILLING_STAFF', 'RECEPTION'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // User Management
  users: {
    view: ['SUPERADMIN', 'HOSPITAL_ADMIN'],
    create: ['SUPERADMIN', 'HOSPITAL_ADMIN'],
    update: ['SUPERADMIN', 'HOSPITAL_ADMIN'],
    delete: ['SUPERADMIN', 'HOSPITAL_ADMIN']
  },

  // Hospital Management (Superadmin only)
  hospitals: {
    view: ['SUPERADMIN'],
    create: ['SUPERADMIN'],
    update: ['SUPERADMIN'],
    delete: ['SUPERADMIN']
  }
};

// Check module permission
const checkModulePermission = (module, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const permissions = modulePermissions[module];
    if (!permissions) {
      return res.status(500).json({ error: 'Invalid module' });
    }

    const allowedRoles = permissions[action];
    if (!allowedRoles) {
      return res.status(500).json({ error: 'Invalid action' });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Cannot ${action} ${module}.`,
      required: allowedRoles,
      current: req.user.role
    });
  };
};

module.exports = {
  authenticate,
  authorize,
  requireHospital,
  enforceHospitalScope,
  checkModulePermission,
  modulePermissions,
  roleHierarchy,
  JWT_SECRET
};
