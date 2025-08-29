const express = require('express');
const router = express.Router();

// Import de la documentation Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../config/swagger');

const authController = require('../controllers/AuthController');
const patientController = require('../controllers/PatientController');
const medecinController = require('../controllers/MedecinController');
const adminController = require('../controllers/AdminController');
const doctorController = require('../controllers/DoctorController');
const appointmentController = require('../controllers/AppointmentController');
const evaluationController = require('../controllers/EvaluationController');


/**
 * Route d'information sur l'API
 */
router.get('/info', (req, res) => {
    const Consts = require('../config/const');

    res.json({
        success: true,
        data: {
            appName: Consts.APP_NAME,
            description: Consts.PROJECT_DESCRIPTION,
            author: Consts.APP_AUTHOR,
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            timestamp: Consts.getDateLib()().format('YYYY-MM-DD HH:mm:ss'),
            endpoints: {
                documentation: '/v1/api-docs',
                info: '/v1/info',
                auth: '/v1/auth/*',
                patients: '/v1/patients/*',
                medecins: '/v1/medecins/*',
                doctors: '/v1/doctors/*',
                appointments: '/v1/appointments/*',
                evaluations: '/v1/evaluations/*',
                admin: '/v1/admin/*'
            },
            features: {
                authentication: 'JWT + OTP',
                sms: 'LeTexto API',
                database: 'MySQL + Prisma',
                documentation: 'Swagger UI'
            }
        }
    });
});

/**
 * Route de test de connectivité
 */
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Documentation Swagger UI
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'API Médecins-Patients',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
        docExpansion: 'list',
        filter: true,
        showRequestHeaders: true
    }
}));

// Ajout des contrôleurs
router.use('/auth', authController);
router.use('/patients', patientController);
router.use('/medecins', medecinController);
router.use('/admin', adminController);
router.use('/doctors', doctorController);
router.use('/appointments', appointmentController);
router.use('/evaluations', evaluationController);

module.exports = router;