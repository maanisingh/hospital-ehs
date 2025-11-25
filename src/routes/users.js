/**
 * User Management Routes
 * Create, Update, Manage Users within Hospitals
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse,
  isValidEmail
} = require('../utils/helpers');

const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// GET ALL USERS
// ═══════════════════════════════════════════════════════

router.get('/', checkModulePermission('users', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, role, isActive } = req.query;

    const where = {};

    // Apply hospital scope
    if (req.hospitalId) {
      where.hospitalId = req.hospitalId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Exclude superadmin from hospital user lists
    if (req.user.role !== 'SUPERADMIN') {
      where.role = { not: 'SUPERADMIN' };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          mobile: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          hospital: {
            select: {
              id: true,
              organizationCode: true,
              businessName: true
            }
          },
          doctor: {
            select: {
              id: true,
              specialization: true,
              department: {
                select: { name: true }
              }
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(users, total, page, limit),
      'Users retrieved'
    );
  } catch (error) {
    console.error('Get users error:', error);
    return errorResponse(res, 'Failed to get users', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET SINGLE USER
// ═══════════════════════════════════════════════════════

router.get('/:id', checkModulePermission('users', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        mobile: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        hospital: {
          select: {
            id: true,
            organizationCode: true,
            businessName: true
          }
        },
        doctor: {
          include: {
            department: true
          }
        }
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && user.hospital?.id !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { user }, 'User retrieved');
  } catch (error) {
    console.error('Get user error:', error);
    return errorResponse(res, 'Failed to get user', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CREATE USER
// ═══════════════════════════════════════════════════════

router.post('/', checkModulePermission('users', 'create'), async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      mobile,
      role,
      hospitalId,
      // Doctor-specific fields
      departmentId,
      employeeId,
      specialization,
      qualification,
      consultationFee,
      roomNumber,
      availableDays,
      availableFrom,
      availableTo,
      maxPatientsPerDay
    } = req.body;

    // Validation
    if (!email || !isValidEmail(email)) {
      return errorResponse(res, 'Valid email is required', 400);
    }

    if (!name) {
      return errorResponse(res, 'Name is required', 400);
    }

    if (!role) {
      return errorResponse(res, 'Role is required', 400);
    }

    // Only superadmin can create users for other hospitals
    const targetHospitalId = req.user.role === 'SUPERADMIN'
      ? (hospitalId || req.hospitalId)
      : req.hospitalId;

    // Non-superadmin users must belong to a hospital
    if (role !== 'SUPERADMIN' && !targetHospitalId) {
      return errorResponse(res, 'Hospital ID is required', 400);
    }

    // Only superadmin can create superadmin or hospital_admin
    if (['SUPERADMIN', 'HOSPITAL_ADMIN'].includes(role) && req.user.role !== 'SUPERADMIN') {
      return errorResponse(res, 'Only superadmin can create this role', 403);
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Doctor-specific validation
    if (role === 'DOCTOR') {
      if (!departmentId || !employeeId || !specialization || !consultationFee) {
        return errorResponse(res, 'Department, employee ID, specialization, and consultation fee are required for doctors', 400);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);

    // Create user (and doctor if applicable)
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
          mobile,
          role,
          hospitalId: role === 'SUPERADMIN' ? null : targetHospitalId,
          isActive: true
        }
      });

      let doctor = null;
      if (role === 'DOCTOR' && targetHospitalId) {
        doctor = await tx.doctor.create({
          data: {
            hospitalId: targetHospitalId,
            userId: user.id,
            departmentId,
            employeeId,
            specialization,
            qualification,
            consultationFee: parseFloat(consultationFee),
            roomNumber,
            availableDays: availableDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            availableFrom: availableFrom || '09:00',
            availableTo: availableTo || '17:00',
            maxPatientsPerDay: maxPatientsPerDay || 30,
            isAvailable: true
          }
        });
      }

      return { user, doctor };
    });

    return successResponse(res, {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role
      },
      doctor: result.doctor,
      credentials: {
        email: email.toLowerCase(),
        password: password || 'password123'
      }
    }, 'User created successfully', 201);
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Employee ID already exists in this hospital', 400);
    }
    return errorResponse(res, 'Failed to create user', 500);
  }
});

// ═══════════════════════════════════════════════════════
// UPDATE USER
// ═══════════════════════════════════════════════════════

router.put('/:id', checkModulePermission('users', 'update'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: { doctor: true }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && user.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Prepare update data
    const { password, email, role, ...updateData } = req.body;

    // Only superadmin can change role
    if (role && req.user.role !== 'SUPERADMIN') {
      return errorResponse(res, 'Only superadmin can change user role', 403);
    }

    // Email change validation
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });
      if (existingUser) {
        return errorResponse(res, 'Email already in use', 400);
      }
      updateData.email = email.toLowerCase();
    }

    // Password change
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Role change (superadmin only)
    if (role && req.user.role === 'SUPERADMIN') {
      updateData.role = role;
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.createdAt;

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        mobile: true,
        role: true,
        isActive: true
      }
    });

    return successResponse(res, { user: updated }, 'User updated');
  } catch (error) {
    console.error('Update user error:', error);
    return errorResponse(res, 'Failed to update user', 500);
  }
});

// ═══════════════════════════════════════════════════════
// TOGGLE USER STATUS
// ═══════════════════════════════════════════════════════

router.patch('/:id/status', checkModulePermission('users', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && user.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Prevent deactivating self
    if (user.id === req.user.id) {
      return errorResponse(res, 'Cannot deactivate your own account', 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: isActive !== undefined ? isActive : !user.isActive }
    });

    return successResponse(res, {
      user: {
        id: updated.id,
        isActive: updated.isActive
      }
    }, `User ${updated.isActive ? 'activated' : 'deactivated'}`);
  } catch (error) {
    console.error('Toggle user status error:', error);
    return errorResponse(res, 'Failed to update user status', 500);
  }
});

// ═══════════════════════════════════════════════════════
// DELETE USER
// ═══════════════════════════════════════════════════════

router.delete('/:id', checkModulePermission('users', 'delete'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && user.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Prevent deleting self
    if (user.id === req.user.id) {
      return errorResponse(res, 'Cannot delete your own account', 400);
    }

    // Soft delete - just deactivate
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    return successResponse(res, {}, 'User deactivated');
  } catch (error) {
    console.error('Delete user error:', error);
    return errorResponse(res, 'Failed to delete user', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET ROLES LIST
// ═══════════════════════════════════════════════════════

router.get('/roles/list', async (req, res) => {
  const roles = [
    { value: 'HOSPITAL_ADMIN', label: 'Hospital Admin', description: 'Full access to hospital management' },
    { value: 'RECEPTION', label: 'Reception', description: 'Patient registration and OPD booking' },
    { value: 'DOCTOR', label: 'Doctor', description: 'Patient consultation and prescriptions' },
    { value: 'NURSE', label: 'Nurse', description: 'Patient care and IPD management' },
    { value: 'LAB_TECHNICIAN', label: 'Lab Technician', description: 'Laboratory test management' },
    { value: 'RADIOLOGY_TECHNICIAN', label: 'Radiology Technician', description: 'Radiology test management' },
    { value: 'PHARMACIST', label: 'Pharmacist', description: 'Medicine dispensing and inventory' },
    { value: 'BILLING_STAFF', label: 'Billing Staff', description: 'Billing and payments' },
    { value: 'INVENTORY_STAFF', label: 'Inventory Staff', description: 'Inventory management' }
  ];

  // Superadmin can see all roles
  if (req.user.role === 'SUPERADMIN') {
    roles.unshift({ value: 'SUPERADMIN', label: 'Super Admin', description: 'Multi-tenant management' });
  }

  return successResponse(res, { roles }, 'Roles retrieved');
});

module.exports = router;
