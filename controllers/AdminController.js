// controllers/AdminController.js
const express = require('express');
const router = express.Router();

// Import des routes admin
const doctorsPending = require('../routes/admin/doctors/pending');
const doctorsDiplomes = require('../routes/admin/doctors/diplomes');
const doctorsCertifications = require('../routes/admin/doctors/certifications');
const doctorsValidate = require('../routes/admin/doctors/validate');


// Routes médecins admin
router.use('/doctors/pending', doctorsPending);
router.use('/doctors', doctorsDiplomes);
router.use('/doctors', doctorsCertifications);
router.use('/doctors', doctorsValidate);

module.exports = router;