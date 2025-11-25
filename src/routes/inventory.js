/**
 * Inventory Management Routes
 * General Inventory, Purchase Orders, Vendors
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generatePoNumber,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// INVENTORY ITEMS
// ═══════════════════════════════════════════════════════

router.get('/items', checkModulePermission('inventory', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, category, lowStock, isActive } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { itemCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      prisma.inventoryItem.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(items, total, page, limit),
      'Inventory items retrieved'
    );
  } catch (error) {
    console.error('Get inventory items error:', error);
    return errorResponse(res, 'Failed to get inventory items', 500);
  }
});

router.post('/items', checkModulePermission('inventory', 'create'), async (req, res) => {
  try {
    const { itemCode, name, category, description, unit, stockQuantity, reorderLevel, unitCost, location } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!itemCode || !name || !category || !unitCost) {
      return errorResponse(res, 'Item code, name, category, and unit cost are required', 400);
    }

    const item = await prisma.inventoryItem.create({
      data: {
        hospitalId: req.hospitalId,
        itemCode,
        name,
        category,
        description,
        unit: unit || 'Unit',
        stockQuantity: stockQuantity || 0,
        reorderLevel: reorderLevel || 10,
        unitCost: parseFloat(unitCost),
        location,
        isActive: true
      }
    });

    if (stockQuantity > 0) {
      await prisma.inventoryStockMovement.create({
        data: {
          itemId: item.id,
          movementType: 'PURCHASE',
          quantity: stockQuantity,
          reference: 'Initial Stock',
          notes: 'Initial inventory entry'
        }
      });
    }

    return successResponse(res, { item }, 'Inventory item created', 201);
  } catch (error) {
    console.error('Create inventory item error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Item code already exists', 400);
    }
    return errorResponse(res, 'Failed to create inventory item', 500);
  }
});

router.put('/items/:id', checkModulePermission('inventory', 'update'), async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.inventoryItem.findUnique({ where: { id } });

    if (!item) {
      return errorResponse(res, 'Item not found', 404);
    }

    if (req.hospitalId && item.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.hospitalId;
    delete updateData.itemCode;
    delete updateData.createdAt;

    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, { item: updated }, 'Inventory item updated');
  } catch (error) {
    console.error('Update inventory item error:', error);
    return errorResponse(res, 'Failed to update inventory item', 500);
  }
});

// Stock adjustment
router.post('/items/:id/stock', checkModulePermission('inventory', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { movementType, quantity, reference, notes } = req.body;

    if (!movementType || !quantity) {
      return errorResponse(res, 'Movement type and quantity are required', 400);
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id } });

    if (!item) {
      return errorResponse(res, 'Item not found', 404);
    }

    if (req.hospitalId && item.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    let newStock = item.stockQuantity;
    const qty = parseInt(quantity);

    if (['PURCHASE', 'RETURN'].includes(movementType)) {
      newStock += qty;
    } else if (['SALE', 'EXPIRED', 'TRANSFER'].includes(movementType)) {
      if (newStock < qty) {
        return errorResponse(res, 'Insufficient stock', 400);
      }
      newStock -= qty;
    } else if (movementType === 'ADJUSTMENT') {
      newStock = qty;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.inventoryStockMovement.create({
        data: {
          itemId: id,
          movementType,
          quantity: qty,
          reference,
          notes
        }
      });

      const updated = await tx.inventoryItem.update({
        where: { id },
        data: { stockQuantity: newStock }
      });

      return updated;
    });

    return successResponse(res, { item: result }, 'Stock updated');
  } catch (error) {
    console.error('Update stock error:', error);
    return errorResponse(res, 'Failed to update stock', 500);
  }
});

// ═══════════════════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════════════════

router.get('/vendors', checkModulePermission('inventory', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, isActive } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { vendorCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      prisma.vendor.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(vendors, total, page, limit),
      'Vendors retrieved'
    );
  } catch (error) {
    console.error('Get vendors error:', error);
    return errorResponse(res, 'Failed to get vendors', 500);
  }
});

router.post('/vendors', checkModulePermission('inventory', 'create'), async (req, res) => {
  try {
    const { vendorCode, name, contactPerson, email, phone, address, gstNumber, paymentTerms } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!vendorCode || !name) {
      return errorResponse(res, 'Vendor code and name are required', 400);
    }

    const vendor = await prisma.vendor.create({
      data: {
        hospitalId: req.hospitalId,
        vendorCode,
        name,
        contactPerson,
        email,
        phone,
        address,
        gstNumber,
        paymentTerms,
        isActive: true
      }
    });

    return successResponse(res, { vendor }, 'Vendor created', 201);
  } catch (error) {
    console.error('Create vendor error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Vendor code already exists', 400);
    }
    return errorResponse(res, 'Failed to create vendor', 500);
  }
});

// ═══════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════

router.get('/purchase-orders', checkModulePermission('inventory', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { vendorId, status, dateFrom, dateTo } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.orderDate = {};
      if (dateFrom) where.orderDate.gte = new Date(dateFrom);
      if (dateTo) where.orderDate.lte = new Date(dateTo);
    }

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          vendor: true,
          items: {
            include: { item: true }
          }
        }
      }),
      prisma.purchaseOrder.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(orders, total, page, limit),
      'Purchase orders retrieved'
    );
  } catch (error) {
    console.error('Get purchase orders error:', error);
    return errorResponse(res, 'Failed to get purchase orders', 500);
  }
});

router.post('/purchase-orders', checkModulePermission('inventory', 'create'), async (req, res) => {
  try {
    const { vendorId, items, expectedDate, notes } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!vendorId || !items || items.length === 0) {
      return errorResponse(res, 'Vendor ID and at least one item are required', 400);
    }

    const totalAmount = items.reduce((sum, item) =>
      sum + (parseFloat(item.unitPrice) * parseInt(item.quantity)), 0);

    const poNumber = await generatePoNumber(prisma, req.hospitalId);

    const order = await prisma.purchaseOrder.create({
      data: {
        hospitalId: req.hospitalId,
        vendorId,
        poNumber,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status: 'DRAFT',
        totalAmount,
        notes,
        items: {
          create: items.map(item => ({
            itemId: item.itemId,
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice)
          }))
        }
      },
      include: {
        vendor: true,
        items: {
          include: { item: true }
        }
      }
    });

    return successResponse(res, { order }, 'Purchase order created', 201);
  } catch (error) {
    console.error('Create purchase order error:', error);
    return errorResponse(res, 'Failed to create purchase order', 500);
  }
});

router.patch('/purchase-orders/:id/status', checkModulePermission('inventory', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res, 'Valid status required', 400);
    }

    const order = await prisma.purchaseOrder.findUnique({ where: { id } });

    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    if (req.hospitalId && order.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { status }
    });

    return successResponse(res, { order: updated }, 'Order status updated');
  } catch (error) {
    console.error('Update order status error:', error);
    return errorResponse(res, 'Failed to update order status', 500);
  }
});

// Receive goods
router.post('/purchase-orders/:id/receive', checkModulePermission('inventory', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return errorResponse(res, 'Items to receive are required', 400);
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    if (req.hospitalId && order.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const receiveItem of items) {
        const orderItem = order.items.find(oi => oi.id === receiveItem.orderItemId);
        if (!orderItem) continue;

        const receivedQty = parseInt(receiveItem.quantity);

        // Update order item
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { receivedQty: { increment: receivedQty } }
        });

        // Update inventory
        await tx.inventoryItem.update({
          where: { id: orderItem.itemId },
          data: { stockQuantity: { increment: receivedQty } }
        });

        // Record movement
        await tx.inventoryStockMovement.create({
          data: {
            itemId: orderItem.itemId,
            movementType: 'PURCHASE',
            quantity: receivedQty,
            reference: order.poNumber,
            notes: `Received from PO ${order.poNumber}`
          }
        });
      }

      // Check if fully received
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id }
      });

      const allReceived = updatedItems.every(item => item.receivedQty >= item.quantity);
      const someReceived = updatedItems.some(item => item.receivedQty > 0);

      let status = order.status;
      if (allReceived) {
        status = 'RECEIVED';
      } else if (someReceived) {
        status = 'PARTIALLY_RECEIVED';
      }

      return await tx.purchaseOrder.update({
        where: { id },
        data: { status },
        include: {
          vendor: true,
          items: { include: { item: true } }
        }
      });
    });

    return successResponse(res, { order: result }, 'Goods received');
  } catch (error) {
    console.error('Receive goods error:', error);
    return errorResponse(res, 'Failed to receive goods', 500);
  }
});

// Inventory categories
router.get('/categories', checkModulePermission('inventory', 'view'), async (req, res) => {
  const categories = [
    'Medical Supplies',
    'Surgical Instruments',
    'Laboratory Equipment',
    'Office Supplies',
    'Cleaning Supplies',
    'Furniture',
    'IT Equipment',
    'Maintenance',
    'Other'
  ];
  return successResponse(res, { categories }, 'Categories retrieved');
});

module.exports = router;
