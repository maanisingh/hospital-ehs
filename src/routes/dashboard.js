/**
 * Dashboard Routes
 * Statistics, Analytics, Reports for Different Roles
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope } = require('../middleware/auth');
const { errorResponse, successResponse, getStartOfToday, getEndOfToday } = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// MAIN DASHBOARD (Role-based)
// ═══════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const { role, hospitalId } = req.user;

    if (role === 'SUPERADMIN') {
      return getSuperadminDashboard(req, res);
    }

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    switch (role) {
      case 'HOSPITAL_ADMIN':
        return getAdminDashboard(req, res);
      case 'DOCTOR':
        return getDoctorDashboard(req, res);
      case 'RECEPTION':
        return getReceptionDashboard(req, res);
      case 'LAB_TECHNICIAN':
        return getLabDashboard(req, res);
      case 'RADIOLOGY_TECHNICIAN':
        return getRadiologyDashboard(req, res);
      case 'PHARMACIST':
        return getPharmacyDashboard(req, res);
      case 'BILLING_STAFF':
        return getBillingDashboard(req, res);
      case 'NURSE':
        return getNurseDashboard(req, res);
      default:
        return getBasicDashboard(req, res);
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    return errorResponse(res, 'Failed to load dashboard', 500);
  }
});

// ═══════════════════════════════════════════════════════
// SUPERADMIN DASHBOARD
// ═══════════════════════════════════════════════════════

async function getSuperadminDashboard(req, res) {
  const [
    totalHospitals,
    activeHospitals,
    totalUsers,
    totalPatients,
    recentHospitals,
    expiringSubscriptions
  ] = await Promise.all([
    prisma.hospital.count(),
    prisma.hospital.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.patient.count(),
    prisma.hospital.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        _count: {
          select: { users: true, patients: true }
        }
      }
    }),
    prisma.hospital.findMany({
      where: {
        isActive: true,
        subscriptionExpiry: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      },
      orderBy: { subscriptionExpiry: 'asc' },
      take: 10
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        totalHospitals,
        activeHospitals,
        inactiveHospitals: totalHospitals - activeHospitals,
        totalUsers,
        totalPatients
      },
      recentHospitals,
      expiringSubscriptions
    }
  }, 'Superadmin dashboard');
}

// ═══════════════════════════════════════════════════════
// HOSPITAL ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════

async function getAdminDashboard(req, res) {
  const today = getStartOfToday();
  const tomorrow = getEndOfToday();

  const [
    totalPatients,
    todayPatients,
    totalDoctors,
    totalStaff,
    todayOpdTokens,
    todayRevenue,
    pendingBills,
    bedOccupancy,
    lowStockMedicines
  ] = await Promise.all([
    prisma.patient.count({ where: { hospitalId: req.hospitalId } }),
    prisma.patient.count({
      where: {
        hospitalId: req.hospitalId,
        createdAt: { gte: today }
      }
    }),
    prisma.doctor.count({ where: { hospitalId: req.hospitalId } }),
    prisma.user.count({ where: { hospitalId: req.hospitalId } }),
    prisma.opdToken.count({
      where: {
        hospitalId: req.hospitalId,
        tokenDate: { gte: today, lte: tomorrow }
      }
    }),
    prisma.bill.aggregate({
      where: {
        hospitalId: req.hospitalId,
        billDate: { gte: today, lte: tomorrow },
        status: { in: ['PAID', 'PARTIALLY_PAID'] }
      },
      _sum: { paidAmount: true }
    }),
    prisma.bill.count({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['PENDING', 'PARTIALLY_PAID'] }
      }
    }),
    prisma.bed.groupBy({
      by: ['status'],
      where: { hospitalId: req.hospitalId, isActive: true },
      _count: true
    }),
    prisma.medicine.count({
      where: {
        hospitalId: req.hospitalId,
        isActive: true,
        stockQuantity: { lte: 10 }
      }
    })
  ]);

  // Calculate bed occupancy
  const beds = {
    total: bedOccupancy.reduce((sum, b) => sum + b._count, 0),
    occupied: bedOccupancy.find(b => b.status === 'OCCUPIED')?._count || 0
  };
  beds.available = beds.total - beds.occupied;
  beds.percentage = beds.total > 0 ? Math.round((beds.occupied / beds.total) * 100) : 0;

  return successResponse(res, {
    dashboard: {
      stats: {
        totalPatients,
        todayPatients,
        totalDoctors,
        totalStaff,
        todayOpdTokens,
        todayRevenue: todayRevenue._sum.paidAmount || 0,
        pendingBills,
        bedOccupancy: beds,
        lowStockMedicines
      }
    }
  }, 'Admin dashboard');
}

// ═══════════════════════════════════════════════════════
// DOCTOR DASHBOARD
// ═══════════════════════════════════════════════════════

async function getDoctorDashboard(req, res) {
  const today = getStartOfToday();
  const tomorrow = getEndOfToday();

  // Get doctor record
  const doctor = await prisma.doctor.findFirst({
    where: { userId: req.user.id }
  });

  if (!doctor) {
    return getBasicDashboard(req, res);
  }

  const [
    todayTokens,
    waitingPatients,
    completedToday,
    todayConsultations,
    recentPatients,
    pendingLabResults
  ] = await Promise.all([
    prisma.opdToken.count({
      where: {
        doctorId: doctor.id,
        tokenDate: { gte: today, lte: tomorrow }
      }
    }),
    prisma.opdToken.count({
      where: {
        doctorId: doctor.id,
        tokenDate: { gte: today, lte: tomorrow },
        status: 'WAITING'
      }
    }),
    prisma.opdToken.count({
      where: {
        doctorId: doctor.id,
        tokenDate: { gte: today, lte: tomorrow },
        status: 'COMPLETED'
      }
    }),
    prisma.consultation.findMany({
      where: {
        doctorId: req.user.id,
        consultationDate: { gte: today, lte: tomorrow }
      },
      include: {
        patient: {
          select: {
            patientId: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { consultationDate: 'desc' },
      take: 10
    }),
    prisma.consultation.findMany({
      where: { doctorId: req.user.id },
      include: {
        patient: {
          select: {
            patientId: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { consultationDate: 'desc' },
      take: 5
    }),
    prisma.labOrder.count({
      where: {
        consultation: { doctorId: req.user.id },
        status: { in: ['PAID', 'SAMPLE_COLLECTED', 'IN_PROGRESS'] }
      }
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        todayTokens,
        waitingPatients,
        completedToday,
        pendingLabResults
      },
      todayConsultations,
      recentPatients
    }
  }, 'Doctor dashboard');
}

// ═══════════════════════════════════════════════════════
// RECEPTION DASHBOARD
// ═══════════════════════════════════════════════════════

async function getReceptionDashboard(req, res) {
  const today = getStartOfToday();
  const tomorrow = getEndOfToday();

  const [
    todayRegistrations,
    todayOpdTokens,
    waitingPatients,
    availableDoctors
  ] = await Promise.all([
    prisma.patient.count({
      where: {
        hospitalId: req.hospitalId,
        createdAt: { gte: today }
      }
    }),
    prisma.opdToken.count({
      where: {
        hospitalId: req.hospitalId,
        tokenDate: { gte: today, lte: tomorrow }
      }
    }),
    prisma.opdToken.count({
      where: {
        hospitalId: req.hospitalId,
        tokenDate: { gte: today, lte: tomorrow },
        status: 'WAITING'
      }
    }),
    prisma.doctor.count({
      where: {
        hospitalId: req.hospitalId,
        isAvailable: true
      }
    })
  ]);

  // Get queue by department
  const queueByDept = await prisma.opdToken.groupBy({
    by: ['departmentId'],
    where: {
      hospitalId: req.hospitalId,
      tokenDate: { gte: today, lte: tomorrow },
      status: 'WAITING'
    },
    _count: true
  });

  return successResponse(res, {
    dashboard: {
      stats: {
        todayRegistrations,
        todayOpdTokens,
        waitingPatients,
        availableDoctors
      },
      queueByDepartment: queueByDept
    }
  }, 'Reception dashboard');
}

// ═══════════════════════════════════════════════════════
// LAB DASHBOARD
// ═══════════════════════════════════════════════════════

async function getLabDashboard(req, res) {
  const today = getStartOfToday();
  const tomorrow = getEndOfToday();

  const [
    pendingPayment,
    samplesPending,
    inProgress,
    completedToday,
    urgentOrders
  ] = await Promise.all([
    prisma.labOrder.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'PENDING_PAYMENT'
      }
    }),
    prisma.labOrder.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'PAID'
      }
    }),
    prisma.labOrder.count({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['SAMPLE_COLLECTED', 'IN_PROGRESS'] }
      }
    }),
    prisma.labOrder.count({
      where: {
        hospitalId: req.hospitalId,
        completedAt: { gte: today, lte: tomorrow }
      }
    }),
    prisma.labOrder.count({
      where: {
        hospitalId: req.hospitalId,
        urgency: { in: ['URGENT', 'STAT'] },
        status: { notIn: ['COMPLETED', 'CANCELLED'] }
      }
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        pendingPayment,
        samplesPending,
        inProgress,
        completedToday,
        urgentOrders
      }
    }
  }, 'Lab dashboard');
}

// ═══════════════════════════════════════════════════════
// RADIOLOGY DASHBOARD
// ═══════════════════════════════════════════════════════

async function getRadiologyDashboard(req, res) {
  const today = getStartOfToday();
  const tomorrow = getEndOfToday();

  const [
    pendingPayment,
    scheduled,
    inProgress,
    completedToday,
    urgentOrders
  ] = await Promise.all([
    prisma.radiologyOrder.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'PENDING_PAYMENT'
      }
    }),
    prisma.radiologyOrder.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'SCHEDULED'
      }
    }),
    prisma.radiologyOrder.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'IN_PROGRESS'
      }
    }),
    prisma.radiologyOrder.count({
      where: {
        hospitalId: req.hospitalId,
        completedAt: { gte: today, lte: tomorrow }
      }
    }),
    prisma.radiologyOrder.count({
      where: {
        hospitalId: req.hospitalId,
        urgency: { in: ['URGENT', 'STAT'] },
        status: { notIn: ['COMPLETED', 'CANCELLED'] }
      }
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        pendingPayment,
        scheduled,
        inProgress,
        completedToday,
        urgentOrders
      }
    }
  }, 'Radiology dashboard');
}

// ═══════════════════════════════════════════════════════
// PHARMACY DASHBOARD
// ═══════════════════════════════════════════════════════

async function getPharmacyDashboard(req, res) {
  const [
    pendingPrescriptions,
    dispensedToday,
    lowStockItems,
    expiringItems,
    expiredItems
  ] = await Promise.all([
    prisma.prescription.count({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['PENDING', 'PARTIALLY_DISPENSED'] }
      }
    }),
    prisma.prescription.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'DISPENSED',
        dispensedAt: { gte: getStartOfToday() }
      }
    }),
    prisma.medicine.count({
      where: {
        hospitalId: req.hospitalId,
        isActive: true,
        stockQuantity: { lte: 10 }
      }
    }),
    prisma.medicine.count({
      where: {
        hospitalId: req.hospitalId,
        isActive: true,
        expiryDate: {
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          gt: new Date()
        }
      }
    }),
    prisma.medicine.count({
      where: {
        hospitalId: req.hospitalId,
        isActive: true,
        expiryDate: { lte: new Date() }
      }
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        pendingPrescriptions,
        dispensedToday,
        lowStockItems,
        expiringItems,
        expiredItems
      }
    }
  }, 'Pharmacy dashboard');
}

// ═══════════════════════════════════════════════════════
// BILLING DASHBOARD
// ═══════════════════════════════════════════════════════

async function getBillingDashboard(req, res) {
  const today = getStartOfToday();
  const tomorrow = getEndOfToday();

  const [
    todayBills,
    pendingBills,
    todayRevenue,
    todayPayments,
    paymentMethods
  ] = await Promise.all([
    prisma.bill.count({
      where: {
        hospitalId: req.hospitalId,
        billDate: { gte: today, lte: tomorrow }
      }
    }),
    prisma.bill.count({
      where: {
        hospitalId: req.hospitalId,
        status: { in: ['PENDING', 'PARTIALLY_PAID'] }
      }
    }),
    prisma.bill.aggregate({
      where: {
        hospitalId: req.hospitalId,
        billDate: { gte: today, lte: tomorrow },
        status: { in: ['PAID', 'PARTIALLY_PAID'] }
      },
      _sum: { paidAmount: true }
    }),
    prisma.payment.count({
      where: {
        bill: { hospitalId: req.hospitalId },
        paymentDate: { gte: today, lte: tomorrow }
      }
    }),
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        bill: { hospitalId: req.hospitalId },
        paymentDate: { gte: today, lte: tomorrow }
      },
      _sum: { amount: true },
      _count: true
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        todayBills,
        pendingBills,
        todayRevenue: todayRevenue._sum.paidAmount || 0,
        todayPayments
      },
      paymentMethods
    }
  }, 'Billing dashboard');
}

// ═══════════════════════════════════════════════════════
// NURSE DASHBOARD
// ═══════════════════════════════════════════════════════

async function getNurseDashboard(req, res) {
  const [
    currentAdmissions,
    pendingMedications,
    criticalPatients,
    recentNotes
  ] = await Promise.all([
    prisma.admission.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'ADMITTED'
      }
    }),
    prisma.medicationSchedule.count({
      where: {
        admission: { hospitalId: req.hospitalId },
        status: 'ACTIVE'
      }
    }),
    prisma.admission.count({
      where: {
        hospitalId: req.hospitalId,
        status: 'ADMITTED',
        bed: { bedType: 'ICU' }
      }
    }),
    prisma.nursingNote.findMany({
      where: {
        admission: { hospitalId: req.hospitalId }
      },
      include: {
        admission: {
          include: {
            patient: {
              select: {
                patientId: true,
                firstName: true,
                lastName: true
              }
            },
            bed: {
              select: { bedNumber: true, ward: true }
            }
          }
        }
      },
      orderBy: { recordedAt: 'desc' },
      take: 10
    })
  ]);

  return successResponse(res, {
    dashboard: {
      stats: {
        currentAdmissions,
        pendingMedications,
        criticalPatients
      },
      recentNotes
    }
  }, 'Nurse dashboard');
}

// ═══════════════════════════════════════════════════════
// BASIC DASHBOARD (Default)
// ═══════════════════════════════════════════════════════

async function getBasicDashboard(req, res) {
  return successResponse(res, {
    dashboard: {
      message: 'Welcome to MedicarePro Hospital Management System',
      role: req.user.role
    }
  }, 'Dashboard');
}

module.exports = router;
