const express = require('express');
const router = express.Router();

// Import des routes spécialisées pour les évaluations
const createRoute = require('../routes/evaluations/create');

// Organisation modulaire des routes évaluations
router.use('/', createRoute);

module.exports = router;