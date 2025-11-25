/**
 * Consultation Routes
 * Doctor Consultations, Diagnosis, Prescriptions
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generateConsultationNumber,
  generatePrescriptionNumber,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// GET ALL CONSULTATIONS
// ═══════════════════════════════════════════════════════

router.get('/', checkModulePermission('consultations', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { patientId, doctorId, date, status } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (patientId) {
      where.patientId = patientId;
    }

    if (doctorId) {
      where.doctorId = doctorId;
    }

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);

      where.consultationDate = {
        gte: queryDate,
        lt: nextDay
      };
    }

    if (status) {
      where.status = status;
    }

    const [consultations, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { consultationDate: 'desc' },
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
            select: {
              name: true
            }
          },
          prescriptions: {
            include: {
              items: true
            }
          },
          labOrders: true,
          radiologyOrders: true
        }
      }),
      prisma.consultation.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(consultations, total, page, limit),
      'Consultations retrieved'
    );
  } catch (error) {
    console.error('Get consultations error:', error);
    return errorResponse(res, 'Failed to get consultations', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET SINGLE CONSULTATION
// ═══════════════════════════════════════════════════════

router.get('/:id', checkModulePermission('consultations', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: {
          select: {
            name: true,
            email: true
          }
        },
        opdToken: true,
        prescriptions: {
          include: {
            items: {
              include: {
                medicine: true
              }
            }
          }
        },
        labOrders: {
          include: {
            items: {
              include: {
                labTest: true,
                result: true
              }
            }
          }
        },
        radiologyOrders: {
          include: {
            items: {
              include: {
                radiologyTest: true,
                result: true
              }
            }
          }
        }
      }
    });

    if (!consultation) {
      return errorResponse(res, 'Consultation not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && consultation.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { consultation }, 'Consultation retrieved');
  } catch (error) {
    console.error('Get consultation error:', error);
    return errorResponse(res, 'Failed to get consultation', 500);
  }
});

// ═══════════════════════════════════════════════════════
// START CONSULTATION (from OPD Token)
// ═══════════════════════════════════════════════════════

router.post('/start', checkModulePermission('consultations', 'create'), async (req, res) => {
  try {
    const { opdTokenId } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!opdTokenId) {
      return errorResponse(res, 'OPD Token ID required', 400);
    }

    // Get OPD token
    const opdToken = await prisma.opdToken.findUnique({
      where: { id: opdTokenId },
      include: {
        patient: true,
        doctor: {
          include: {
            user: true
          }
        }
      }
    });

    if (!opdToken) {
      return errorResponse(res, 'OPD token not found', 404);
    }

    if (opdToken.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Check if consultation already exists
    if (opdToken.consultation) {
      return errorResponse(res, 'Consultation already started for this token', 400);
    }

    // Generate consultation number
    const consultationNumber = await generateConsultationNumber(prisma, req.hospitalId);

    // Create consultation and update token status
    const result = await prisma.$transaction(async (tx) => {
      // Create consultation
      const consultation = await tx.consultation.create({
        data: {
          hospitalId: req.hospitalId,
          patientId: opdToken.patientId,
          doctorId: opdToken.doctor.userId,
          opdTokenId: opdToken.id,
          consultationNumber,
          consultationDate: new Date(),
          status: 'IN_PROGRESS'
        },
        include: {
          patient: true,
          doctor: {
            select: { name: true }
          }
        }
      });

      // Update OPD token status
      await tx.opdToken.update({
        where: { id: opdTokenId },
        data: { status: 'IN_CONSULTATION' }
      });

      return consultation;
    });

    return successResponse(res, { consultation: result }, 'Consultation started', 201);
  } catch (error) {
    console.error('Start consultation error:', error);
    return errorResponse(res, 'Failed to start consultation', 500);
  }
});

// ═══════════════════════════════════════════════════════
// UPDATE CONSULTATION (Symptoms, Diagnosis, Notes)
// ═══════════════════════════════════════════════════════

router.put('/:id', checkModulePermission('consultations', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { symptoms, diagnosis, clinicalNotes, followUpDate, status } = req.body;

    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      return errorResponse(res, 'Consultation not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && consultation.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const updated = await prisma.consultation.update({
      where: { id },
      data: {
        symptoms,
        diagnosis,
        clinicalNotes,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        status: status || consultation.status
      },
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
          select: { name: true }
        }
      }
    });

    return successResponse(res, { consultation: updated }, 'Consultation updated');
  } catch (error) {
    console.error('Update consultation error:', error);
    return errorResponse(res, 'Failed to update consultation', 500);
  }
});

// ═══════════════════════════════════════════════════════
// COMPLETE CONSULTATION
// ═══════════════════════════════════════════════════════

router.post('/:id/complete', checkModulePermission('consultations', 'update'), async (req, res) => {
  try {
    const { id } = req.params;

    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      return errorResponse(res, 'Consultation not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && consultation.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Update consultation and OPD token
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: { status: 'COMPLETED' }
      });

      if (consultation.opdTokenId) {
        await tx.opdToken.update({
          where: { id: consultation.opdTokenId },
          data: {
            status: 'COMPLETED',
            completedTime: new Date()
          }
        });
      }

      return updated;
    });

    return successResponse(res, { consultation: result }, 'Consultation completed');
  } catch (error) {
    console.error('Complete consultation error:', error);
    return errorResponse(res, 'Failed to complete consultation', 500);
  }
});

// ═══════════════════════════════════════════════════════
// ADD PRESCRIPTION TO CONSULTATION
// ═══════════════════════════════════════════════════════

router.post('/:id/prescriptions', checkModulePermission('consultations', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { instructions, medicines } = req.body;

    if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
      return errorResponse(res, 'At least one medicine is required', 400);
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      return errorResponse(res, 'Consultation not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && consultation.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Generate prescription number
    const prescriptionNumber = await generatePrescriptionNumber(prisma, req.hospitalId);

    // Create prescription with items
    const prescription = await prisma.prescription.create({
      data: {
        hospitalId: req.hospitalId,
        patientId: consultation.patientId,
        consultationId: id,
        prescriptionNumber,
        instructions,
        status: 'PENDING',
        items: {
          create: medicines.map(med => ({
            medicineId: med.medicineId,
            medicineName: med.medicineName,
            dosage: med.dosage,
            frequency: med.frequency,
            duration: med.duration,
            quantity: med.quantity,
            instructions: med.instructions
          }))
        }
      },
      include: {
        items: {
          include: {
            medicine: true
          }
        }
      }
    });

    return successResponse(res, { prescription }, 'Prescription added', 201);
  } catch (error) {
    console.error('Add prescription error:', error);
    return errorResponse(res, 'Failed to add prescription', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET PRESCRIPTION
// ═══════════════════════════════════════════════════════

router.get('/prescriptions/:prescriptionId', checkModulePermission('consultations', 'view'), async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
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
            medicine: true,
            dispensedBy: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (!prescription) {
      return errorResponse(res, 'Prescription not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && prescription.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { prescription }, 'Prescription retrieved');
  } catch (error) {
    console.error('Get prescription error:', error);
    return errorResponse(res, 'Failed to get prescription', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET MEDICINES FOR PRESCRIPTION
// ═══════════════════════════════════════════════════════

router.get('/medicines/search', checkModulePermission('consultations', 'view'), async (req, res) => {
  try {
    const { q } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!q || q.length < 2) {
      return successResponse(res, { medicines: [] }, 'Search results');
    }

    const medicines = await prisma.medicine.findMany({
      where: {
        hospitalId: req.hospitalId,
        isActive: true,
        stockQuantity: { gt: 0 },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { genericName: { contains: q, mode: 'insensitive' } },
          { medicineCode: { contains: q, mode: 'insensitive' } }
        ]
      },
      take: 20,
      select: {
        id: true,
        medicineCode: true,
        name: true,
        genericName: true,
        category: true,
        sellingPrice: true,
        stockQuantity: true,
        unit: true
      }
    });

    return successResponse(res, { medicines }, 'Medicines found');
  } catch (error) {
    console.error('Search medicines error:', error);
    return errorResponse(res, 'Failed to search medicines', 500);
  }
});

module.exports = router;
