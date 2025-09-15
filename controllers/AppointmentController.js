const express = require('express');
const router = express.Router();

// Import des routes spécialisées pour les rendez-vous (appointments)
const requestRoute = require('../routes/appointments/request');
const respondRoute = require('../routes/appointments/respond');
const listRoute = require('../routes/appointments/list');
const cancelRoute = require('../routes/appointments/cancel');
const rescheduleRoute = require('../routes/appointments/reschedule');

// Organisation modulaire des routes rendez-vous
router.use('/request', requestRoute);
router.use('/:id/respond', respondRoute);
router.use('/cancel', cancelRoute);
router.use('/:id/reschedule', rescheduleRoute);

// La route list doit être en dernier pour éviter les conflits
router.use('/', listRoute);

module.exports = router;