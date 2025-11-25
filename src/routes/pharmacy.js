/**
 * Pharmacy Routes
 * Medicine Management, Dispensing, Stock Control
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// MEDICINE MANAGEMENT
// ═══════════════════════════════════════════════════════

router.get('/medicines', checkModulePermission('pharmacy', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, category, lowStock, expiring, isActive } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { medicineCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (category) {
      where.category = category;
    }

    if (lowStock === 'true') {
      where.stockQuantity = { lte: prisma.raw('reorder_level') };
    }

    if (expiring === 'true') {
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      where.expiryDate = { lte: threeMonths };
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      prisma.medicine.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(medicines, total, page, limit),
      'Medicines retrieved'
    );
  } catch (error) {
    console.error('Get medicines error:', error);
    return errorResponse(res, 'Failed to get medicines', 500);
  }
});

router.post('/medicines', checkModulePermission('pharmacy', 'create'), async (req, res) => {
  try {
    const {
      medicineCode, name, genericName, category, manufacturer,
      batchNumber, expiryDate, stockQuantity, reorderLevel,
      unitPrice, sellingPrice, unit, storageCondition
    } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!medicineCode || !name || !category || !unitPrice || !sellingPrice) {
      return errorResponse(res, 'Medicine code, name, category, unit price, and selling price are required', 400);
    }

    const medicine = await prisma.medicine.create({
      data: {
        hospitalId: req.hospitalId,
        medicineCode,
        name,
        genericName,
        category,
        manufacturer,
        batchNumber,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        stockQuantity: stockQuantity || 0,
        reorderLevel: reorderLevel || 10,
        unitPrice: parseFloat(unitPrice),
        sellingPrice: parseFloat(sellingPrice),
        unit: unit || 'Tablet',
        storageCondition,
        isActive: true
      }
    });

    // Record initial stock if provided
    if (stockQuantity > 0) {
      await prisma.medicineStockMovement.create({
        data: {
          medicineId: medicine.id,
          movementType: 'PURCHASE',
          quantity: stockQuantity,
          batchNumber,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          reference: 'Initial Stock',
          notes: 'Initial inventory entry'
        }
      });
    }

    return successResponse(res, { medicine }, 'Medicine created', 201);
  } catch (error) {
    console.error('Create medicine error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Medicine code already exists', 400);
    }
    return errorResponse(res, 'Failed to create medicine', 500);
  }
});

router.put('/medicines/:id', checkModulePermission('pharmacy', 'update'), async (req, res) => {
  try {
    const { id } = req.params;

    const medicine = await prisma.medicine.findUnique({ where: { id } });

    if (!medicine) {
      return errorResponse(res, 'Medicine not found', 404);
    }

    if (req.hospitalId && medicine.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.hospitalId;
    delete updateData.medicineCode;
    delete updateData.createdAt;

    if (updateData.expiryDate) {
      updateData.expiryDate = new Date(updateData.expiryDate);
    }

    const updated = await prisma.medicine.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, { medicine: updated }, 'Medicine updated');
  } catch (error) {
    console.error('Update medicine error:', error);
    return errorResponse(res, 'Failed to update medicine', 500);
  }
});

// Get medicine categories
router.get('/categories', checkModulePermission('pharmacy', 'view'), async (req, res) => {
  const categories = [
    'Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment',
    'Drops', 'Inhaler', 'Powder', 'Solution', 'Suspension', 'Gel', 'Lotion'
  ];
  return successResponse(res, { categories }, 'Categories retrieved');
});

// ═══════════════════════════════════════════════════════
// STOCK MANAGEMENT
// ═══════════════════════════════════════════════════════

router.post('/medicines/:id/stock', checkModulePermission('pharmacy', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { movementType, quantity, batchNumber, expiryDate, reference, notes } = req.body;

    if (!movementType || !quantity) {
      return errorResponse(res, 'Movement type and quantity are required', 400);
    }

    const medicine = await prisma.medicine.findUnique({ where: { id } });

    if (!medicine) {
      return errorResponse(res, 'Medicine not found', 404);
    }

    if (req.hospitalId && medicine.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Calculate new stock
    let newStock = medicine.stockQuantity;
    const qty = parseInt(quantity);

    if (['PURCHASE', 'RETURN'].includes(movementType)) {
      newStock += qty;
    } else if (['SALE', 'EXPIRED', 'TRANSFER'].includes(movementType)) {
      if (newStock < qty) {
        return errorResponse(res, 'Insufficient stock', 400);
      }
      newStock -= qty;
    } else if (movementType === 'ADJUSTMENT') {
      newStock = qty; // Direct adjustment
    }

    // Update stock and create movement record
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.medicineStockMovement.create({
        data: {
          medicineId: id,
          movementType,
          quantity: qty,
          batchNumber,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          reference,
          notes
        }
      });

      const updated = await tx.medicine.update({
        where: { id },
        data: {
          stockQuantity: newStock,
          batchNumber: batchNumber || medicine.batchNumber,
          expiryDate: expiryDate ? new Date(expiryDate) : medicine.expiryDate
        }
      });

      return { movement, medicine: updated };
    });

    return successResponse(res, result, 'Stock updated');
  } catch (error) {
    console.error('Update stock error:', error);
    return errorResponse(res, 'Failed to update stock', 500);
  }
});

router.get('/medicines/:id/movements', checkModulePermission('pharmacy', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const [movements, total] = await Promise.all([
      prisma.medicineStockMovement.findMany({
        where: { medicineId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.medicineStockMovement.count({ where: { medicineId: id } })
    ]);

    return successResponse(res,
      formatPaginatedResponse(movements, total, page, limit),
      'Stock movements retrieved'
    );
  } catch (error) {
    console.error('Get movements error:', error);
    return errorResponse(res, 'Failed to get stock movements', 500);
  }
});

// ═══════════════════════════════════════════════════════
// PRESCRIPTION DISPENSING
// ═══════════════════════════════════════════════════════

router.get('/prescriptions/pending', checkModulePermission('pharmacy', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const prescriptions = await prisma.prescription.findMany({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['PENDING', 'PARTIALLY_DISPENSED'] }
      },
      orderBy: { prescriptionDate: 'asc' },
      include: {
        patient: {
          select: {
            patientId: true,
            firstName: true,
            lastName: true,
            mobile: true
          }
        },
        consultation: {
          include: {
            doctor: {
              select: { name: true }
            }
          }
        },
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                stockQuantity: true,
                sellingPrice: true
              }
            }
          }
        }
      }
    });

    return successResponse(res, { prescriptions }, 'Pending prescriptions retrieved');
  } catch (error) {
    console.error('Get pending prescriptions error:', error);
    return errorResponse(res, 'Failed to get pending prescriptions', 500);
  }
});

router.post('/dispense', checkModulePermission('pharmacy', 'update'), async (req, res) => {
  try {
    const { prescriptionId, items } = req.body;

    if (!prescriptionId || !items || items.length === 0) {
      return errorResponse(res, 'Prescription ID and items are required', 400);
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { items: true }
    });

    if (!prescription) {
      return errorResponse(res, 'Prescription not found', 404);
    }

    if (req.hospitalId && prescription.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Validate stock and dispense
    const result = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const prescriptionItem = prescription.items.find(pi => pi.id === item.prescriptionItemId);
        if (!prescriptionItem) continue;

        const medicine = await tx.medicine.findUnique({
          where: { id: prescriptionItem.medicineId }
        });

        if (!medicine || medicine.stockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for ${medicine?.name || 'medicine'}`);
        }

        // Update prescription item
        await tx.prescriptionItem.update({
          where: { id: item.prescriptionItemId },
          data: {
            dispensedQty: { increment: item.quantity },
            dispensedById: req.user.id,
            dispensedAt: new Date()
          }
        });

        // Reduce medicine stock
        await tx.medicine.update({
          where: { id: medicine.id },
          data: {
            stockQuantity: { decrement: item.quantity }
          }
        });

        // Record stock movement
        await tx.medicineStockMovement.create({
          data: {
            medicineId: medicine.id,
            movementType: 'SALE',
            quantity: item.quantity,
            reference: prescription.prescriptionNumber,
            notes: `Dispensed for prescription ${prescription.prescriptionNumber}`
          }
        });
      }

      // Check if fully dispensed
      const updatedItems = await tx.prescriptionItem.findMany({
        where: { prescriptionId }
      });

      const allDispensed = updatedItems.every(item => item.dispensedQty >= item.quantity);
      const someDispensed = updatedItems.some(item => item.dispensedQty > 0);

      let status = 'PENDING';
      if (allDispensed) {
        status = 'DISPENSED';
      } else if (someDispensed) {
        status = 'PARTIALLY_DISPENSED';
      }

      const updatedPrescription = await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          status,
          dispensedAt: allDispensed ? new Date() : null
        },
        include: {
          items: {
            include: { medicine: true }
          }
        }
      });

      return updatedPrescription;
    });

    return successResponse(res, { prescription: result }, 'Medicines dispensed');
  } catch (error) {
    console.error('Dispense error:', error);
    return errorResponse(res, error.message || 'Failed to dispense medicines', 500);
  }
});

// ═══════════════════════════════════════════════════════
// ALERTS & REPORTS
// ═══════════════════════════════════════════════════════

router.get('/alerts', checkModulePermission('pharmacy', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);

    const [lowStock, expiring, expired] = await Promise.all([
      prisma.medicine.findMany({
        where: {
          hospitalId: req.hospitalId,
          isActive: true,
          stockQuantity: { lte: 10 } // Below reorder level
        },
        select: {
          id: true,
          medicineCode: true,
          name: true,
          stockQuantity: true,
          reorderLevel: true
        },
        orderBy: { stockQuantity: 'asc' }
      }),
      prisma.medicine.findMany({
        where: {
          hospitalId: req.hospitalId,
          isActive: true,
          expiryDate: { lte: threeMonths, gt: new Date() }
        },
        select: {
          id: true,
          medicineCode: true,
          name: true,
          expiryDate: true,
          stockQuantity: true
        },
        orderBy: { expiryDate: 'asc' }
      }),
      prisma.medicine.findMany({
        where: {
          hospitalId: req.hospitalId,
          isActive: true,
          expiryDate: { lte: new Date() }
        },
        select: {
          id: true,
          medicineCode: true,
          name: true,
          expiryDate: true,
          stockQuantity: true
        }
      })
    ]);

    return successResponse(res, {
      alerts: {
        lowStock,
        expiring,
        expired,
        counts: {
          lowStock: lowStock.length,
          expiring: expiring.length,
          expired: expired.length
        }
      }
    }, 'Alerts retrieved');
  } catch (error) {
    console.error('Get alerts error:', error);
    return errorResponse(res, 'Failed to get alerts', 500);
  }
});

module.exports = router;
