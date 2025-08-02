const express = require('express');
const router = express.Router();

// Import des routes spécialisées
const profileRoute = require('../routes/patients/profile');

// Organisation modulaire des routes
router.use('/profile', profileRoute);

module.exports = router;