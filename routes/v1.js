const express = require('express');
const router = express.Router();

// Import de la documentation Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../config/swagger');

const authController = require('../controllers/AuthController');
const patientController = require('../controllers/PatientController');
const medecinController = require('../controllers/MedecinController');
const adminController = require('../controllers/AdminController');


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
                medecins: '/v1/medecins/*'
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

module.exports = router;