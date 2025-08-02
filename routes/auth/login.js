const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const TokenService = require('../../services/TokenService');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const Consts = require('../../config/const');
const crypto = require('crypto'); // ← SEUL AJOUT

// ← SCHÉMA ORIGINAL INCHANGÉ
const loginSchema = {
    fields: {
        email: {
            type: 'email'
        },
        password: {
            type: 'string',
            minLength: 1,
            maxLength: 100
        }
    },
    required: ['email', 'password'],
    strict: true
};

/**
 * POST /auth/login - Connexion avec email et mot de passe
 * Exclusivement pour les médecins (patients utilisent OTP)
 */
router.post('/',
    BodyFilter.validate(loginSchema), // ← INCHANGÉ
    async (req, res) => {
        try {
            const { email, password } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🔐 Tentative connexion: ${email} - IP: ${clientIp}`);

            // ← RECHERCHE UTILISATEUR - LOGIQUE ORIGINALE INCHANGÉE
            const user = await prisma.user.findUnique({
                where: { email: email.toLowerCase().trim() },
                select: {
                    id: true,
                    email: true,
                    nom: true,
                    prenom: true,
                    password: true,
                    role: true,
                    statut: true,
                    medecin: {
                        select: {
                            statutValidation: true,
                            motifRejet: true
                        }
                    }
                }
            });

            if (!user) {
                console.log(`❌ Email non trouvé: ${email}`);
                return ApiResponse.badRequest(res, 'Identifiants incorrects', {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Email ou mot de passe incorrect.'
                });
            }

            // ← INTERDICTION PATIENTS - LOGIQUE ORIGINALE INCHANGÉE
            if (user.role === 'PATIENT') {
                console.log(`❌ Tentative login patient via email: ${email}`);
                return ApiResponse.badRequest(res, 'Méthode de connexion incorrecte', {
                    code: 'WRONG_AUTH_METHOD',
                    message: 'Les patients se connectent uniquement par SMS avec un code de vérification.',
                    correctEndpoint: 'POST /v1/auth/otp/send puis /v1/auth/otp/verify'
                });
            }

            // ← VÉRIFICATION MOT DE PASSE - INCHANGÉE
            if (!user.password) {
                console.log(`❌ Pas de mot de passe pour: ${email}`);
                return ApiResponse.badRequest(res, 'Identifiants incorrects', {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Email ou mot de passe incorrect.'
                });
            }

            const passwordValid = await bcrypt.compare(password, user.password);
            if (!passwordValid) {
                console.log(`❌ Mot de passe incorrect: ${email}`);
                return ApiResponse.badRequest(res, 'Identifiants incorrects', {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Email ou mot de passe incorrect.'
                });
            }

            // ← VÉRIFICATION STATUT COMPTE - INCHANGÉE
            if (user.statut !== 'ACTIF') {
                console.log(`❌ Compte non actif: ${email} - Statut: ${user.statut}`);
                return ApiResponse.forbidden(res, 'Compte suspendu ou désactivé', {
                    code: 'ACCOUNT_SUSPENDED',
                    accountStatus: user.statut
                });
            }

            // ← VÉRIFICATIONS MÉDECIN - LOGIQUE ORIGINALE INCHANGÉE
            if (user.role === 'MEDECIN') {
                if (!user.medecin) {
                    console.log(`❌ Profil médecin manquant: ${email}`);
                    return ApiResponse.serverError(res, 'Profil médecin introuvable');
                }

                if (user.medecin.statutValidation !== 'VALIDE') {
                    let message = '';
                    let nextSteps = [];

                    switch (user.medecin.statutValidation) {
                        case 'EN_ATTENTE':
                            message = 'Votre compte médecin est en cours de validation.';
                            nextSteps = [
                                'Validation en cours par l\'administration',
                                'Délai estimé: 24-48 heures',
                                'Vous recevrez un email de confirmation',
                                'Contact: validation@medecins-patients.ci'
                            ];
                            break;
                        case 'REJETE':
                            message = 'Votre demande de validation a été rejetée.';
                            nextSteps = [
                                'Contactez l\'administration pour plus d\'informations',
                                'Motif du rejet: ' + (user.medecin.motifRejet || 'Non spécifié'),
                                'Email: validation@medecins-patients.ci'
                            ];
                            break;
                    }

                    return ApiResponse.forbidden(res, message, {
                        statutValidation: user.medecin.statutValidation,
                        motifRejet: user.medecin.motifRejet,
                        nextSteps,
                        contact: {
                            email: 'validation@medecins-patients.ci',
                            telephone: '+225 XX XX XX XX'
                        }
                    });
                }
            }

            // ← GÉNÉRATION TOKENS - INCHANGÉE
            const accessToken = TokenService.generateToken(user);
            const refreshToken = TokenService.generateRefreshToken(user);

            // ← AJOUT : STOCKAGE DES TOKENS EN BASE
            try {
                const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');

                const accessExpirationDate = new Date();
                const accessDuration = Consts.JWT_EXPIRATION[user.role]?.access || '1d';
                const accessDurationMs = TokenService._getExpirationMilliseconds(accessDuration);
                accessExpirationDate.setTime(accessExpirationDate.getTime() + accessDurationMs);

                // Données pour le stockage des tokens
                const tokensToStore = [
                    {
                        userId: user.id,
                        typeToken: 'ACCESS',
                        tokenHash: accessTokenHash,
                        dateExpiration: accessExpirationDate,
                        utilise: false
                    }
                ];

                // Ajouter le refresh token seulement si ce n'est pas un admin
                if (refreshToken && user.role !== 'ADMIN') {
                    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
                    const refreshExpirationDate = new Date();
                    const refreshDuration = Consts.JWT_EXPIRATION[user.role]?.refresh || '30d';
                    const refreshDurationMs = TokenService._getExpirationMilliseconds(refreshDuration);
                    refreshExpirationDate.setTime(refreshExpirationDate.getTime() + refreshDurationMs);

                    tokensToStore.push({
                        userId: user.id,
                        typeToken: 'REFRESH',
                        tokenHash: refreshTokenHash,
                        dateExpiration: refreshExpirationDate,
                        utilise: false
                    });
                }

                // Sauvegarder les tokens en base
                await prisma.userToken.createMany({
                    data: tokensToStore
                });

                console.log(`💾 Tokens stockés en base pour: ${user.prenom} ${user.nom} (${user.role})`);
            } catch (tokenError) {
                console.error('❌ Erreur stockage tokens:', tokenError);
                // On continue même si le stockage échoue
            }

            console.log(`✅ Connexion réussie: ${user.prenom} ${user.nom} (${user.role}) - ${email}`);

            // ← RÉPONSE ORIGINALE INCHANGÉE
            return ApiResponse.success(res, 'Connexion réussie', {
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: Consts.JWT_EXPIRATION[user.role]?.access || '1d'
                },
                sessionInfo: {
                    loginMethod: 'EMAIL_PASSWORD',
                    timestamp: new Date().toISOString(),
                    ip: clientIp
                }
            });

        } catch (error) {
            console.error('❌ Erreur connexion:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la connexion');
        }
    }
);

module.exports = router;