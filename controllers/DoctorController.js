const express = require('express');
const router = express.Router();

// Import des routes spécialisées pour les médecins (doctors)
const searchRoute = require('../routes/doctors/search');
const detailsRoute = require('../routes/doctors/details');
const availableSlotsRoute = require('../routes/doctors/available-slots');

// Organisation modulaire des routes médecins
router.use('/', searchRoute);
router.use('/available-slots', availableSlotsRoute);
router.use('/details', detailsRoute);

module.exports = router;