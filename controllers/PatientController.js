const express = require('express');
const router = express.Router();

// Import des routes spécialisées
const profileRoute = require('../routes/patients/profile');
const medicalDataRoute = require('../routes/patients/medical-data');

// Organisation modulaire des routes
router.use('/profile', profileRoute);
router.use('/medical-data', medicalDataRoute);

module.exports = router;