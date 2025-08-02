const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const TokenService = require('../../services/TokenService');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const Consts = require('../../config/const');
const crypto = require('crypto'); // ← SEUL AJOUT

// ← SCHÉMA ORIGINAL INCHANGÉ
const otpVerifySchema = {
    fields: {
        telephone: {
            type: 'phone'
        },
        otp: {
            type: 'string',
            minLength: 4,
            maxLength: 4,
            pattern: '^[0-9]{4}$'
        }
    },
    required: ['telephone', 'otp'],
    strict: true
};

/**
 * POST /auth/otp/verify - Vérification du code OTP
 * - Si patient existant : connexion automatique avec tokens
 * - Si autre rôle existant : vérification uniquement
 * - Si utilisateur inexistant : vérification uniquement
 */
router.post('/',
    BodyFilter.validate(otpVerifySchema), // ← INCHANGÉ
    async (req, res) => {
        try {
            const { telephone, otp } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🔐 Vérification OTP pour: ${telephone} - Code: ${otp} - IP: ${clientIp}`);

            // ← LOGIQUE ORIGINALE INCHANGÉE
            const cleanPhone = telephone.replace(/[^0-9]/g, '');

            const otpRecord = await prisma.otp.findFirst({
                where: {
                    telephone: cleanPhone,
                    code: otp,
                    utilise: false,
                    expiresAt: {
                        gt: new Date()
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (!otpRecord) {
                // ← GESTION ERREURS ORIGINALE INCHANGÉE
                const expiredOtp = await prisma.otp.findFirst({
                    where: {
                        telephone: cleanPhone,
                        code: otp,
                        utilise: false
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (expiredOtp) {
                    console.log(`⏰ Code OTP expiré pour ${cleanPhone}`);
                    return ApiResponse.badRequest(res, 'Code de vérification expiré', {
                        code: 'OTP_EXPIRED',
                        message: 'Le code de vérification a expiré. Veuillez demander un nouveau code.'
                    });
                }

                console.log(`❌ Code OTP invalide pour ${cleanPhone}`);
                return ApiResponse.badRequest(res, 'Code de vérification invalide', {
                    code: 'OTP_INVALID',
                    message: 'Le code de vérification fourni est incorrect.'
                });
            }

            // ← MARQUER OTP UTILISÉ - INCHANGÉ
            await prisma.otp.update({
                where: { id: otpRecord.id },
                data: { utilise: true }
            });

            console.log(`✅ Code OTP valide pour: ${cleanPhone}`);

            // ← RECHERCHE UTILISATEUR - INCHANGÉE
            const existingUser = await prisma.user.findUnique({
                where: { telephone: cleanPhone },
                include: {
                    patient: true,
                    medecin: true
                }
            });

            // ← CAS 1 PATIENT : AJOUTER UNIQUEMENT LE STOCKAGE
            if (existingUser && existingUser.role === 'PATIENT') {
                if (existingUser.statut !== 'ACTIF') {
                    return ApiResponse.forbidden(res, 'Votre compte patient est suspendu. Contactez le support.');
                }

                // Générer les tokens JWT pour le patient
                const accessToken = TokenService.generateToken(existingUser);
                const refreshToken = TokenService.generateRefreshToken(existingUser);

                // ← AJOUT : STOCKAGE DES TOKENS EN BASE
                try {
                    const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
                    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

                    const accessExpirationDate = new Date();
                    const refreshExpirationDate = new Date();

                    const accessDuration = Consts.JWT_EXPIRATION.PATIENT.access || '7d';
                    const refreshDuration = Consts.JWT_EXPIRATION.PATIENT.refresh || '30d';

                    const accessDurationMs = TokenService._getExpirationMilliseconds(accessDuration);
                    const refreshDurationMs = TokenService._getExpirationMilliseconds(refreshDuration);

                    accessExpirationDate.setTime(accessExpirationDate.getTime() + accessDurationMs);
                    refreshExpirationDate.setTime(refreshExpirationDate.getTime() + refreshDurationMs);

                    await prisma.userToken.createMany({
                        data: [
                            {
                                userId: existingUser.id,
                                typeToken: 'ACCESS',
                                tokenHash: accessTokenHash,
                                dateExpiration: accessExpirationDate,
                                utilise: false
                            },
                            {
                                userId: existingUser.id,
                                typeToken: 'REFRESH',
                                tokenHash: refreshTokenHash,
                                dateExpiration: refreshExpirationDate,
                                utilise: false
                            }
                        ]
                    });

                    console.log(`💾 Tokens stockés en base pour: ${existingUser.prenom} ${existingUser.nom}`);
                } catch (tokenError) {
                    console.error('❌ Erreur stockage tokens:', tokenError);
                    // On continue même si le stockage échoue
                }

                // ← RÉPONSE ORIGINALE INCHANGÉE
                const patientInfo = {
                    id: existingUser.id,
                    telephone: existingUser.telephone,
                    email: existingUser.email,
                    nom: existingUser.nom,
                    prenom: existingUser.prenom,
                    role: existingUser.role,
                    statut: existingUser.statut,
                    patient: existingUser.patient ? {
                        id: existingUser.patient.id,
                        dateNaissance: existingUser.patient.dateNaissance,
                        sexe: existingUser.patient.sexe,
                        ville: existingUser.patient.ville
                    } : null
                };

                console.log(`🎯 Connexion automatique patient: ${existingUser.prenom} ${existingUser.nom}`);

                return ApiResponse.success(res, 'Connexion réussie', {
                    authType: 'PATIENT_LOGIN',
                    user: patientInfo,
                    tokens: {
                        accessToken,
                        refreshToken,
                        expiresIn: Consts.JWT_EXPIRATION.PATIENT.access
                    },
                    sessionInfo: {
                        ip: clientIp,
                        timestamp: new Date().toISOString(),
                        loginMethod: 'OTP'
                    }
                });
            }

            // ← RESTE DU CODE INCHANGÉ (CAS 2 et 3)
            if (existingUser && (existingUser.role === 'MEDECIN' || existingUser.role === 'ADMIN')) {
                let nextStepsMessage = [];

                if (existingUser.role === 'MEDECIN') {
                    nextStepsMessage = [
                        'Utilisez votre email et mot de passe pour vous connecter',
                        'Endpoint: POST /v1/auth/login'
                    ];
                } else if (existingUser.role === 'ADMIN') {
                    nextStepsMessage = [
                        'Utilisez vos identifiants administrateur pour vous connecter',
                        'Endpoint: POST /v1/auth/login'
                    ];
                }

                return ApiResponse.success(res, 'Numéro vérifié avec succès', {
                    authType: 'VERIFICATION_ONLY',
                    telephone: cleanPhone,
                    isValidated: true,
                    userExists: true,
                    userInfo: {
                        id: existingUser.id,
                        telephone: existingUser.telephone,
                        nom: existingUser.nom,
                        prenom: existingUser.prenom,
                        role: existingUser.role,
                        statut: existingUser.statut
                    },
                    nextSteps: nextStepsMessage,
                    validationInfo: {
                        validatedAt: new Date().toISOString(),
                        ip: clientIp,
                        validUntil: new Date(Date.now() + (10 * 60 * 1000)).toISOString()
                    }
                });
            }

            // CAS 3: UTILISATEUR INEXISTANT → VÉRIFICATION UNIQUEMENT
            return ApiResponse.success(res, 'Numéro vérifié avec succès', {
                authType: 'VERIFICATION_ONLY',
                telephone: cleanPhone,
                isValidated: true,
                userExists: false,
                userInfo: null,
                nextSteps: [
                    'Votre numéro est vérifié',
                    'Vous pouvez maintenant créer votre compte patient',
                    'Endpoint: POST /v1/auth/register/patient'
                ],
                validationInfo: {
                    validatedAt: new Date().toISOString(),
                    ip: clientIp,
                    validUntil: new Date(Date.now() + (10 * 60 * 1000)).toISOString()
                }
            });

        } catch (error) {
            console.error('❌ Erreur vérification OTP:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la vérification');
        }
    }
);

module.exports = router;