// controllers/AdminController.js
const express = require('express');
const router = express.Router();

// Import des routes admin - MÉDECINS
const doctorsList = require('../routes/admin/doctors/list');
const doctorsPending = require('../routes/admin/doctors/pending');
const doctorsValidate = require('../routes/admin/doctors/validate');
const doctorsProfile = require('../routes/admin/doctors/profile');
const doctorsDocuments = require('../routes/admin/doctors/documents');

// Import des routes admin - CLINIQUES
const cliniquesList = require('../routes/admin/cliniques/list');
const cliniquesCreate = require('../routes/admin/cliniques/create');
const cliniquesDetails = require('../routes/admin/cliniques/details');
const cliniquesUpdate = require('../routes/admin/cliniques/update');

// ============================================================================
// ROUTES MÉDECINS ADMIN
// ============================================================================
router.use('/doctors', doctorsList); // GET /doctors (liste complète)
router.use('/doctors/pending', doctorsPending); // GET /doctors/pending

// ✅ ROUTES MÉDECINS
router.use('/doctors', doctorsProfile);  // PUT /doctors/:id/profile
router.use('/doctors', doctorsDocuments); // GET /doctors/:id/documents
router.use('/doctors', doctorsValidate); // PUT /doctors/:id/validate

// ============================================================================
// ROUTES CLINIQUES ADMIN
// ============================================================================

// ✅ ROUTES CLINIQUES
router.use('/cliniques', cliniquesList);    // GET /cliniques
router.use('/cliniques', cliniquesCreate);  // POST /cliniques
router.use('/cliniques', cliniquesDetails); // GET /cliniques/:id + GET /cliniques/:id/medecins
router.use('/cliniques', cliniquesUpdate);  // PUT /cliniques/:id

module.exports = router;