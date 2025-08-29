require('dotenv').config();
const dayjs = require('dayjs');

class Consts {
    // Informations application
    static APP_NAME = "Plateforme Médecins-Patients";
    static APP_AUTHOR = "LYCORIS GROUP";
    static PROJECT_DESCRIPTION = "API backend pour la mise en relation médecins-patients en Côte d'Ivoire";

    // Configuration des ports par environnement
    static PORT_SYSTEM = {
        development: process.env.PORT || 3000,
        test: process.env.TEST_PORT || 3015,
        production: process.env.PROD_PORT || 5005
    };

    // JWT Secret selon l'environnement
    static JWT_SECRET = (() => {
        const env = process.env.NODE_ENV || 'development';
        switch (env) {
            case 'production':
                return process.env.JWT_SECRET_PROD;
            case 'test':
                return process.env.JWT_SECRET_TEST;
            default:
                return process.env.JWT_SECRET_DEV;
        }
    })();

    // Configuration SMS LeTexto (Côte d'Ivoire)
    static SMS_CONFIG = {
        baseUrl: process.env.LETEXTO_API_URL,
        apiKey: process.env.LETEXTO_API_KEY,
        sender: 'REXTO',
        countryCode: '225' // Côte d'Ivoire
    };

    // Configuration OTP
    static OTP_CONFIG = {
        length: 4,
        expirationMinutes: 5,
        maxAttempts: 3
    };

    // Durées des tokens JWT par rôle
    static JWT_EXPIRATION = {
        PATIENT: {
            access: '7d',
            refresh: '30d'
        },
        MEDECIN: {
            access: '1d',
            refresh: '30d'
        },
        ADMIN: {
            access: '1d',
            refresh: null // Pas de refresh pour les admins
        }
    };

    // Librairie de dates
    static getDateLib() {
        return dayjs;
    }

    // Obtenir le port selon l'environnement
    static getPort() {
        const env = process.env.NODE_ENV || 'development';
        return this.PORT_SYSTEM[env];
    }
}

module.exports = Consts;