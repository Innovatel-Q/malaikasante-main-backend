const express = require('express');
const router = express.Router();

// Import des routes spécialisées
const validationStatusRoute = require('../routes/medecins/validation-status');
const profileRoute = require('../routes/medecins/profile');
const dashboardRoute = require('../routes/medecins/dashboard');
const availabilityRoute = require('../routes/medecins/availability');
const patientsRoute = require('../routes/medecins/patients');

// Organisation modulaire des routes
router.use('/validation-status', validationStatusRoute);
router.use('/profile', profileRoute);
router.use('/dashboard', dashboardRoute);
router.use('/availability', availabilityRoute);
router.use('/patients', patientsRoute);

module.exports = router;