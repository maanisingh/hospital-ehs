/**
 * IPD (In-Patient Department) Routes
 * Bed Management, Admissions, Nursing Notes, Discharge
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generateAdmissionNumber,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// BED MANAGEMENT
// ═══════════════════════════════════════════════════════

router.get('/beds', checkModulePermission('ipd', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { ward, status, bedType } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (ward) where.ward = ward;
    if (status) where.status = status;
    if (bedType) where.bedType = bedType;

    const [beds, total] = await Promise.all([
      prisma.bed.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ ward: 'asc' }, { bedNumber: 'asc' }],
        include: {
          admissions: {
            where: { status: 'ADMITTED' },
            include: {
              patient: {
                select: {
                  patientId: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      }),
      prisma.bed.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(beds, total, page, limit),
      'Beds retrieved'
    );
  } catch (error) {
    console.error('Get beds error:', error);
    return errorResponse(res, 'Failed to get beds', 500);
  }
});

router.get('/beds/overview', checkModulePermission('ipd', 'view'), async (req, res) => {
  try {
    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const beds = await prisma.bed.groupBy({
      by: ['ward', 'status'],
      where: { hospitalId: req.hospitalId, isActive: true },
      _count: true
    });

    // Transform into ward-wise summary
    const wardSummary = {};
    beds.forEach(bed => {
      if (!wardSummary[bed.ward]) {
        wardSummary[bed.ward] = { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0 };
      }
      wardSummary[bed.ward].total += bed._count;
      wardSummary[bed.ward][bed.status.toLowerCase()] = bed._count;
    });

    const totals = await prisma.bed.aggregate({
      where: { hospitalId: req.hospitalId, isActive: true },
      _count: true
    });

    const available = await prisma.bed.count({
      where: { hospitalId: req.hospitalId, isActive: true, status: 'AVAILABLE' }
    });

    return successResponse(res, {
      overview: {
        total: totals._count,
        available,
        occupied: totals._count - available,
        byWard: wardSummary
      }
    }, 'Bed overview retrieved');
  } catch (error) {
    console.error('Get bed overview error:', error);
    return errorResponse(res, 'Failed to get bed overview', 500);
  }
});

router.post('/beds', checkModulePermission('ipd', 'create'), async (req, res) => {
  try {
    const { bedNumber, ward, roomNumber, bedType, dailyRate } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!bedNumber || !ward || !dailyRate) {
      return errorResponse(res, 'Bed number, ward, and daily rate are required', 400);
    }

    const bed = await prisma.bed.create({
      data: {
        hospitalId: req.hospitalId,
        bedNumber,
        ward,
        roomNumber,
        bedType: bedType || 'GENERAL',
        dailyRate: parseFloat(dailyRate),
        status: 'AVAILABLE',
        isActive: true
      }
    });

    return successResponse(res, { bed }, 'Bed created', 201);
  } catch (error) {
    console.error('Create bed error:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 'Bed number already exists', 400);
    }
    return errorResponse(res, 'Failed to create bed', 500);
  }
});

router.patch('/beds/:id/status', checkModulePermission('ipd', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];

    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res, 'Valid status required', 400);
    }

    const bed = await prisma.bed.findUnique({ where: { id } });

    if (!bed) {
      return errorResponse(res, 'Bed not found', 404);
    }

    if (req.hospitalId && bed.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updated = await prisma.bed.update({
      where: { id },
      data: { status }
    });

    return successResponse(res, { bed: updated }, 'Bed status updated');
  } catch (error) {
    console.error('Update bed status error:', error);
    return errorResponse(res, 'Failed to update bed status', 500);
  }
});

// ═══════════════════════════════════════════════════════
// ADMISSIONS
// ═══════════════════════════════════════════════════════

router.get('/admissions', checkModulePermission('ipd', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { patientId, status, dateFrom, dateTo } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (patientId) where.patientId = patientId;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.admissionDate = {};
      if (dateFrom) where.admissionDate.gte = new Date(dateFrom);
      if (dateTo) where.admissionDate.lte = new Date(dateTo);
    }

    const [admissions, total] = await Promise.all([
      prisma.admission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { admissionDate: 'desc' },
        include: {
          patient: true,
          bed: true,
          nursingNotes: {
            orderBy: { recordedAt: 'desc' },
            take: 5
          }
        }
      }),
      prisma.admission.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(admissions, total, page, limit),
      'Admissions retrieved'
    );
  } catch (error) {
    console.error('Get admissions error:', error);
    return errorResponse(res, 'Failed to get admissions', 500);
  }
});

router.get('/admissions/:id', checkModulePermission('ipd', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const admission = await prisma.admission.findUnique({
      where: { id },
      include: {
        patient: true,
        bed: true,
        nursingNotes: {
          orderBy: { recordedAt: 'desc' }
        },
        medicationSchedules: {
          include: {
            administrations: {
              orderBy: { administeredAt: 'desc' }
            }
          }
        }
      }
    });

    if (!admission) {
      return errorResponse(res, 'Admission not found', 404);
    }

    if (req.hospitalId && admission.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { admission }, 'Admission retrieved');
  } catch (error) {
    console.error('Get admission error:', error);
    return errorResponse(res, 'Failed to get admission', 500);
  }
});

router.post('/admissions', checkModulePermission('ipd', 'create'), async (req, res) => {
  try {
    const { patientId, bedId, admittingDoctorId, diagnosis, expectedDischarge } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!patientId || !bedId || !admittingDoctorId) {
      return errorResponse(res, 'Patient ID, bed ID, and admitting doctor ID are required', 400);
    }

    // Check if bed is available
    const bed = await prisma.bed.findUnique({ where: { id: bedId } });

    if (!bed || bed.status !== 'AVAILABLE') {
      return errorResponse(res, 'Bed not available', 400);
    }

    const admissionNumber = await generateAdmissionNumber(prisma, req.hospitalId);

    const admission = await prisma.$transaction(async (tx) => {
      // Create admission
      const newAdmission = await tx.admission.create({
        data: {
          hospitalId: req.hospitalId,
          patientId,
          bedId,
          admissionNumber,
          admittingDoctorId,
          diagnosis,
          expectedDischarge: expectedDischarge ? new Date(expectedDischarge) : null,
          status: 'ADMITTED'
        },
        include: {
          patient: true,
          bed: true
        }
      });

      // Update bed status
      await tx.bed.update({
        where: { id: bedId },
        data: { status: 'OCCUPIED' }
      });

      return newAdmission;
    });

    return successResponse(res, { admission }, 'Patient admitted', 201);
  } catch (error) {
    console.error('Create admission error:', error);
    return errorResponse(res, 'Failed to create admission', 500);
  }
});

// ═══════════════════════════════════════════════════════
// NURSING NOTES
// ═══════════════════════════════════════════════════════

router.post('/admissions/:id/notes', checkModulePermission('ipd', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { noteType, content } = req.body;

    if (!noteType || !content) {
      return errorResponse(res, 'Note type and content are required', 400);
    }

    const admission = await prisma.admission.findUnique({ where: { id } });

    if (!admission) {
      return errorResponse(res, 'Admission not found', 404);
    }

    if (req.hospitalId && admission.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const note = await prisma.nursingNote.create({
      data: {
        admissionId: id,
        noteType,
        content,
        recordedById: req.user.id
      }
    });

    return successResponse(res, { note }, 'Nursing note added', 201);
  } catch (error) {
    console.error('Add nursing note error:', error);
    return errorResponse(res, 'Failed to add nursing note', 500);
  }
});

// ═══════════════════════════════════════════════════════
// MEDICATION SCHEDULES
// ═══════════════════════════════════════════════════════

router.post('/admissions/:id/medications', checkModulePermission('ipd', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { medicineName, dosage, frequency, startDate, endDate, notes } = req.body;

    if (!medicineName || !dosage || !frequency) {
      return errorResponse(res, 'Medicine name, dosage, and frequency are required', 400);
    }

    const admission = await prisma.admission.findUnique({ where: { id } });

    if (!admission) {
      return errorResponse(res, 'Admission not found', 404);
    }

    if (req.hospitalId && admission.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const schedule = await prisma.medicationSchedule.create({
      data: {
        admissionId: id,
        medicineName,
        dosage,
        frequency,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        notes,
        status: 'ACTIVE'
      }
    });

    return successResponse(res, { schedule }, 'Medication schedule created', 201);
  } catch (error) {
    console.error('Create medication schedule error:', error);
    return errorResponse(res, 'Failed to create medication schedule', 500);
  }
});

router.post('/medications/:scheduleId/administer', checkModulePermission('ipd', 'update'), async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['GIVEN', 'MISSED', 'REFUSED', 'HELD'];

    if (!status || !validStatuses.includes(status)) {
      return errorResponse(res, 'Valid status required', 400);
    }

    const schedule = await prisma.medicationSchedule.findUnique({
      where: { id: scheduleId },
      include: { admission: true }
    });

    if (!schedule) {
      return errorResponse(res, 'Schedule not found', 404);
    }

    if (req.hospitalId && schedule.admission.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const administration = await prisma.medicationAdministration.create({
      data: {
        scheduleId,
        administeredAt: new Date(),
        administeredById: req.user.id,
        status,
        notes
      }
    });

    return successResponse(res, { administration }, 'Medication administered');
  } catch (error) {
    console.error('Administer medication error:', error);
    return errorResponse(res, 'Failed to record administration', 500);
  }
});

// ═══════════════════════════════════════════════════════
// DISCHARGE
// ═══════════════════════════════════════════════════════

router.post('/admissions/:id/discharge', checkModulePermission('ipd', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { dischargeNotes } = req.body;

    const admission = await prisma.admission.findUnique({
      where: { id },
      include: {
        bed: true,
        patient: true,
        medicationSchedules: {
          where: { status: 'ACTIVE' }
        }
      }
    });

    if (!admission) {
      return errorResponse(res, 'Admission not found', 404);
    }

    if (req.hospitalId && admission.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    if (admission.status !== 'ADMITTED') {
      return errorResponse(res, 'Patient is not currently admitted', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Discontinue all active medications
      await tx.medicationSchedule.updateMany({
        where: {
          admissionId: id,
          status: 'ACTIVE'
        },
        data: {
          status: 'COMPLETED',
          endDate: new Date()
        }
      });

      // Update admission
      const discharged = await tx.admission.update({
        where: { id },
        data: {
          status: 'DISCHARGED',
          actualDischarge: new Date(),
          dischargeNotes
        },
        include: {
          patient: true,
          bed: true
        }
      });

      // Free up the bed
      await tx.bed.update({
        where: { id: admission.bedId },
        data: { status: 'AVAILABLE' }
      });

      return discharged;
    });

    return successResponse(res, { admission: result }, 'Patient discharged');
  } catch (error) {
    console.error('Discharge error:', error);
    return errorResponse(res, 'Failed to discharge patient', 500);
  }
});

// Get discharge summary
router.get('/admissions/:id/discharge-summary', checkModulePermission('ipd', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const admission = await prisma.admission.findUnique({
      where: { id },
      include: {
        patient: true,
        bed: true,
        hospital: {
          select: {
            businessName: true,
            logo: true,
            address: true,
            city: true,
            helplineNumber: true
          }
        },
        nursingNotes: {
          orderBy: { recordedAt: 'desc' }
        },
        medicationSchedules: {
          include: {
            administrations: true
          }
        }
      }
    });

    if (!admission) {
      return errorResponse(res, 'Admission not found', 404);
    }

    if (req.hospitalId && admission.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Calculate stay duration and charges
    const admissionDate = new Date(admission.admissionDate);
    const dischargeDate = admission.actualDischarge ? new Date(admission.actualDischarge) : new Date();
    const stayDays = Math.ceil((dischargeDate - admissionDate) / (1000 * 60 * 60 * 24));
    const roomCharges = stayDays * parseFloat(admission.bed.dailyRate);

    return successResponse(res, {
      summary: {
        ...admission,
        stayDuration: stayDays,
        roomCharges
      }
    }, 'Discharge summary retrieved');
  } catch (error) {
    console.error('Get discharge summary error:', error);
    return errorResponse(res, 'Failed to get discharge summary', 500);
  }
});

module.exports = router;
