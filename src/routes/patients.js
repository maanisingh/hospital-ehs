/**
 * Patient Management Routes
 * Patient Registration, Search, Medical History
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, enforceHospitalScope, checkModulePermission } = require('../middleware/auth');
const {
  generatePatientId,
  getPagination,
  formatPaginatedResponse,
  errorResponse,
  successResponse,
  isValidMobile
} = require('../utils/helpers');

const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);
router.use(enforceHospitalScope);

// ═══════════════════════════════════════════════════════
// GET ALL PATIENTS
// ═══════════════════════════════════════════════════════

router.get('/', checkModulePermission('patients', 'view'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, gender, isActive } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    const where = { hospitalId: req.hospitalId };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { patientId: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search } }
      ];
    }

    if (gender) {
      where.gender = gender;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              consultations: true,
              bills: true
            }
          }
        }
      }),
      prisma.patient.count({ where })
    ]);

    return successResponse(res,
      formatPaginatedResponse(patients, total, page, limit),
      'Patients retrieved'
    );
  } catch (error) {
    console.error('Get patients error:', error);
    return errorResponse(res, 'Failed to get patients', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET SINGLE PATIENT
// ═══════════════════════════════════════════════════════

router.get('/:id', checkModulePermission('patients', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        vitalSigns: {
          orderBy: { recordedAt: 'desc' },
          take: 10
        },
        consultations: {
          orderBy: { consultationDate: 'desc' },
          take: 10,
          include: {
            doctor: {
              select: { name: true }
            }
          }
        },
        labOrders: {
          orderBy: { orderDate: 'desc' },
          take: 10
        },
        bills: {
          orderBy: { billDate: 'desc' },
          take: 10
        },
        admissions: {
          orderBy: { admissionDate: 'desc' },
          take: 5
        }
      }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && patient.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { patient }, 'Patient retrieved');
  } catch (error) {
    console.error('Get patient error:', error);
    return errorResponse(res, 'Failed to get patient', 500);
  }
});

// ═══════════════════════════════════════════════════════
// SEARCH PATIENTS (Quick Search)
// ═══════════════════════════════════════════════════════

router.get('/search/quick', checkModulePermission('patients', 'view'), async (req, res) => {
  try {
    const { q } = req.query;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    if (!q || q.length < 2) {
      return successResponse(res, { patients: [] }, 'Search results');
    }

    const patients = await prisma.patient.findMany({
      where: {
        hospitalId: req.hospitalId,
        isActive: true,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { patientId: { contains: q, mode: 'insensitive' } },
          { mobile: { contains: q } }
        ]
      },
      take: 10,
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        mobile: true,
        gender: true,
        dateOfBirth: true
      }
    });

    return successResponse(res, { patients }, 'Search results');
  } catch (error) {
    console.error('Search patients error:', error);
    return errorResponse(res, 'Failed to search patients', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CREATE PATIENT
// ═══════════════════════════════════════════════════════

router.post('/', checkModulePermission('patients', 'create'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      mobile,
      email,
      address,
      city,
      state,
      pincode,
      emergencyContact,
      emergencyPhone,
      aadharNumber,
      insuranceProvider,
      insuranceNumber,
      medicalHistory,
      allergies
    } = req.body;

    if (!req.hospitalId) {
      return errorResponse(res, 'Hospital ID required', 400);
    }

    // Validation
    if (!firstName || !mobile || !gender) {
      return errorResponse(res, 'First name, mobile, and gender are required', 400);
    }

    if (!isValidMobile(mobile)) {
      return errorResponse(res, 'Invalid mobile number format', 400);
    }

    // Generate patient ID
    const patientId = await generatePatientId(prisma, req.hospitalId);

    const patient = await prisma.patient.create({
      data: {
        hospitalId: req.hospitalId,
        patientId,
        firstName,
        lastName: lastName || '',
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        bloodGroup,
        mobile,
        email,
        address,
        city,
        state,
        pincode,
        emergencyContact,
        emergencyPhone,
        aadharNumber,
        insuranceProvider,
        insuranceNumber,
        medicalHistory,
        allergies,
        isActive: true
      }
    });

    return successResponse(res, { patient }, 'Patient registered successfully', 201);
  } catch (error) {
    console.error('Create patient error:', error);
    return errorResponse(res, 'Failed to register patient', 500);
  }
});

// ═══════════════════════════════════════════════════════
// UPDATE PATIENT
// ═══════════════════════════════════════════════════════

router.put('/:id', checkModulePermission('patients', 'update'), async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && patient.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Prepare update data
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.hospitalId;
    delete updateData.patientId;
    delete updateData.createdAt;

    if (updateData.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    const updated = await prisma.patient.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, { patient: updated }, 'Patient updated');
  } catch (error) {
    console.error('Update patient error:', error);
    return errorResponse(res, 'Failed to update patient', 500);
  }
});

// ═══════════════════════════════════════════════════════
// RECORD VITAL SIGNS
// ═══════════════════════════════════════════════════════

router.post('/:id/vitals', checkModulePermission('patients', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      temperature,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      pulseRate,
      respiratoryRate,
      oxygenSaturation,
      weight,
      height,
      notes
    } = req.body;

    const patient = await prisma.patient.findUnique({
      where: { id }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && patient.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Calculate BMI if height and weight provided
    let bmi = null;
    if (height && weight) {
      const heightInMeters = height / 100;
      bmi = Math.round((weight / (heightInMeters * heightInMeters)) * 10) / 10;
    }

    const vitalSign = await prisma.vitalSign.create({
      data: {
        patientId: id,
        temperature,
        bloodPressureSystolic,
        bloodPressureDiastolic,
        pulseRate,
        respiratoryRate,
        oxygenSaturation,
        weight,
        height,
        bmi,
        notes
      }
    });

    return successResponse(res, { vitalSign }, 'Vital signs recorded', 201);
  } catch (error) {
    console.error('Record vitals error:', error);
    return errorResponse(res, 'Failed to record vital signs', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET PATIENT VITAL SIGNS HISTORY
// ═══════════════════════════════════════════════════════

router.get('/:id/vitals', checkModulePermission('patients', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const patient = await prisma.patient.findUnique({
      where: { id }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && patient.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    const [vitals, total] = await Promise.all([
      prisma.vitalSign.findMany({
        where: { patientId: id },
        skip,
        take: limit,
        orderBy: { recordedAt: 'desc' }
      }),
      prisma.vitalSign.count({ where: { patientId: id } })
    ]);

    return successResponse(res,
      formatPaginatedResponse(vitals, total, page, limit),
      'Vital signs retrieved'
    );
  } catch (error) {
    console.error('Get vitals error:', error);
    return errorResponse(res, 'Failed to get vital signs', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET PATIENT MEDICAL HISTORY
// ═══════════════════════════════════════════════════════

router.get('/:id/history', checkModulePermission('patients', 'view'), async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && patient.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Get comprehensive medical history
    const [consultations, labOrders, radiologyOrders, admissions] = await Promise.all([
      prisma.consultation.findMany({
        where: { patientId: id },
        orderBy: { consultationDate: 'desc' },
        include: {
          doctor: {
            select: { name: true }
          },
          prescriptions: {
            include: {
              items: true
            }
          }
        }
      }),
      prisma.labOrder.findMany({
        where: { patientId: id },
        orderBy: { orderDate: 'desc' },
        include: {
          items: {
            include: {
              labTest: true,
              result: true
            }
          }
        }
      }),
      prisma.radiologyOrder.findMany({
        where: { patientId: id },
        orderBy: { orderDate: 'desc' },
        include: {
          items: {
            include: {
              radiologyTest: true,
              result: true
            }
          }
        }
      }),
      prisma.admission.findMany({
        where: { patientId: id },
        orderBy: { admissionDate: 'desc' },
        include: {
          bed: true,
          nursingNotes: {
            orderBy: { recordedAt: 'desc' },
            take: 10
          }
        }
      })
    ]);

    return successResponse(res, {
      medicalHistory: {
        consultations,
        labOrders,
        radiologyOrders,
        admissions
      }
    }, 'Medical history retrieved');
  } catch (error) {
    console.error('Get medical history error:', error);
    return errorResponse(res, 'Failed to get medical history', 500);
  }
});

// ═══════════════════════════════════════════════════════
// DELETE PATIENT (Soft Delete)
// ═══════════════════════════════════════════════════════

router.delete('/:id', checkModulePermission('patients', 'delete'), async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id }
    });

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    // Check hospital scope
    if (req.hospitalId && patient.hospitalId !== req.hospitalId) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Soft delete
    await prisma.patient.update({
      where: { id },
      data: { isActive: false }
    });

    return successResponse(res, {}, 'Patient record deactivated');
  } catch (error) {
    console.error('Delete patient error:', error);
    return errorResponse(res, 'Failed to delete patient', 500);
  }
});

module.exports = router;
