const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

// Import des routers
const v1Router = require('./routes/v1');
const filesRouter = require('./routes/files');

const app = express();

// Middleware globaux
app.use(logger('dev'));
app.use(express.json({ limit: '10mb' })); // Support JSON avec limite
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Servir les fichiers statiques (logo, images, etc.)
app.use('/images', express.static('public/images'));
app.use('/public', express.static('public'));

// Middleware de gestion des CORS (pour les appels front-end)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Répondre aux requêtes OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Middleware de gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Erreur globale:', err);

    // Erreur de parsing JSON
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_JSON',
            message: 'Format JSON invalide',
            timestamp: new Date().toISOString()
        });
    }

    // Erreur générique
    res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Erreur interne du serveur',
        timestamp: new Date().toISOString()
    });
});

// Routes principales API v1
app.use('/v1', v1Router);

// Route sécurisée pour servir les fichiers uploadés
app.use('/files', filesRouter);

// Route de base pour vérifier que l'API fonctionne
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API Plateforme Médecins-Patients',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        documentation: '/v1/api-docs'
    });
});

// Gestion des routes non trouvées (404)
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Endpoint non trouvé',
        requestedUrl: req.originalUrl,
        availableEndpoints: [
            'GET /',
            'GET /v1/info',
            'GET /v1/api-docs'
        ],
        timestamp: new Date().toISOString()
    });
});

module.exports = app;