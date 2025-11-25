/**
 * Utility Helper Functions
 * Common functions used across the application
 */

const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════
// ID GENERATORS
// ═══════════════════════════════════════════════════════

/**
 * Generate hospital organization code (H101, H102, etc.)
 */
const generateOrganizationCode = async (prisma) => {
  const lastHospital = await prisma.hospital.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { organizationCode: true }
  });

  if (!lastHospital) {
    return 'H101';
  }

  const lastNumber = parseInt(lastHospital.organizationCode.substring(1));
  return `H${lastNumber + 1}`;
};

/**
 * Generate patient ID for a hospital (P001, P002, etc.)
 */
const generatePatientId = async (prisma, hospitalId) => {
  const lastPatient = await prisma.patient.findFirst({
    where: { hospitalId },
    orderBy: { createdAt: 'desc' },
    select: { patientId: true }
  });

  if (!lastPatient) {
    return 'P001';
  }

  const lastNumber = parseInt(lastPatient.patientId.substring(1));
  return `P${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate OPD token number for today (OPD001, OPD002, etc.)
 */
const generateOpdToken = async (prisma, hospitalId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const lastToken = await prisma.opdToken.findFirst({
    where: {
      hospitalId,
      tokenDate: {
        gte: today,
        lt: tomorrow
      }
    },
    orderBy: { createdAt: 'desc' },
    select: { tokenNumber: true }
  });

  if (!lastToken) {
    return 'OPD001';
  }

  const lastNumber = parseInt(lastToken.tokenNumber.substring(3));
  return `OPD${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate bill number (BILL-YYYYMMDD-001)
 */
const generateBillNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastBill = await prisma.bill.findFirst({
    where: {
      hospitalId,
      billNumber: { startsWith: `BILL-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { billNumber: true }
  });

  if (!lastBill) {
    return `BILL-${dateStr}-001`;
  }

  const parts = lastBill.billNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `BILL-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate lab order number (LAB-YYYYMMDD-001)
 */
const generateLabOrderNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastOrder = await prisma.labOrder.findFirst({
    where: {
      hospitalId,
      orderNumber: { startsWith: `LAB-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { orderNumber: true }
  });

  if (!lastOrder) {
    return `LAB-${dateStr}-001`;
  }

  const parts = lastOrder.orderNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `LAB-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate radiology order number (RAD-YYYYMMDD-001)
 */
const generateRadiologyOrderNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastOrder = await prisma.radiologyOrder.findFirst({
    where: {
      hospitalId,
      orderNumber: { startsWith: `RAD-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { orderNumber: true }
  });

  if (!lastOrder) {
    return `RAD-${dateStr}-001`;
  }

  const parts = lastOrder.orderNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `RAD-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate prescription number (RX-YYYYMMDD-001)
 */
const generatePrescriptionNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastRx = await prisma.prescription.findFirst({
    where: {
      hospitalId,
      prescriptionNumber: { startsWith: `RX-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { prescriptionNumber: true }
  });

  if (!lastRx) {
    return `RX-${dateStr}-001`;
  }

  const parts = lastRx.prescriptionNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `RX-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate consultation number (CON-YYYYMMDD-001)
 */
const generateConsultationNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastCon = await prisma.consultation.findFirst({
    where: {
      hospitalId,
      consultationNumber: { startsWith: `CON-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { consultationNumber: true }
  });

  if (!lastCon) {
    return `CON-${dateStr}-001`;
  }

  const parts = lastCon.consultationNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `CON-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate admission number (ADM-YYYYMMDD-001)
 */
const generateAdmissionNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastAdm = await prisma.admission.findFirst({
    where: {
      hospitalId,
      admissionNumber: { startsWith: `ADM-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { admissionNumber: true }
  });

  if (!lastAdm) {
    return `ADM-${dateStr}-001`;
  }

  const parts = lastAdm.admissionNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `ADM-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

/**
 * Generate purchase order number (PO-YYYYMMDD-001)
 */
const generatePoNumber = async (prisma, hospitalId) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const lastPo = await prisma.purchaseOrder.findFirst({
    where: {
      hospitalId,
      poNumber: { startsWith: `PO-${dateStr}` }
    },
    orderBy: { createdAt: 'desc' },
    select: { poNumber: true }
  });

  if (!lastPo) {
    return `PO-${dateStr}-001`;
  }

  const parts = lastPo.poNumber.split('-');
  const lastNumber = parseInt(parts[2]);
  return `PO-${dateStr}-${String(lastNumber + 1).padStart(3, '0')}`;
};

// ═══════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate Indian mobile number
 */
const isValidMobile = (mobile) => {
  const mobileRegex = /^[6-9]\d{9}$/;
  return mobileRegex.test(mobile);
};

/**
 * Validate date format (YYYY-MM-DD)
 */
const isValidDate = (dateStr) => {
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
};

// ═══════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Get start of today
 */
const getStartOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

/**
 * Get end of today
 */
const getEndOfToday = () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
};

/**
 * Format date to Indian format (DD/MM/YYYY)
 */
const formatDateIndian = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Format datetime to Indian format (DD/MM/YYYY HH:mm)
 */
const formatDateTimeIndian = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// ═══════════════════════════════════════════════════════
// PAGINATION HELPER
// ═══════════════════════════════════════════════════════

/**
 * Parse pagination parameters
 */
const getPagination = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Format pagination response
 */
const formatPaginatedResponse = (data, total, page, limit) => {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total
    }
  };
};

// ═══════════════════════════════════════════════════════
// RESPONSE HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Success response
 */
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    ...data
  });
};

/**
 * Error response
 */
const errorResponse = (res, message, statusCode = 400, errors = null) => {
  const response = {
    success: false,
    error: message
  };
  if (errors) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
};

module.exports = {
  // ID Generators
  generateOrganizationCode,
  generatePatientId,
  generateOpdToken,
  generateBillNumber,
  generateLabOrderNumber,
  generateRadiologyOrderNumber,
  generatePrescriptionNumber,
  generateConsultationNumber,
  generateAdmissionNumber,
  generatePoNumber,

  // Validation
  isValidEmail,
  isValidMobile,
  isValidDate,

  // Date helpers
  getStartOfToday,
  getEndOfToday,
  formatDateIndian,
  formatDateTimeIndian,

  // Pagination
  getPagination,
  formatPaginatedResponse,

  // Response
  successResponse,
  errorResponse
};
