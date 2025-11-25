/**
 * Database Seed Script
 * Creates initial superadmin, test hospitals, and sample data
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ═══════════════════════════════════════════════════════
  // CREATE SUPERADMIN
  // ═══════════════════════════════════════════════════════

  console.log('Creating Superadmin...');
  const superadminPassword = await bcrypt.hash('superadmin123', 10);

  const superadmin = await prisma.user.upsert({
    where: { email: 'superadmin@medicarepro.com' },
    update: {},
    create: {
      email: 'superadmin@medicarepro.com',
      password: superadminPassword,
      name: 'Super Admin',
      mobile: '9999999999',
      role: 'SUPERADMIN',
      isActive: true
    }
  });

  console.log(`✅ Superadmin created: ${superadmin.email}\n`);

  // ═══════════════════════════════════════════════════════
  // CREATE TEST HOSPITALS
  // ═══════════════════════════════════════════════════════

  const hospitals = [
    {
      organizationCode: 'H101',
      businessName: 'City General Hospital',
      address: '123 Healthcare Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      email: 'info@citygeneralhospital.com',
      helplineNumber: '1800-123-4567',
      ownerName: 'Dr. Rajesh Kumar',
      ownerEmail: 'admin@h101.com',
      ownerMobile: '9876543210'
    },
    {
      organizationCode: 'H102',
      businessName: 'LifeCare Medical Center',
      address: '456 Medical Plaza',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      email: 'info@lifecaremedical.com',
      helplineNumber: '1800-234-5678',
      ownerName: 'Dr. Priya Sharma',
      ownerEmail: 'admin@h102.com',
      ownerMobile: '9876543211'
    },
    {
      organizationCode: 'H103',
      businessName: 'Sunrise Healthcare',
      address: '789 Wellness Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      email: 'info@sunrisehealthcare.com',
      helplineNumber: '1800-345-6789',
      ownerName: 'Dr. Amit Patel',
      ownerEmail: 'admin@h103.com',
      ownerMobile: '9876543212'
    }
  ];

  const createdHospitals = [];

  for (const hospitalData of hospitals) {
    console.log(`Creating hospital: ${hospitalData.businessName}...`);

    // Create hospital
    const hospital = await prisma.hospital.upsert({
      where: { organizationCode: hospitalData.organizationCode },
      update: {},
      create: {
        ...hospitalData,
        country: 'India',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        isActive: true,
        subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      }
    });

    // Create hospital admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    const hospitalAdmin = await prisma.user.upsert({
      where: { email: hospitalData.ownerEmail },
      update: {},
      create: {
        hospitalId: hospital.id,
        email: hospitalData.ownerEmail,
        password: adminPassword,
        name: hospitalData.ownerName,
        mobile: hospitalData.ownerMobile,
        role: 'HOSPITAL_ADMIN',
        isActive: true
      }
    });

    // Create departments
    const departments = [
      'General Medicine',
      'Pediatrics',
      'Orthopedics',
      'Cardiology',
      'Dermatology',
      'ENT',
      'Ophthalmology',
      'Gynecology',
      'Emergency'
    ];

    const createdDepts = [];
    for (const deptName of departments) {
      const dept = await prisma.department.upsert({
        where: {
          hospitalId_name: {
            hospitalId: hospital.id,
            name: deptName
          }
        },
        update: {},
        create: {
          hospitalId: hospital.id,
          name: deptName,
          isActive: true
        }
      });
      createdDepts.push(dept);
    }

    // Create sample users for each role
    const roles = [
      { role: 'RECEPTION', email: `reception@${hospital.organizationCode.toLowerCase()}.com`, name: 'Reception Staff' },
      { role: 'DOCTOR', email: `doctor@${hospital.organizationCode.toLowerCase()}.com`, name: 'Dr. Sample Doctor' },
      { role: 'NURSE', email: `nurse@${hospital.organizationCode.toLowerCase()}.com`, name: 'Nurse Staff' },
      { role: 'LAB_TECHNICIAN', email: `lab@${hospital.organizationCode.toLowerCase()}.com`, name: 'Lab Technician' },
      { role: 'RADIOLOGY_TECHNICIAN', email: `radiology@${hospital.organizationCode.toLowerCase()}.com`, name: 'Radiology Tech' },
      { role: 'PHARMACIST', email: `pharmacy@${hospital.organizationCode.toLowerCase()}.com`, name: 'Pharmacist' },
      { role: 'BILLING_STAFF', email: `billing@${hospital.organizationCode.toLowerCase()}.com`, name: 'Billing Staff' },
      { role: 'INVENTORY_STAFF', email: `inventory@${hospital.organizationCode.toLowerCase()}.com`, name: 'Inventory Staff' }
    ];

    const userPassword = await bcrypt.hash('password123', 10);

    for (const roleData of roles) {
      const user = await prisma.user.upsert({
        where: { email: roleData.email },
        update: {},
        create: {
          hospitalId: hospital.id,
          email: roleData.email,
          password: userPassword,
          name: roleData.name,
          role: roleData.role,
          isActive: true
        }
      });

      // Create doctor record if role is DOCTOR
      if (roleData.role === 'DOCTOR') {
        await prisma.doctor.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            hospitalId: hospital.id,
            userId: user.id,
            departmentId: createdDepts[0].id, // General Medicine
            employeeId: `DOC${hospital.organizationCode}001`,
            specialization: 'General Medicine',
            qualification: 'MBBS, MD',
            consultationFee: 500,
            roomNumber: '101',
            availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            availableFrom: '09:00',
            availableTo: '17:00',
            maxPatientsPerDay: 30,
            isAvailable: true
          }
        });
      }
    }

    // Create sample lab tests
    const labTests = [
      { testCode: 'CBC', testName: 'Complete Blood Count', category: 'Hematology', price: 350, normalRange: '4.5-5.5 M/uL', unit: 'M/uL', sampleType: 'Blood' },
      { testCode: 'BS-F', testName: 'Blood Sugar Fasting', category: 'Biochemistry', price: 150, normalRange: '70-110 mg/dL', unit: 'mg/dL', sampleType: 'Blood' },
      { testCode: 'BS-PP', testName: 'Blood Sugar PP', category: 'Biochemistry', price: 150, normalRange: '< 140 mg/dL', unit: 'mg/dL', sampleType: 'Blood' },
      { testCode: 'LFT', testName: 'Liver Function Test', category: 'Biochemistry', price: 800, sampleType: 'Blood' },
      { testCode: 'KFT', testName: 'Kidney Function Test', category: 'Biochemistry', price: 600, sampleType: 'Blood' },
      { testCode: 'LIPID', testName: 'Lipid Profile', category: 'Biochemistry', price: 700, sampleType: 'Blood' },
      { testCode: 'TFT', testName: 'Thyroid Function Test', category: 'Biochemistry', price: 900, sampleType: 'Blood' },
      { testCode: 'URINE-R', testName: 'Urine Routine', category: 'Microbiology', price: 200, sampleType: 'Urine' },
      { testCode: 'HBA1C', testName: 'HbA1c', category: 'Biochemistry', price: 500, normalRange: '< 5.7%', unit: '%', sampleType: 'Blood' },
      { testCode: 'ESR', testName: 'ESR', category: 'Hematology', price: 150, normalRange: '0-20 mm/hr', unit: 'mm/hr', sampleType: 'Blood' }
    ];

    for (const test of labTests) {
      await prisma.labTest.upsert({
        where: {
          hospitalId_testCode: {
            hospitalId: hospital.id,
            testCode: test.testCode
          }
        },
        update: {},
        create: {
          hospitalId: hospital.id,
          ...test,
          turnaroundTime: 24,
          isActive: true
        }
      });
    }

    // Create sample radiology tests
    const radiologyTests = [
      { testCode: 'XRAY-CHEST', testName: 'Chest X-Ray', modality: 'X-Ray', price: 500 },
      { testCode: 'XRAY-SPINE', testName: 'Spine X-Ray', modality: 'X-Ray', price: 600 },
      { testCode: 'USG-ABD', testName: 'USG Abdomen', modality: 'Ultrasound', price: 1200 },
      { testCode: 'USG-PELVIS', testName: 'USG Pelvis', modality: 'Ultrasound', price: 1200 },
      { testCode: 'CT-HEAD', testName: 'CT Head', modality: 'CT Scan', price: 3500 },
      { testCode: 'CT-CHEST', testName: 'CT Chest', modality: 'CT Scan', price: 4000 },
      { testCode: 'MRI-BRAIN', testName: 'MRI Brain', modality: 'MRI', price: 8000 },
      { testCode: 'MRI-SPINE', testName: 'MRI Spine', modality: 'MRI', price: 9000 },
      { testCode: 'ECG', testName: 'ECG', modality: 'Cardiology', price: 300 },
      { testCode: 'ECHO', testName: 'Echocardiography', modality: 'Cardiology', price: 2500 }
    ];

    for (const test of radiologyTests) {
      await prisma.radiologyTest.upsert({
        where: {
          hospitalId_testCode: {
            hospitalId: hospital.id,
            testCode: test.testCode
          }
        },
        update: {},
        create: {
          hospitalId: hospital.id,
          ...test,
          turnaroundTime: 48,
          isActive: true
        }
      });
    }

    // Create sample medicines
    const medicines = [
      { medicineCode: 'MED001', name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'Tablet', unitPrice: 2, sellingPrice: 3, stockQuantity: 1000 },
      { medicineCode: 'MED002', name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'Capsule', unitPrice: 8, sellingPrice: 12, stockQuantity: 500 },
      { medicineCode: 'MED003', name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'Capsule', unitPrice: 5, sellingPrice: 8, stockQuantity: 800 },
      { medicineCode: 'MED004', name: 'Metformin 500mg', genericName: 'Metformin', category: 'Tablet', unitPrice: 3, sellingPrice: 5, stockQuantity: 600 },
      { medicineCode: 'MED005', name: 'Atorvastatin 10mg', genericName: 'Atorvastatin', category: 'Tablet', unitPrice: 6, sellingPrice: 10, stockQuantity: 400 },
      { medicineCode: 'MED006', name: 'Cetirizine 10mg', genericName: 'Cetirizine', category: 'Tablet', unitPrice: 2, sellingPrice: 4, stockQuantity: 700 },
      { medicineCode: 'MED007', name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'Tablet', unitPrice: 25, sellingPrice: 35, stockQuantity: 300 },
      { medicineCode: 'MED008', name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', category: 'Tablet', unitPrice: 8, sellingPrice: 12, stockQuantity: 500 },
      { medicineCode: 'MED009', name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'Tablet', unitPrice: 3, sellingPrice: 5, stockQuantity: 800 },
      { medicineCode: 'MED010', name: 'Cough Syrup', genericName: 'Dextromethorphan', category: 'Syrup', unitPrice: 40, sellingPrice: 60, stockQuantity: 200 }
    ];

    for (const med of medicines) {
      await prisma.medicine.upsert({
        where: {
          hospitalId_medicineCode: {
            hospitalId: hospital.id,
            medicineCode: med.medicineCode
          }
        },
        update: {},
        create: {
          hospitalId: hospital.id,
          ...med,
          unit: med.category === 'Syrup' ? 'Bottle' : 'Tablet',
          reorderLevel: 100,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          isActive: true
        }
      });
    }

    // Create sample beds
    const wards = ['General', 'ICU', 'Private'];
    const bedsPerWard = { 'General': 10, 'ICU': 5, 'Private': 5 };
    const bedTypes = { 'General': 'GENERAL', 'ICU': 'ICU', 'Private': 'PRIVATE' };
    const dailyRates = { 'General': 500, 'ICU': 3000, 'Private': 1500 };

    for (const ward of wards) {
      for (let i = 1; i <= bedsPerWard[ward]; i++) {
        const bedNumber = `${ward.substring(0, 1)}${i.toString().padStart(2, '0')}`;
        await prisma.bed.upsert({
          where: {
            hospitalId_bedNumber: {
              hospitalId: hospital.id,
              bedNumber
            }
          },
          update: {},
          create: {
            hospitalId: hospital.id,
            bedNumber,
            ward,
            roomNumber: `${ward.substring(0, 1)}${Math.ceil(i / 2)}`,
            bedType: bedTypes[ward],
            dailyRate: dailyRates[ward],
            status: 'AVAILABLE',
            isActive: true
          }
        });
      }
    }

    createdHospitals.push({
      hospital,
      admin: hospitalAdmin
    });

    console.log(`✅ Hospital created: ${hospital.businessName} (${hospital.organizationCode})`);
  }

  // ═══════════════════════════════════════════════════════
  // PRINT CREDENTIALS
  // ═══════════════════════════════════════════════════════

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 LOGIN CREDENTIALS');
  console.log('═══════════════════════════════════════════════════════');

  console.log('\n🔑 SUPERADMIN:');
  console.log('   Email: superadmin@medicarepro.com');
  console.log('   Password: superadmin123');

  for (const { hospital } of createdHospitals) {
    console.log(`\n🏥 ${hospital.businessName} (${hospital.organizationCode}):`);
    console.log(`   Admin: admin@${hospital.organizationCode.toLowerCase()}.com / admin123`);
    console.log(`   Reception: reception@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Doctor: doctor@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Nurse: nurse@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Lab: lab@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Radiology: radiology@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Pharmacy: pharmacy@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Billing: billing@${hospital.organizationCode.toLowerCase()}.com / password123`);
    console.log(`   Inventory: inventory@${hospital.organizationCode.toLowerCase()}.com / password123`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ Database seeding completed successfully!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
