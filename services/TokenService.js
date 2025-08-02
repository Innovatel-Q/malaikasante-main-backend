const jwt = require('jsonwebtoken');
const Consts = require('../config/const');

class TokenService {
    /**
     * Génère un token d'accès JWT selon le rôle utilisateur
     */
    static generateToken(user) {
        const payload = {
            userId: user.id,
            role: user.role,
            type: 'ACCESS'
        };

        // Durée selon le rôle (définie dans Consts)
        const expiresIn = Consts.JWT_EXPIRATION[user.role]?.access || '1d';

        const token = jwt.sign(payload, Consts.JWT_SECRET, { expiresIn });

        return token;
    }

    /**
     * Génère un token de rafraîchissement (sauf pour les admins)
     */
    static generateRefreshToken(user) {
        // Les admins n'ont pas de refresh token
        if (user.role === 'ADMIN') {
            return null;
        }

        const payload = {
            userId: user.id,
            role: user.role,
            type: 'REFRESH'
        };

        const expiresIn = Consts.JWT_EXPIRATION[user.role]?.refresh || '30d';

        const token = jwt.sign(payload, Consts.JWT_SECRET, { expiresIn });

        return token;
    }

    /**
     * Vérifie la validité d'un token JWT
     */
    static verifyToken(token) {
        try {
            return jwt.verify(token, Consts.JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    /**
     * Vérifie et décode un token avec gestion des erreurs détaillée
     */
    static checkToken(token) {
        try {
            const payload = jwt.verify(token, Consts.JWT_SECRET);
            return {
                isValid: true,
                payload
            };
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                const payload = jwt.decode(token);
                return {
                    isValid: false,
                    expired: true,
                    payload,
                    message: 'Le token a expiré, veuillez vous reconnecter'
                };
            }

            return {
                isValid: false,
                expired: false,
                message: 'Token invalide'
            };
        }
    }

    /**
     * Décode un token sans vérification (pour récupérer les infos même si expiré)
     */
    static decodeToken(token) {
        try {
            return jwt.decode(token);
        } catch (error) {
            return null;
        }
    }

    /**
     * Convertit une durée en millisecondes
     */
    static _getExpirationMilliseconds(expiresIn) {
        const match = expiresIn.match(/^(\d+)([smhdy])$/);
        if (!match) return 0;

        const [_, value, unit] = match;
        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            y: 365 * 24 * 60 * 60 * 1000
        };

        return parseInt(value, 10) * (multipliers[unit] || 0);
    }
}

module.exports = TokenService;