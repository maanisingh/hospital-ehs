/**
 * Laboratory (Pathology) Routes
 * Lab Tests, Orders, Results
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generateLabOrderNumber,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// LAB TESTS MANAGEMENT
// ═══════════════════════════════════════════════════════

// Get all lab tests
router.get('/tests', checkModulePermission('lab', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, category, isActive } = req.query;

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

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [tests, total] = await Promise.all([
      prisma.labTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { testName: 'asc' }
      }),
      prisma.labTest.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(tests, total, page, limit),
      'Lab tests retrieved'
    );
  } catch (error) {
    console.error('Get lab tests error:', error);
    return errorResponse(res, 'Failed to get lab tests', 500);
  }
});

// Create lab test
router.post('/tests', checkModulePermission('lab', 'create'), async (req, res) => {
  try {
    const { testCode, testName, category, description, price, normalRange, unit, sampleType, turnaroundTime } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!testCode || !testName || !category || !price) {
      return errorResponse(res, 'Test code, name, category, and price are required', 400);
    }

    const test = await prisma.labTest.create({
      data: {
        hospitalId: req.hospitalId,
        testCode,
        testName,
        category,
        description,
        price: parseFloat(price),
        normalRange,
        unit,
        sampleType,
        turnaroundTime: turnaroundTime ? parseInt(turnaroundTime) : null,
        isActive: true
      }
    });

    return successResponse(res, { test }, 'Lab test created', 201);
  } catch (error) {
    console.error('Create lab test error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Test code already exists', 400);
    }
    return errorResponse(res, 'Failed to create lab test', 500);
  }
});

// Get lab test categories
router.get('/categories', checkModulePermission('lab', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const categories = await prisma.labTest.findMany({
      where: { hospitalId: req.hospitalId, isActive: true },
      distinct: ['category'],
      select: { category: true }
    });

    return successResponse(res, {
      categories: categories.map(c => c.category)
    }, 'Categories retrieved');
  } catch (error) {
    console.error('Get categories error:', error);
    return errorResponse(res, 'Failed to get categories', 500);
  }
});

// ═══════════════════════════════════════════════════════
// LAB ORDERS
// ═══════════════════════════════════════════════════════

// Get lab orders
router.get('/orders', checkModulePermission('lab', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { patientId, status, date, urgency } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (patientId) {
      where.patientId = patientId;
    }

    if (status) {
      where.status = status;
    }

    if (urgency) {
      where.urgency = urgency;
    }

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      where.orderDate = { gte: queryDate, lt: nextDay };
    }

    const [orders, total] = await Promise.all([
      prisma.labOrder.findMany({
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
              labTest: true,
              result: true
            }
          }
        }
      }),
      prisma.labOrder.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(orders, total, page, limit),
      'Lab orders retrieved'
    );
  } catch (error) {
    console.error('Get lab orders error:', error);
    return errorResponse(res, 'Failed to get lab orders', 500);
  }
});

// Create lab order
router.post('/orders', checkModulePermission('lab', 'create'), async (req, res) => {
  try {
    const { patientId, consultationId, tests, urgency, notes } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!patientId || !tests || tests.length === 0) {
      return errorResponse(res, 'Patient ID and at least one test are required', 400);
    }

    // Get test details and calculate total
    const testDetails = await prisma.labTest.findMany({
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
    const orderNumber = await generateLabOrderNumber(prisma, req.hospitalId);

    const order = await prisma.labOrder.create({
      data: {
        hospitalId: req.hospitalId,
        patientId,
        consultationId,
        orderNumber,
        urgency: urgency || 'ROUTINE',
        status: 'PENDING_PAYMENT',
        totalAmount,
        notes,
        items: {
          create: testDetails.map(test => ({
            labTestId: test.id,
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
          include: { labTest: true }
        }
      }
    });

    return successResponse(res, { order }, 'Lab order created', 201);
  } catch (error) {
    console.error('Create lab order error:', error);
    return errorResponse(res, 'Failed to create lab order', 500);
  }
});

// Update order status
router.patch('/orders/:id/status', checkModulePermission('lab', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING_PAYMENT', 'PAID', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res, 'Valid status required', 400);
    }

    const order = await prisma.labOrder.findUnique({ where: { id } });

    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    if (req.hospitalId && order.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updateData = { status };

    if (status === 'SAMPLE_COLLECTED') {
      updateData.collectedAt = new Date();
    } else if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.labOrder.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: { labTest: true, result: true }
        }
      }
    });

    return successResponse(res, { order: updated }, 'Order status updated');
  } catch (error) {
    console.error('Update order status error:', error);
    return errorResponse(res, 'Failed to update order status', 500);
  }
});

// ═══════════════════════════════════════════════════════
// LAB RESULTS
// ═══════════════════════════════════════════════════════

// Enter lab result
router.post('/results', checkModulePermission('lab', 'update'), async (req, res) => {
  try {
    const { labOrderItemId, result, unit, normalRange, isAbnormal, remarks } = req.body;

    if (!labOrderItemId || !result) {
      return errorResponse(res, 'Order item ID and result are required', 400);
    }

    const orderItem = await prisma.labOrderItem.findUnique({
      where: { id: labOrderItemId },
      include: {
        labOrder: true,
        labTest: true
      }
    });

    if (!orderItem) {
      return errorResponse(res, 'Order item not found', 404);
    }

    if (req.hospitalId && orderItem.labOrder.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Create result and update item status
    const labResult = await prisma.$transaction(async (tx) => {
      const createdResult = await tx.labResult.create({
        data: {
          labOrderItemId,
          result,
          unit: unit || orderItem.labTest.unit,
          normalRange: normalRange || orderItem.labTest.normalRange,
          isAbnormal: isAbnormal || false,
          remarks,
          testedById: req.user.id
        }
      });

      await tx.labOrderItem.update({
        where: { id: labOrderItemId },
        data: { status: 'COMPLETED' }
      });

      // Check if all items are completed
      const pendingItems = await tx.labOrderItem.count({
        where: {
          labOrderId: orderItem.labOrderId,
          status: { not: 'COMPLETED' }
        }
      });

      if (pendingItems === 0) {
        await tx.labOrder.update({
          where: { id: orderItem.labOrderId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date()
          }
        });
      }

      return createdResult;
    });

    return successResponse(res, { result: labResult }, 'Result entered', 201);
  } catch (error) {
    console.error('Enter result error:', error);
    return errorResponse(res, 'Failed to enter result', 500);
  }
});

// Get lab report for order
router.get('/orders/:id/report', checkModulePermission('lab', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.labOrder.findUnique({
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
            labTest: true,
            result: {
              include: {
                testedBy: {
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

    return successResponse(res, { report: order }, 'Lab report retrieved');
  } catch (error) {
    console.error('Get lab report error:', error);
    return errorResponse(res, 'Failed to get lab report', 500);
  }
});

// Get pending orders for lab queue
router.get('/queue', checkModulePermission('lab', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const orders = await prisma.labOrder.findMany({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['PAID', 'SAMPLE_COLLECTED', 'IN_PROGRESS'] }
      },
      orderBy: [
        { urgency: 'desc' },
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
            labTest: true,
            result: true
          }
        }
      }
    });

    const stats = {
      paid: orders.filter(o => o.status === 'PAID').length,
      sampleCollected: orders.filter(o => o.status === 'SAMPLE_COLLECTED').length,
      inProgress: orders.filter(o => o.status === 'IN_PROGRESS').length,
      urgent: orders.filter(o => o.urgency === 'URGENT' || o.urgency === 'STAT').length
    };

    return successResponse(res, { orders, stats }, 'Lab queue retrieved');
  } catch (error) {
    console.error('Get lab queue error:', error);
    return errorResponse(res, 'Failed to get lab queue', 500);
  }
});

module.exports = router;
