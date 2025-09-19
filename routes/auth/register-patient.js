const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const TokenService = require('../../services/TokenService');
const NotificationService = require('../../services/NotificationService');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const Consts = require('../../config/const');
const crypto = require('crypto'); // ← SEUL AJOUT

// ← SCHÉMA ORIGINAL INCHANGÉ (PAS de password pour les patients)
const registerPatientSchema = {
    fields: {
        nom: {
            type: 'string',
            minLength: 2,
            maxLength: 100
        },
        prenom: {
            type: 'string',
            minLength: 2,
            maxLength: 100
        },
        telephone: {
            type: 'phone'
        },
        email: {
            type: 'email'
        },
        dateNaissance: {
            type: 'date'
        },
        sexe: {
            type: 'string',
            enum: ['M', 'F', 'AUTRE']
        }
    },
    required: ['nom', 'prenom', 'telephone', 'email'], // ← PAS de password
    strict: true
};

/**
 * POST /auth/register/patient - Inscription d'un nouveau patient (SANS mot de passe)
 */
router.post('/',
    BodyFilter.validate(registerPatientSchema), // ← INCHANGÉ
    async (req, res) => {
        try {
            const { nom, prenom, telephone, email, dateNaissance, sexe } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`👤 Inscription patient: ${prenom} ${nom} - Tel: ${telephone} - IP: ${clientIp}`);

            // ← NETTOYAGE NUMÉRO - INCHANGÉ
            const cleanPhone = telephone.replace(/[^0-9]/g, '');

            // ← VÉRIFICATION OTP - LOGIQUE ORIGINALE INCHANGÉE
            const recentValidatedOtp = await prisma.otp.findFirst({
                where: {
                    telephone: cleanPhone,
                    utilise: true,
                    createdAt: {
                        gte: new Date(Date.now() - (10 * 60 * 1000)) // 10 minutes
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (!recentValidatedOtp) {
                console.log(`❌ Numéro non vérifié pour ${cleanPhone}`);
                return ApiResponse.badRequest(res, 'Numéro de téléphone non vérifié', {
                    code: 'PHONE_NOT_VERIFIED',
                    message: 'Vous devez d\'abord vérifier votre numéro de téléphone avec un code OTP.',
                    action: 'Utilisez l\'endpoint POST /v1/auth/otp/send puis /v1/auth/otp/verify'
                });
            }

            // ← TRANSACTION ORIGINALE - AJOUTER UNIQUEMENT LE STOCKAGE TOKENS
            const result = await prisma.$transaction(async (tx) => {
                // ← VÉRIFICATIONS UNICITÉ - INCHANGÉES
                const [existingEmail, existingPhone] = await Promise.all([
                    tx.user.findUnique({ where: { email: email.toLowerCase() } }),
                    tx.user.findUnique({ where: { telephone: cleanPhone } })
                ]);

                if (existingEmail) {
                    throw new Error('EMAIL_EXISTS');
                }

                if (existingPhone) {
                    throw new Error('PHONE_EXISTS');
                }

                // ← CRÉATION UTILISATEUR - INCHANGÉE
                const user = await tx.user.create({
                    data: {
                        email: email.toLowerCase(),
                        telephone: cleanPhone,
                        nom: nom.trim(),
                        prenom: prenom.trim(),
                        password: null, // 👈 Patients OTP n'ont pas de mot de passe
                        role: 'PATIENT',
                        statut: 'ACTIF',
                        canalCommunicationPrefere: 'SMS'
                    }
                });

                // ← CRÉATION PATIENT - INCHANGÉE
                const patient = await tx.patient.create({
                    data: {
                        userId: user.id,
                        dateNaissance: dateNaissance || null,
                        sexe: sexe || 'AUTRE',
                        ville: 'Abidjan', // Valeur par défaut
                        abonneContenuPro: false
                    }
                });

                // ← GÉNÉRATION TOKENS - INCHANGÉE
                const accessToken = TokenService.generateToken(user);
                const refreshToken = TokenService.generateRefreshToken(user);

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

                    await tx.userToken.createMany({
                        data: [
                            {
                                userId: user.id,
                                typeToken: 'ACCESS',
                                tokenHash: accessTokenHash,
                                dateExpiration: accessExpirationDate,
                                utilise: false
                            },
                            {
                                userId: user.id,
                                typeToken: 'REFRESH',
                                tokenHash: refreshTokenHash,
                                dateExpiration: refreshExpirationDate,
                                utilise: false
                            }
                        ]
                    });

                    console.log(`💾 Tokens stockés en base pour nouveau patient: ${user.prenom} ${user.nom}`);
                } catch (tokenError) {
                    console.error('❌ Erreur stockage tokens:', tokenError);
                    // On continue même si le stockage échoue
                }

                return { user, patient, accessToken, refreshToken };
            });

            // ← PRÉPARATION INFOS UTILISATEUR - INCHANGÉE
            const userInfo = {
                id: result.user.id,
                telephone: result.user.telephone,
                email: result.user.email,
                nom: result.user.nom,
                prenom: result.user.prenom,
                role: result.user.role,
                statut: result.user.statut,
                hasPassword: false, // 👈 Indique que ce patient n'a pas de mot de passe
                authMethod: 'OTP_ONLY', // 👈 Méthode d'authentification
                patient: {
                    id: result.patient.id,
                    dateNaissance: result.patient.dateNaissance,
                    sexe: result.patient.sexe,
                    ville: result.patient.ville,
                    abonneContenuPro: result.patient.abonneContenuPro
                }
            };

            console.log(`✅ Patient créé avec succès: ${result.user.prenom} ${result.user.nom} (ID: ${result.user.id})`);

            // Envoyer email de bienvenue
            try {
                await NotificationService.notifyPatientBienvenue(result.patient);
                console.log(`📧 Email de bienvenue envoyé à ${result.user.email}`);
            } catch (emailError) {
                console.error('Erreur envoi email bienvenue:', emailError);
                // Ne pas faire échouer l'inscription si l'email échoue
            }

            // ← RÉPONSE ORIGINALE INCHANGÉE
            return ApiResponse.created(res, 'Compte patient créé avec succès', {
                user: userInfo,
                tokens: {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresIn: Consts.JWT_EXPIRATION.PATIENT.access
                },
                accountInfo: {
                    createdAt: result.user.createdAt,
                    ip: clientIp,
                    registrationMethod: 'OTP_VERIFICATION',
                    welcomeMessage: 'Bienvenue sur la plateforme ! Votre compte patient est maintenant actif.'
                }
            });

        } catch (error) {
            console.error('❌ Erreur inscription patient:', error);

            // ← GESTION ERREURS - INCHANGÉE
            if (error.message === 'EMAIL_EXISTS') {
                return ApiResponse.conflict(res, 'Un compte existe déjà avec cet email', {
                    code: 'EMAIL_EXISTS',
                    field: 'email'
                });
            }

            if (error.message === 'PHONE_EXISTS') {
                return ApiResponse.conflict(res, 'Un compte existe déjà avec ce numéro de téléphone', {
                    code: 'PHONE_EXISTS',
                    field: 'telephone'
                });
            }

            return ApiResponse.serverError(res, 'Erreur interne lors de l\'inscription');
        }
    }
);

module.exports = router;