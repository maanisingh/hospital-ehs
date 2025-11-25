/**
 * Hospital Management Routes (Superadmin Only)
 * Create, Update, Manage Hospital Tenants
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, checkModulePermission } = require('../middleware/auth');
const {
  generateOrganizationCode,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse,
  isValidEmail
} = require('../utils/helpers');

const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════════════════
// GET ALL HOSPITALS
// ═══════════════════════════════════════════════════════

router.get('/', authorize('SUPERADMIN'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, isActive } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { organizationCode: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [hospitals, total] = await Promise.all([
      prisma.hospital.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              patients: true,
              doctors: true
            }
          }
        }
      }),
      prisma.hospital.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(hospitals, total, page, limit),
      'Hospitals retrieved'
    );
  } catch (error) {
    console.error('Get hospitals error:', error);
    return errorResponse(res, 'Failed to get hospitals', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET SINGLE HOSPITAL
// ═══════════════════════════════════════════════════════

router.get('/:id', authorize('SUPERADMIN', 'HOSPITAL_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Hospital admin can only view their own hospital
    if (req.user.role === 'HOSPITAL_ADMIN' && req.user.hospitalId !== id) {
      return errorResponse(res, 'Access denied', 403);
    }

    const hospital = await prisma.hospital.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            patients: true,
            doctors: true,
            departments: true,
            beds: true
          }
        }
      }
    });

    if (!hospital) {
      return errorResponse(res, 'Hospital not found', 404);
    }

    return successResponse(res, { hospital }, 'Hospital retrieved');
  } catch (error) {
    console.error('Get hospital error:', error);
    return errorResponse(res, 'Failed to get hospital', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CREATE HOSPITAL
// ═══════════════════════════════════════════════════════

router.post('/', authorize('SUPERADMIN'), async (req, res) => {
  try {
    const {
      businessName,
      logo,
      address,
      city,
      state,
      pincode,
      country,
      email,
      helplineNumber,
      ownerName,
      ownerEmail,
      ownerMobile,
      facebookUrl,
      instagramUrl,
      youtubeUrl,
      twitterUrl,
      linkedinUrl,
      footerText,
      timezone,
      currency,
      subscriptionExpiry,
      // Admin user details
      adminPassword
    } = req.body;

    // Validation
    if (!businessName) {
      return errorResponse(res, 'Business name is required', 400);
    }

    if (!ownerEmail || !isValidEmail(ownerEmail)) {
      return errorResponse(res, 'Valid owner email is required', 400);
    }

    // Check if owner email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail.toLowerCase() }
    });

    if (existingUser) {
      return errorResponse(res, 'Owner email already registered', 400);
    }

    // Generate organization code
    const organizationCode = await generateOrganizationCode(prisma);

    // Create hospital and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create hospital
      const hospital = await tx.hospital.create({
        data: {
          organizationCode,
          businessName,
          logo,
          address,
          city,
          state,
          pincode,
          country: country || 'India',
          email,
          helplineNumber,
          ownerName,
          ownerEmail,
          ownerMobile,
          facebookUrl,
          instagramUrl,
          youtubeUrl,
          twitterUrl,
          linkedinUrl,
          footerText,
          timezone: timezone || 'Asia/Kolkata',
          currency: currency || 'INR',
          subscriptionExpiry: subscriptionExpiry ? new Date(subscriptionExpiry) : null,
          isActive: true
        }
      });

      // Create hospital admin user
      const hashedPassword = await bcrypt.hash(adminPassword || 'admin123', 10);
      const admin = await tx.user.create({
        data: {
          hospitalId: hospital.id,
          email: ownerEmail.toLowerCase(),
          password: hashedPassword,
          name: ownerName || 'Hospital Admin',
          mobile: ownerMobile,
          role: 'HOSPITAL_ADMIN',
          isActive: true
        }
      });

      // Create default departments
      const defaultDepartments = [
        'General Medicine',
        'Pediatrics',
        'Orthopedics',
        'Cardiology',
        'Dermatology',
        'ENT',
        'Ophthalmology',
        'Gynecology',
        'Emergency'
      ];

      await tx.department.createMany({
        data: defaultDepartments.map(name => ({
          hospitalId: hospital.id,
          name,
          isActive: true
        }))
      });

      return { hospital, admin };
    });

    return successResponse(res, {
      hospital: result.hospital,
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        name: result.admin.name,
        role: result.admin.role
      },
      credentials: {
        email: ownerEmail,
        password: adminPassword || 'admin123'
      }
    }, 'Hospital created successfully', 201);
  } catch (error) {
    console.error('Create hospital error:', error);
    return errorResponse(res, 'Failed to create hospital', 500);
  }
});

// ═══════════════════════════════════════════════════════
// UPDATE HOSPITAL
// ═══════════════════════════════════════════════════════

router.put('/:id', authorize('SUPERADMIN', 'HOSPITAL_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Hospital admin can only update their own hospital
    if (req.user.role === 'HOSPITAL_ADMIN' && req.user.hospitalId !== id) {
      return errorResponse(res, 'Access denied', 403);
    }

    const hospital = await prisma.hospital.findUnique({
      where: { id }
    });

    if (!hospital) {
      return errorResponse(res, 'Hospital not found', 404);
    }

    // Only superadmin can change these fields
    const superadminOnlyFields = ['isActive', 'subscriptionExpiry', 'organizationCode'];
    const updateData = { ...req.body };

    if (req.user.role !== 'SUPERADMIN') {
      superadminOnlyFields.forEach(field => {
        delete updateData[field];
      });
    }

    // Remove id and timestamps
    delete updateData.id;
    delete updateData.createdAt;

    const updated = await prisma.hospital.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, { hospital: updated }, 'Hospital updated');
  } catch (error) {
    console.error('Update hospital error:', error);
    return errorResponse(res, 'Failed to update hospital', 500);
  }
});

// ═══════════════════════════════════════════════════════
// TOGGLE HOSPITAL STATUS
// ═══════════════════════════════════════════════════════

router.patch('/:id/status', authorize('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const hospital = await prisma.hospital.findUnique({
      where: { id }
    });

    if (!hospital) {
      return errorResponse(res, 'Hospital not found', 404);
    }

    const updated = await prisma.hospital.update({
      where: { id },
      data: { isActive: isActive !== undefined ? isActive : !hospital.isActive }
    });

    return successResponse(res, { hospital: updated }, `Hospital ${updated.isActive ? 'activated' : 'deactivated'}`);
  } catch (error) {
    console.error('Toggle hospital status error:', error);
    return errorResponse(res, 'Failed to update hospital status', 500);
  }
});

// ═══════════════════════════════════════════════════════
// DELETE HOSPITAL (Soft delete by deactivating)
// ═══════════════════════════════════════════════════════

router.delete('/:id', authorize('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { hardDelete } = req.query;

    const hospital = await prisma.hospital.findUnique({
      where: { id }
    });

    if (!hospital) {
      return errorResponse(res, 'Hospital not found', 404);
    }

    if (hardDelete === 'true') {
      // WARNING: This will delete all related data
      await prisma.hospital.delete({
        where: { id }
      });
      return successResponse(res, {}, 'Hospital permanently deleted');
    }

    // Soft delete - just deactivate
    await prisma.hospital.update({
      where: { id },
      data: { isActive: false }
    });

    return successResponse(res, {}, 'Hospital deactivated');
  } catch (error) {
    console.error('Delete hospital error:', error);
    return errorResponse(res, 'Failed to delete hospital', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET HOSPITAL STATISTICS
// ═══════════════════════════════════════════════════════

router.get('/:id/stats', authorize('SUPERADMIN', 'HOSPITAL_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Hospital admin can only view their own hospital
    if (req.user.role === 'HOSPITAL_ADMIN' && req.user.hospitalId !== id) {
      return errorResponse(res, 'Access denied', 403);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPatients,
      totalDoctors,
      totalUsers,
      todayOpdTokens,
      pendingLabOrders,
      occupiedBeds,
      totalBeds,
      todayRevenue
    ] = await Promise.all([
      prisma.patient.count({ where: { hospitalId: id } }),
      prisma.doctor.count({ where: { hospitalId: id } }),
      prisma.user.count({ where: { hospitalId: id } }),
      prisma.opdToken.count({
        where: {
          hospitalId: id,
          tokenDate: { gte: today }
        }
      }),
      prisma.labOrder.count({
        where: {
          hospitalId: id,
          status: { in: ['PENDING_PAYMENT', 'PAID', 'SAMPLE_COLLECTED', 'IN_PROGRESS'] }
        }
      }),
      prisma.bed.count({
        where: {
          hospitalId: id,
          status: 'OCCUPIED'
        }
      }),
      prisma.bed.count({ where: { hospitalId: id } }),
      prisma.bill.aggregate({
        where: {
          hospitalId: id,
          billDate: { gte: today },
          status: { in: ['PAID', 'PARTIALLY_PAID'] }
        },
        _sum: { paidAmount: true }
      })
    ]);

    return successResponse(res, {
      stats: {
        totalPatients,
        totalDoctors,
        totalUsers,
        todayOpdTokens,
        pendingLabOrders,
        bedOccupancy: {
          occupied: occupiedBeds,
          total: totalBeds,
          percentage: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0
        },
        todayRevenue: todayRevenue._sum.paidAmount || 0
      }
    }, 'Hospital statistics retrieved');
  } catch (error) {
    console.error('Get hospital stats error:', error);
    return errorResponse(res, 'Failed to get hospital statistics', 500);
  }
});

module.exports = router;
