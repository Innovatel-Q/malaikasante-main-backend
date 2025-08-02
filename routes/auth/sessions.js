const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /auth/sessions - Lister les sessions actives de l'utilisateur
 */
router.get('/',
    AuthMiddleware.authenticate(),
    async (req, res) => {
        try {
            const user = req.user;

            console.log(`👥 Récupération des sessions pour: ${user.prenom} ${user.nom}`);

            // Récupérer toutes les sessions actives (tokens non utilisés et non expirés)
            const activeSessions = await prisma.userToken.findMany({
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
                select: {
                    id: true,
                    typeToken: true,
                    tokenHash: true,
                    createdAt: true,
                    dateExpiration: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            // Grouper par paires ACCESS/REFRESH (créées en même temps)
            const sessions = [];
            const accessTokens = activeSessions.filter(token => token.typeToken === 'ACCESS');

            for (const accessToken of accessTokens) {
                // Chercher le refresh token associé (créé en même temps)
                const refreshToken = activeSessions.find(token =>
                    token.typeToken === 'REFRESH' &&
                    Math.abs(new Date(token.createdAt) - new Date(accessToken.createdAt)) < 10000 // 10 secondes de différence max
                );

                sessions.push({
                    sessionId: accessToken.id,
                    createdAt: accessToken.createdAt,
                    lastActivity: accessToken.createdAt, // Pour l'instant = createdAt
                    expiresAt: accessToken.dateExpiration,
                    status: 'active',
                    tokens: {
                        accessToken: {
                            id: accessToken.id,
                            expiresAt: accessToken.dateExpiration,
                            hash: accessToken.tokenHash.substring(0, 8) + '...' // Début du hash pour debug
                        },
                        refreshToken: refreshToken ? {
                            id: refreshToken.id,
                            expiresAt: refreshToken.dateExpiration,
                            hash: refreshToken.tokenHash.substring(0, 8) + '...'
                        } : null
                    }
                });
            }

            // Statistiques
            const stats = {
                totalSessions: sessions.length,
                totalTokens: activeSessions.length,
                oldestSession: sessions[sessions.length - 1],
                newestSession: sessions[0]
            };

            console.log(`✅ ${sessions.length} sessions actives trouvées pour: ${user.prenom} ${user.nom}`);

            return ApiResponse.success(res, 'Sessions récupérées avec succès', {
                user: {
                    id: user.id,
                    nom: user.nom,
                    prenom: user.prenom,
                    role: user.role
                },
                sessions,
                stats,
                securityInfo: {
                    message: 'Liste de vos sessions actives',
                    note: 'Les tokens sont stockés sous forme de hash pour la sécurité',
                    action: 'Utilisez "Déconnecter tout" si vous détectez une activité suspecte'
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération sessions:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la récupération des sessions');
        }
    }
);

module.exports = router;