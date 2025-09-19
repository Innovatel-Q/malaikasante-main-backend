const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * POST /auth/logout - Déconnexion session actuelle uniquement
 */
router.post('/',
    AuthMiddleware.authenticate(),
    async (req, res) => {
        try {
            const user = req.user;
            const currentToken = req.headers.authorization?.replace('Bearer ', '');
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🚪 Déconnexion session actuelle pour: ${user.prenom} ${user.nom}`);

            // Hash du token actuel pour la recherche en base
            const currentTokenHash = crypto.createHash('sha256').update(currentToken).digest('hex');

            // Révocation uniquement du token actuel
            const revokedTokens = await prisma.userToken.updateMany({
                where: {
                    userId: user.id,
                    tokenHash: currentTokenHash, // Utiliser tokenHash au lieu de token
                    utilise: false
                },
                data: {
                    utilise: true
                }
            });

            console.log(`✅ Session actuelle fermée: ${user.prenom} ${user.nom} - ${revokedTokens.count} token révoqué`);

            return ApiResponse.success(res, 'Déconnexion réussie', {
                logoutInfo: {
                    userId: user.id,
                    userRole: user.role,
                    tokensRevoked: revokedTokens.count,
                    logoutTime: new Date().toISOString(),
                    ip: clientIp
                },
                securityInfo: {
                    message: 'Votre session actuelle a été fermée',
                    action: 'Vos autres sessions restent actives',
                    affectedDevices: 'Cet appareil uniquement'
                }
            });

        } catch (error) {
            console.error('❌ Erreur déconnexion:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la déconnexion');
        }
    }
);

/**
 * DELETE /auth/logout/all - Déconnexion globale (toutes sessions)
 */
router.delete('/all',
    AuthMiddleware.authenticate(),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🚪🚪 Déconnexion GLOBALE pour: ${user.prenom} ${user.nom}`);

            // Révocation de TOUS les tokens actifs
            const revokedTokens = await prisma.userToken.updateMany({
                where: {
                    userId: user.id,
                    typeToken: {
                        in: ['ACCESS', 'REFRESH']
                    },
                    utilise: false,
                    dateExpiration: {
                        gt: new Date()
                    }
                },
                data: {
                    utilise: true
                }
            });

            console.log(`✅ Déconnexion GLOBALE: ${user.prenom} ${user.nom} - ${revokedTokens.count} tokens révoqués`);

            return ApiResponse.success(res, 'Déconnexion globale réussie', {
                logoutInfo: {
                    userId: user.id,
                    userRole: user.role,
                    tokensRevoked: revokedTokens.count,
                    logoutTime: new Date().toISOString(),
                    ip: clientIp
                },
                securityInfo: {
                    message: 'Tous vos tokens d\'accès ont été révoqués',
                    action: 'Vous devez vous reconnecter pour accéder à nouveau',
                    affectedDevices: 'Tous les appareils connectés'
                },
                nextSteps: [
                    'Reconnectez-vous avec vos identifiants',
                    'Toutes vos sessions ont été fermées',
                    'Cette action améliore la sécurité de votre compte'
                ]
            });
            
        } catch (error) {
            console.error('❌ Erreur déconnexion globale:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la déconnexion globale');
        }
    }
);

module.exports = router;