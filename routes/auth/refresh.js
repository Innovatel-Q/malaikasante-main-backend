const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const TokenService = require('../../services/TokenService');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const Consts = require('../../config/const');

// Schéma de validation
const refreshSchema = {
    fields: {
        refreshToken: {
            type: 'string',
            minLength: 10,
            maxLength: 500
        }
    },
    required: ['refreshToken'],
    strict: true
};

/**
 * POST /auth/refresh - Renouvellement des tokens d'accès
 */
router.post('/',
    BodyFilter.validate(refreshSchema),
    async (req, res) => {
        try {
            const { refreshToken } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🔄 Demande refresh token - IP: ${clientIp}`);

            // Vérification de la validité du JWT refresh token
            const tokenCheck = TokenService.checkToken(refreshToken);
            if (!tokenCheck.isValid) {
                console.log(`❌ Refresh token JWT invalide ou expiré`);
                return ApiResponse.unauthorized(res, 'Refresh token invalide ou expiré');
            }

            // Vérifier que c'est bien un refresh token
            if (tokenCheck.payload.type !== 'REFRESH') {
                console.log(`❌ Token fourni n'est pas un refresh token: ${tokenCheck.payload.type}`);
                return ApiResponse.unauthorized(res, 'Type de token incorrect');
            }

            // Hash du token pour recherche en base
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            // Recherche du refresh token en base (non utilisé et non expiré)
            const refreshTokenRecord = await prisma.userToken.findFirst({
                where: {
                    tokenHash,
                    typeToken: 'REFRESH',
                    utilise: false,
                    dateExpiration: {
                        gt: new Date()
                    }
                },
                include: {
                    user: {
                        include: {
                            patient: true,
                            medecin: true
                        }
                    }
                }
            });

            if (!refreshTokenRecord) {
                console.log(`❌ Refresh token non trouvé, déjà utilisé ou expiré`);
                return ApiResponse.unauthorized(res, 'Refresh token invalide ou déjà utilisé');
            }

            const user = refreshTokenRecord.user;

            // Vérifier que l'utilisateur correspond au token
            if (user.id !== tokenCheck.payload.userId) {
                console.log(`❌ Incohérence userId: DB=${user.id}, Token=${tokenCheck.payload.userId}`);
                return ApiResponse.unauthorized(res, 'Token invalide');
            }

            // Vérifier que l'utilisateur est toujours actif
            if (user.statut !== 'ACTIF') {
                console.log(`❌ Utilisateur inactif: ${user.id} - Statut: ${user.statut}`);
                return ApiResponse.forbidden(res, 'Compte utilisateur suspendu ou désactivé');
            }

            // Vérifications spécifiques pour les médecins
            if (user.role === 'MEDECIN') {
                if (!user.medecin || user.medecin.statutValidation !== 'VALIDE') {
                    console.log(`❌ Médecin non validé: ${user.id}`);
                    return ApiResponse.forbidden(res, 'Compte médecin non validé');
                }
            }

            // Vérifier que ce rôle peut utiliser des refresh tokens
            if (user.role === 'ADMIN') {
                console.log(`❌ Tentative refresh pour admin: ${user.id}`);
                return ApiResponse.forbidden(res, 'Les administrateurs ne peuvent pas rafraîchir leurs tokens');
            }

            // Transaction pour rotation des tokens
            const result = await prisma.$transaction(async (tx) => {
                // 1. Marquer l'ancien refresh token comme utilisé
                await tx.userToken.update({
                    where: { id: refreshTokenRecord.id },
                    data: { utilise: true }
                });

                // 2. Générer nouveaux tokens
                const newAccessToken = TokenService.generateToken(user);
                const newRefreshToken = TokenService.generateRefreshToken(user);

                // 3. Sauvegarder le nouveau refresh token en base
                if (newRefreshToken) {
                    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
                    const expirationDate = new Date();

                    // Durée selon le rôle
                    const refreshDuration = Consts.JWT_EXPIRATION[user.role]?.refresh || '30d';
                    const durationMs = TokenService._getExpirationMilliseconds(refreshDuration);
                    expirationDate.setTime(expirationDate.getTime() + durationMs);

                    await tx.userToken.create({
                        data: {
                            userId: user.id,
                            typeToken: 'REFRESH',
                            tokenHash: newTokenHash,
                            dateExpiration: expirationDate,
                            utilise: false
                        }
                    });
                }

                return {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken
                };
            });

            console.log(`✅ Tokens rafraîchis avec succès pour: ${user.prenom} ${user.nom} (${user.role})`);

            // Réponse avec nouveaux tokens
            return ApiResponse.success(res, 'Tokens rafraîchis avec succès', {
                tokens: {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresIn: Consts.JWT_EXPIRATION[user.role]?.access || '1d'
                },
                sessionInfo: {
                    refreshedAt: new Date().toISOString(),
                    ip: clientIp,
                    userId: user.id,
                    userRole: user.role
                }
            });

        } catch (error) {
            console.error('❌ Erreur refresh token:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors du rafraîchissement');
        }
    }
);

module.exports = router;