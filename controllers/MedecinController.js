const express = require('express');
const router = express.Router();

// Import des routes spécialisées
const validationStatusRoute = require('../routes/medecins/validation-status');

// Organisation modulaire des routes
router.use('/validation-status', validationStatusRoute);

module.exports = router;