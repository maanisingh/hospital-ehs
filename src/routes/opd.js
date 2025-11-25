/**
 * OPD (Out-Patient Department) Routes
 * Token Generation, Queue Management, Appointments
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generateOpdToken,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse,
  getStartOfToday,
  getEndOfToday
} = require('../utils/helpers');

const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// GET TODAY'S OPD QUEUE
// ═══════════════════════════════════════════════════════

router.get('/queue', checkModulePermission('opd', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const { doctorId, departmentId, status } = req.query;
    const today = getStartOfToday();
    const tomorrow = getEndOfToday();

    const where = {
      hospitalId: req.hospitalId,
      tokenDate: {
        gte: today,
        lte: tomorrow
      }
    };

    if (doctorId) {
      where.doctorId = doctorId;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (status) {
      where.status = status;
    }

    const tokens = await prisma.opdToken.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { tokenNumber: 'asc' }
      ],
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true,
            mobile: true,
            gender: true,
            dateOfBirth: true
          }
        },
        doctor: {
          include: {
            user: {
              select: { name: true }
            },
            department: true
          }
        },
        department: true
      }
    });

    // Calculate statistics
    const stats = {
      total: tokens.length,
      waiting: tokens.filter(t => t.status === 'WAITING').length,
      inConsultation: tokens.filter(t => t.status === 'IN_CONSULTATION').length,
      completed: tokens.filter(t => t.status === 'COMPLETED').length,
      cancelled: tokens.filter(t => t.status === 'CANCELLED').length,
      noShow: tokens.filter(t => t.status === 'NO_SHOW').length
    };

    return successResponse(res, { tokens, stats }, 'OPD queue retrieved');
  } catch (error) {
    console.error('Get OPD queue error:', error);
    return errorResponse(res, 'Failed to get OPD queue', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET OPD TOKENS (with pagination)
// ═══════════════════════════════════════════════════════

router.get('/tokens', checkModulePermission('opd', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { date, doctorId, status, patientId } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);

      where.tokenDate = {
        gte: queryDate,
        lt: nextDay
      };
    }

    if (doctorId) {
      where.doctorId = doctorId;
    }

    if (status) {
      where.status = status;
    }

    if (patientId) {
      where.patientId = patientId;
    }

    const [tokens, total] = await Promise.all([
      prisma.opdToken.findMany({
        where,
        skip,
        take: limit,
        orderBy: { tokenDate: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              patientId: true,
              firstName: true,
              lastName: true,
              mobile: true
            }
          },
          doctor: {
            include: {
              user: {
                select: { name: true }
              }
            }
          },
          department: true
        }
      }),
      prisma.opdToken.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(tokens, total, page, limit),
      'OPD tokens retrieved'
    );
  } catch (error) {
    console.error('Get OPD tokens error:', error);
    return errorResponse(res, 'Failed to get OPD tokens', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CREATE OPD TOKEN (Book Appointment)
// ═══════════════════════════════════════════════════════

router.post('/tokens', checkModulePermission('opd', 'create'), async (req, res) => {
  try {
    const { patientId, doctorId, appointmentTime, priority, notes } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!patientId || !doctorId) {
      return errorResponse(res, 'Patient ID and Doctor ID are required', 400);
    }

    // Verify patient exists in this hospital
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        hospitalId: req.hospitalId,
        isActive: true
      }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Verify doctor exists and is available
    const doctor = await prisma.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: req.hospitalId,
        isAvailable: true
      }
    });

    if (!doctor) {
      return errorResponse(res, 'Doctor not found or not available', 404);
    }

    // Check if patient already has a token for today with this doctor
    const today = getStartOfToday();
    const tomorrow = getEndOfToday();

    const existingToken = await prisma.opdToken.findFirst({
      where: {
        hospitalId: req.hospitalId,
        patientId,
        doctorId,
        tokenDate: {
          gte: today,
          lte: tomorrow
        },
        status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] }
      }
    });

    if (existingToken) {
      return errorResponse(res, 'Patient already has an active token for this doctor today', 400);
    }

    // Check doctor's patient limit
    const todayTokenCount = await prisma.opdToken.count({
      where: {
        hospitalId: req.hospitalId,
        doctorId,
        tokenDate: {
          gte: today,
          lte: tomorrow
        },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] }
      }
    });

    if (todayTokenCount >= doctor.maxPatientsPerDay) {
      return errorResponse(res, 'Doctor has reached maximum patients for today', 400);
    }

    // Generate token number
    const tokenNumber = await generateOpdToken(prisma, req.hospitalId);

    // Estimate wait time (avg 15 min per patient)
    const waitingCount = await prisma.opdToken.count({
      where: {
        hospitalId: req.hospitalId,
        doctorId,
        tokenDate: {
          gte: today,
          lte: tomorrow
        },
        status: 'WAITING'
      }
    });
    const estimatedWait = waitingCount * 15;

    // Create token
    const token = await prisma.opdToken.create({
      data: {
        hospitalId: req.hospitalId,
        patientId,
        doctorId,
        departmentId: doctor.departmentId,
        tokenNumber,
        tokenDate: new Date(),
        appointmentTime: appointmentTime ? new Date(appointmentTime) : null,
        status: 'WAITING',
        checkInTime: new Date(),
        priority: priority || 0,
        estimatedWait,
        notes
      },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true,
            mobile: true
          }
        },
        doctor: {
          include: {
            user: {
              select: { name: true }
            }
          }
        },
        department: true
      }
    });

    return successResponse(res, {
      token,
      queuePosition: waitingCount + 1
    }, 'OPD token created', 201);
  } catch (error) {
    console.error('Create OPD token error:', error);
    return errorResponse(res, 'Failed to create OPD token', 500);
  }
});

// ═══════════════════════════════════════════════════════
// UPDATE TOKEN STATUS
// ═══════════════════════════════════════════════════════

router.patch('/tokens/:id/status', checkModulePermission('opd', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res, 'Valid status required', 400);
    }

    const token = await prisma.opdToken.findUnique({
      where: { id }
    });

    if (!token) {
      return errorResponse(res, 'Token not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && token.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Update with timestamp
    const updateData = { status };

    if (status === 'CALLED') {
      updateData.callTime = new Date();
    } else if (status === 'COMPLETED') {
      updateData.completedTime = new Date();
    }

    const updated = await prisma.opdToken.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true
          }
        },
        doctor: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      }
    });

    return successResponse(res, { token: updated }, 'Token status updated');
  } catch (error) {
    console.error('Update token status error:', error);
    return errorResponse(res, 'Failed to update token status', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CALL NEXT PATIENT (Doctor Action)
// ═══════════════════════════════════════════════════════

router.post('/call-next', checkModulePermission('opd', 'update'), async (req, res) => {
  try {
    const { doctorId } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!doctorId) {
      return errorResponse(res, 'Doctor ID required', 400);
    }

    const today = getStartOfToday();
    const tomorrow = getEndOfToday();

    // Get next waiting patient (prioritized)
    const nextToken = await prisma.opdToken.findFirst({
      where: {
        hospitalId: req.hospitalId,
        doctorId,
        tokenDate: {
          gte: today,
          lte: tomorrow
        },
        status: 'WAITING'
      },
      orderBy: [
        { priority: 'desc' },
        { tokenNumber: 'asc' }
      ],
      include: {
        patient: true,
        department: true
      }
    });

    if (!nextToken) {
      return successResponse(res, { token: null }, 'No patients waiting');
    }

    // Update token status to CALLED
    const updated = await prisma.opdToken.update({
      where: { id: nextToken.id },
      data: {
        status: 'CALLED',
        callTime: new Date()
      },
      include: {
        patient: true,
        doctor: {
          include: {
            user: {
              select: { name: true }
            }
          }
        },
        department: true
      }
    });

    return successResponse(res, { token: updated }, 'Next patient called');
  } catch (error) {
    console.error('Call next patient error:', error);
    return errorResponse(res, 'Failed to call next patient', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET DOCTORS AVAILABLE TODAY
// ═══════════════════════════════════════════════════════

router.get('/doctors-available', checkModulePermission('opd', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const { departmentId } = req.query;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const where = {
      hospitalId: req.hospitalId,
      isAvailable: true,
      availableDays: { has: today }
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const doctors = await prisma.doctor.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        department: true,
        _count: {
          select: {
            opdTokens: {
              where: {
                tokenDate: {
                  gte: getStartOfToday(),
                  lte: getEndOfToday()
                },
                status: { notIn: ['CANCELLED', 'NO_SHOW'] }
              }
            }
          }
        }
      }
    });

    // Add availability info
    const doctorsWithAvailability = doctors.map(doc => ({
      ...doc,
      todayTokens: doc._count.opdTokens,
      slotsRemaining: doc.maxPatientsPerDay - doc._count.opdTokens,
      isFullyBooked: doc._count.opdTokens >= doc.maxPatientsPerDay
    }));

    return successResponse(res, { doctors: doctorsWithAvailability }, 'Available doctors retrieved');
  } catch (error) {
    console.error('Get available doctors error:', error);
    return errorResponse(res, 'Failed to get available doctors', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET DEPARTMENTS
// ═══════════════════════════════════════════════════════

router.get('/departments', checkModulePermission('opd', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const departments = await prisma.department.findMany({
      where: {
        hospitalId: req.hospitalId,
        isActive: true
      },
      include: {
        _count: {
          select: { doctors: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    return successResponse(res, { departments }, 'Departments retrieved');
  } catch (error) {
    console.error('Get departments error:', error);
    return errorResponse(res, 'Failed to get departments', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET QUEUE DISPLAY (Public - for waiting area screens)
// ═══════════════════════════════════════════════════════

router.get('/display/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { departmentId } = req.query;

    const today = getStartOfToday();
    const tomorrow = getEndOfToday();

    const where = {
      hospitalId,
      tokenDate: {
        gte: today,
        lte: tomorrow
      },
      status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] }
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const tokens = await prisma.opdToken.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { tokenNumber: 'asc' }
      ],
      select: {
        tokenNumber: true,
        status: true,
        patient: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        doctor: {
          select: {
            roomNumber: true,
            user: {
              select: { name: true }
            }
          }
        },
        department: {
          select: { name: true }
        }
      }
    });

    // Get currently being served
    const currentlyServing = tokens.filter(t => t.status === 'CALLED' || t.status === 'IN_CONSULTATION');
    const waiting = tokens.filter(t => t.status === 'WAITING');

    return successResponse(res, {
      currentlyServing,
      waiting,
      timestamp: new Date().toISOString()
    }, 'Queue display data');
  } catch (error) {
    console.error('Get queue display error:', error);
    return errorResponse(res, 'Failed to get queue display', 500);
  }
});

module.exports = router;
