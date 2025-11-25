/**
 * Billing Routes
 * Bills, Payments, Invoices
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generateBillNumber,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// GET BILLS
// ═══════════════════════════════════════════════════════

router.get('/', checkModulePermission('billing', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { patientId, status, billType, date, dateFrom, dateTo } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    if (billType) where.billType = billType;

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      where.billDate = { gte: queryDate, lt: nextDay };
    } else if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo);
    }

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        skip,
        take: limit,
        orderBy: { billDate: 'desc' },
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
          items: true,
          payments: true,
          createdBy: {
            select: { name: true }
          }
        }
      }),
      prisma.bill.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(bills, total, page, limit),
      'Bills retrieved'
    );
  } catch (error) {
    console.error('Get bills error:', error);
    return errorResponse(res, 'Failed to get bills', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET SINGLE BILL
// ═══════════════════════════════════════════════════════

router.get('/:id', checkModulePermission('billing', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        patient: true,
        items: {
          include: {
            labOrder: {
              include: {
                items: { include: { labTest: true } }
              }
            },
            radiologyOrder: {
              include: {
                items: { include: { radiologyTest: true } }
              }
            }
          }
        },
        payments: true,
        createdBy: {
          select: { name: true }
        },
        hospital: {
          select: {
            businessName: true,
            logo: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
            helplineNumber: true,
            email: true,
            gstNumber: true
          }
        }
      }
    });

    if (!bill) {
      return errorResponse(res, 'Bill not found', 404);
    }

    if (req.hospitalId && bill.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { bill }, 'Bill retrieved');
  } catch (error) {
    console.error('Get bill error:', error);
    return errorResponse(res, 'Failed to get bill', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CREATE BILL
// ═══════════════════════════════════════════════════════

router.post('/', checkModulePermission('billing', 'create'), async (req, res) => {
  try {
    const { patientId, billType, items, discount, tax, notes, dueDate } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!patientId || !items || items.length === 0) {
      return errorResponse(res, 'Patient ID and at least one item are required', 400);
    }

    // Verify patient
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, hospitalId: req.hospitalId }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.unitPrice) * (item.quantity || 1));
    }, 0);

    const discountAmount = parseFloat(discount) || 0;
    const taxAmount = parseFloat(tax) || 0;
    const totalAmount = subtotal - discountAmount + taxAmount;

    const billNumber = await generateBillNumber(prisma, req.hospitalId);

    const bill = await prisma.bill.create({
      data: {
        hospitalId: req.hospitalId,
        patientId,
        billNumber,
        billType: billType || 'OPD',
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        totalAmount,
        status: 'PENDING',
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
        createdById: req.user.id,
        items: {
          create: items.map(item => ({
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: parseFloat(item.unitPrice),
            totalPrice: parseFloat(item.unitPrice) * (item.quantity || 1),
            labOrderId: item.labOrderId || null,
            radiologyOrderId: item.radiologyOrderId || null
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
        items: true
      }
    });

    return successResponse(res, { bill }, 'Bill created', 201);
  } catch (error) {
    console.error('Create bill error:', error);
    return errorResponse(res, 'Failed to create bill', 500);
  }
});

// ═══════════════════════════════════════════════════════
// RECORD PAYMENT
// ═══════════════════════════════════════════════════════

router.post('/:id/payments', checkModulePermission('billing', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, transactionRef, notes } = req.body;

    if (!amount || !paymentMethod) {
      return errorResponse(res, 'Amount and payment method are required', 400);
    }

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: { payments: true }
    });

    if (!bill) {
      return errorResponse(res, 'Bill not found', 404);
    }

    if (req.hospitalId && bill.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const paymentAmount = parseFloat(amount);
    const remainingAmount = parseFloat(bill.totalAmount) - parseFloat(bill.paidAmount);

    if (paymentAmount > remainingAmount) {
      return errorResponse(res, `Payment amount exceeds remaining balance of ${remainingAmount}`, 400);
    }

    // Generate payment number
    const paymentNumber = `PAY-${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      // Create payment
      const payment = await tx.payment.create({
        data: {
          billId: id,
          paymentNumber,
          amount: paymentAmount,
          paymentMethod,
          transactionRef,
          notes
        }
      });

      // Update bill
      const newPaidAmount = parseFloat(bill.paidAmount) + paymentAmount;
      let newStatus = 'PARTIALLY_PAID';

      if (newPaidAmount >= parseFloat(bill.totalAmount)) {
        newStatus = 'PAID';
      }

      const updatedBill = await tx.bill.update({
        where: { id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus
        }
      });

      // Update related orders if fully paid
      if (newStatus === 'PAID') {
        // Update lab orders
        const labOrderIds = bill.items
          ?.filter(item => item.labOrderId)
          .map(item => item.labOrderId) || [];

        if (labOrderIds.length > 0) {
          await tx.labOrder.updateMany({
            where: { id: { in: labOrderIds } },
            data: {
              status: 'PAID',
              paidAmount: { increment: paymentAmount / labOrderIds.length }
            }
          });
        }

        // Update radiology orders
        const radOrderIds = bill.items
          ?.filter(item => item.radiologyOrderId)
          .map(item => item.radiologyOrderId) || [];

        if (radOrderIds.length > 0) {
          await tx.radiologyOrder.updateMany({
            where: { id: { in: radOrderIds } },
            data: {
              status: 'PAID',
              paidAmount: { increment: paymentAmount / radOrderIds.length }
            }
          });
        }
      }

      return { payment, bill: updatedBill };
    });

    return successResponse(res, result, 'Payment recorded');
  } catch (error) {
    console.error('Record payment error:', error);
    return errorResponse(res, 'Failed to record payment', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET PATIENT PENDING CHARGES
// ═══════════════════════════════════════════════════════

router.get('/patient/:patientId/pending', checkModulePermission('billing', 'view'), async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    // Get unpaid lab orders
    const labOrders = await prisma.labOrder.findMany({
      where: {
        hospitalId: req.hospitalId,
        patientId,
        status: 'PENDING_PAYMENT'
      },
      include: {
        items: {
          include: { labTest: true }
        }
      }
    });

    // Get unpaid radiology orders
    const radiologyOrders = await prisma.radiologyOrder.findMany({
      where: {
        hospitalId: req.hospitalId,
        patientId,
        status: 'PENDING_PAYMENT'
      },
      include: {
        items: {
          include: { radiologyTest: true }
        }
      }
    });

    // Get unpaid bills
    const unpaidBills = await prisma.bill.findMany({
      where: {
        hospitalId: req.hospitalId,
        patientId,
        status: { in: ['PENDING', 'PARTIALLY_PAID'] }
      },
      include: {
        items: true,
        payments: true
      }
    });

    // Calculate totals
    const labTotal = labOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount), 0);
    const radTotal = radiologyOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount), 0);
    const billsTotal = unpaidBills.reduce((sum, bill) =>
      sum + (parseFloat(bill.totalAmount) - parseFloat(bill.paidAmount)), 0);

    return successResponse(res, {
      pendingCharges: {
        labOrders,
        radiologyOrders,
        unpaidBills,
        totals: {
          lab: labTotal,
          radiology: radTotal,
          bills: billsTotal,
          total: labTotal + radTotal + billsTotal
        }
      }
    }, 'Pending charges retrieved');
  } catch (error) {
    console.error('Get pending charges error:', error);
    return errorResponse(res, 'Failed to get pending charges', 500);
  }
});

// ═══════════════════════════════════════════════════════
// BILLING REPORTS
// ═══════════════════════════════════════════════════════

router.get('/reports/summary', checkModulePermission('billing', 'view'), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo);
    }

    const [totalBills, paidBills, pendingBills, revenue, payments] = await Promise.all([
      prisma.bill.count({ where }),
      prisma.bill.count({ where: { ...where, status: 'PAID' } }),
      prisma.bill.count({ where: { ...where, status: { in: ['PENDING', 'PARTIALLY_PAID'] } } }),
      prisma.bill.aggregate({
        where,
        _sum: {
          totalAmount: true,
          paidAmount: true,
          discount: true
        }
      }),
      prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: {
          bill: where
        },
        _sum: { amount: true },
        _count: true
      })
    ]);

    return successResponse(res, {
      summary: {
        totalBills,
        paidBills,
        pendingBills,
        revenue: {
          total: revenue._sum.totalAmount || 0,
          collected: revenue._sum.paidAmount || 0,
          pending: (revenue._sum.totalAmount || 0) - (revenue._sum.paidAmount || 0),
          discount: revenue._sum.discount || 0
        },
        paymentMethods: payments
      }
    }, 'Billing summary retrieved');
  } catch (error) {
    console.error('Get billing summary error:', error);
    return errorResponse(res, 'Failed to get billing summary', 500);
  }
});

// Cancel bill
router.patch('/:id/cancel', checkModulePermission('billing', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const bill = await prisma.bill.findUnique({ where: { id } });

    if (!bill) {
      return errorResponse(res, 'Bill not found', 404);
    }

    if (req.hospitalId && bill.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    if (parseFloat(bill.paidAmount) > 0) {
      return errorResponse(res, 'Cannot cancel bill with payments. Process refund instead.', 400);
    }

    const updated = await prisma.bill.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: bill.notes ? `${bill.notes}\nCancelled: ${reason || 'No reason provided'}` : `Cancelled: ${reason || 'No reason provided'}`
      }
    });

    return successResponse(res, { bill: updated }, 'Bill cancelled');
  } catch (error) {
    console.error('Cancel bill error:', error);
    return errorResponse(res, 'Failed to cancel bill', 500);
  }
});

module.exports = router;
