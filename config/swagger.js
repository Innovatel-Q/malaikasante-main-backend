require('dotenv').config();
const swaggerJsdoc = require('swagger-jsdoc');

const getServers = () => {
    const environment = process.env.NODE_ENV || 'development';
    const servers = [];

    switch (environment) {
        case 'production':
            servers.push({
                url: process.env.PROD_API_URL || 'https://api.medecins-patients.ci',
                description: 'Serveur de production'
            });
            break;
        case 'test':
            servers.push({
                url: process.env.TEST_API_URL || 'https://api.malaikasante.com',
                description: 'Serveur de test'
            });
            break;
        default:
            servers.push({
                url: process.env.DEV_API_URL || 'http://localhost:3000',
                description: 'Serveur de développement'
            });
    }

    return servers;
};

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: "API Plateforme Médecins-Patients",
            version: '1.0.0',
            description: "Documentation de l'API pour la mise en relation médecins-patients en Côte d'Ivoire. Développée par MEDEV GROUP.",
            contact: {
                name: 'MEDEV GROUP',
                email: 'contact@medev.com'
            }
        },
        servers: getServers(),
        // Les composants sont définis dans swagger/components/common.yaml
        security: [
            {
                bearerAuth: []
            }
        ]
    },
    apis: [
        './swagger/**/*.yaml',
        './routes/**/*.js'
    ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;