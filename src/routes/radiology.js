/**
 * Radiology Routes
 * Radiology Tests, Orders, Results, Reports
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generateRadiologyOrderNumber,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// RADIOLOGY TESTS MANAGEMENT
// ═══════════════════════════════════════════════════════

router.get('/tests', checkModulePermission('radiology', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, modality, isActive } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (search) {
      where.OR = [
        { testName: { contains: search, mode: 'insensitive' } },
        { testCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (modality) {
      where.modality = modality;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [tests, total] = await Promise.all([
      prisma.radiologyTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { testName: 'asc' }
      }),
      prisma.radiologyTest.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(tests, total, page, limit),
      'Radiology tests retrieved'
    );
  } catch (error) {
    console.error('Get radiology tests error:', error);
    return errorResponse(res, 'Failed to get radiology tests', 500);
  }
});

router.post('/tests', checkModulePermission('radiology', 'create'), async (req, res) => {
  try {
    const { testCode, testName, modality, description, price, preparationInstructions, turnaroundTime } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!testCode || !testName || !modality || !price) {
      return errorResponse(res, 'Test code, name, modality, and price are required', 400);
    }

    const test = await prisma.radiologyTest.create({
      data: {
        hospitalId: req.hospitalId,
        testCode,
        testName,
        modality,
        description,
        price: parseFloat(price),
        preparationInstructions,
        turnaroundTime: turnaroundTime ? parseInt(turnaroundTime) : null,
        isActive: true
      }
    });

    return successResponse(res, { test }, 'Radiology test created', 201);
  } catch (error) {
    console.error('Create radiology test error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Test code already exists', 400);
    }
    return errorResponse(res, 'Failed to create radiology test', 500);
  }
});

router.get('/modalities', checkModulePermission('radiology', 'view'), async (req, res) => {
  try {
    const modalities = [
      'X-Ray',
      'CT Scan',
      'MRI',
      'Ultrasound',
      'Mammography',
      'Fluoroscopy',
      'PET Scan',
      'DEXA Scan'
    ];
    return successResponse(res, { modalities }, 'Modalities retrieved');
  } catch (error) {
    return errorResponse(res, 'Failed to get modalities', 500);
  }
});

// ═══════════════════════════════════════════════════════
// RADIOLOGY ORDERS
// ═══════════════════════════════════════════════════════

router.get('/orders', checkModulePermission('radiology', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { patientId, status, date, urgency } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    if (urgency) where.urgency = urgency;

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      where.orderDate = { gte: queryDate, lt: nextDay };
    }

    const [orders, total] = await Promise.all([
      prisma.radiologyOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
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
          items: {
            include: {
              radiologyTest: true,
              result: true
            }
          }
        }
      }),
      prisma.radiologyOrder.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(orders, total, page, limit),
      'Radiology orders retrieved'
    );
  } catch (error) {
    console.error('Get radiology orders error:', error);
    return errorResponse(res, 'Failed to get radiology orders', 500);
  }
});

router.post('/orders', checkModulePermission('radiology', 'create'), async (req, res) => {
  try {
    const { patientId, consultationId, tests, urgency, scheduledAt, notes } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!patientId || !tests || tests.length === 0) {
      return errorResponse(res, 'Patient ID and at least one test are required', 400);
    }

    const testDetails = await prisma.radiologyTest.findMany({
      where: {
        id: { in: tests },
        hospitalId: req.hospitalId,
        isActive: true
      }
    });

    if (testDetails.length !== tests.length) {
      return errorResponse(res, 'One or more tests not found', 400);
    }

    const totalAmount = testDetails.reduce((sum, test) => sum + parseFloat(test.price), 0);
    const orderNumber = await generateRadiologyOrderNumber(prisma, req.hospitalId);

    const order = await prisma.radiologyOrder.create({
      data: {
        hospitalId: req.hospitalId,
        patientId,
        consultationId,
        orderNumber,
        urgency: urgency || 'ROUTINE',
        status: 'PENDING_PAYMENT',
        totalAmount,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        notes,
        items: {
          create: testDetails.map(test => ({
            radiologyTestId: test.id,
            price: test.price,
            status: 'PENDING'
          }))
        }
      },
      include: {
        patient: {
          select: {
            patientId: true,
            firstName: true,
            lastName: true
          }
        },
        items: {
          include: { radiologyTest: true }
        }
      }
    });

    return successResponse(res, { order }, 'Radiology order created', 201);
  } catch (error) {
    console.error('Create radiology order error:', error);
    return errorResponse(res, 'Failed to create radiology order', 500);
  }
});

router.patch('/orders/:id/status', checkModulePermission('radiology', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, scheduledAt } = req.body;

    const validStatuses = ['PENDING_PAYMENT', 'PAID', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res, 'Valid status required', 400);
    }

    const order = await prisma.radiologyOrder.findUnique({ where: { id } });

    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    if (req.hospitalId && order.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updateData = { status };

    if (status === 'SCHEDULED' && scheduledAt) {
      updateData.scheduledAt = new Date(scheduledAt);
    } else if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.radiologyOrder.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, { order: updated }, 'Order status updated');
  } catch (error) {
    console.error('Update order status error:', error);
    return errorResponse(res, 'Failed to update order status', 500);
  }
});

// ═══════════════════════════════════════════════════════
// RADIOLOGY RESULTS
// ═══════════════════════════════════════════════════════

router.post('/results', checkModulePermission('radiology', 'update'), async (req, res) => {
  try {
    const { radiologyOrderItemId, findings, impression, recommendation, imageUrls } = req.body;

    if (!radiologyOrderItemId || !findings) {
      return errorResponse(res, 'Order item ID and findings are required', 400);
    }

    const orderItem = await prisma.radiologyOrderItem.findUnique({
      where: { id: radiologyOrderItemId },
      include: { radiologyOrder: true }
    });

    if (!orderItem) {
      return errorResponse(res, 'Order item not found', 404);
    }

    if (req.hospitalId && orderItem.radiologyOrder.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdResult = await tx.radiologyResult.create({
        data: {
          radiologyOrderItemId,
          findings,
          impression,
          recommendation,
          imageUrls: imageUrls || [],
          reportedById: req.user.id
        }
      });

      await tx.radiologyOrderItem.update({
        where: { id: radiologyOrderItemId },
        data: { status: 'COMPLETED' }
      });

      const pendingItems = await tx.radiologyOrderItem.count({
        where: {
          radiologyOrderId: orderItem.radiologyOrderId,
          status: { not: 'COMPLETED' }
        }
      });

      if (pendingItems === 0) {
        await tx.radiologyOrder.update({
          where: { id: orderItem.radiologyOrderId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date()
          }
        });
      }

      return createdResult;
    });

    return successResponse(res, { result }, 'Result entered', 201);
  } catch (error) {
    console.error('Enter result error:', error);
    return errorResponse(res, 'Failed to enter result', 500);
  }
});

router.get('/orders/:id/report', checkModulePermission('radiology', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.radiologyOrder.findUnique({
      where: { id },
      include: {
        patient: true,
        consultation: {
          include: {
            doctor: {
              select: { name: true }
            }
          }
        },
        items: {
          include: {
            radiologyTest: true,
            result: {
              include: {
                reportedBy: {
                  select: { name: true }
                }
              }
            }
          }
        },
        hospital: {
          select: {
            businessName: true,
            logo: true,
            address: true,
            city: true,
            helplineNumber: true
          }
        }
      }
    });

    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    if (req.hospitalId && order.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { report: order }, 'Radiology report retrieved');
  } catch (error) {
    console.error('Get radiology report error:', error);
    return errorResponse(res, 'Failed to get radiology report', 500);
  }
});

router.get('/queue', checkModulePermission('radiology', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const orders = await prisma.radiologyOrder.findMany({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['PAID', 'SCHEDULED', 'IN_PROGRESS'] }
      },
      orderBy: [
        { urgency: 'desc' },
        { scheduledAt: 'asc' },
        { orderDate: 'asc' }
      ],
      include: {
        patient: {
          select: {
            patientId: true,
            firstName: true,
            lastName: true,
            mobile: true
          }
        },
        items: {
          include: {
            radiologyTest: true,
            result: true
          }
        }
      }
    });

    return successResponse(res, { orders }, 'Radiology queue retrieved');
  } catch (error) {
    console.error('Get radiology queue error:', error);
    return errorResponse(res, 'Failed to get radiology queue', 500);
  }
});

module.exports = router;
