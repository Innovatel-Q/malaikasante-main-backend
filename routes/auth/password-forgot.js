const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const EmailService = require('../../services/EmailService');
const SmsService = require('../../services/SmsService');
const TemplateService = require('../../services/TemplateService');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation pour forgot
const forgotPasswordSchema = {
    fields: {
        email: {
            type: 'email',
            required: false
        },
        telephone: {
            type: 'phone',
            required: false
        }
    },
    strict: true,
    customValidation: (data) => {
        if (!data.email && !data.telephone) {
            return {
                isValid: false,
                errors: ['Email ou numéro de téléphone requis']
            };
        }
        return { isValid: true };
    }
};

// Schéma de validation pour reset
const resetPasswordSchema = {
    fields: {
        token: {
            type: 'string',
            minLength: 1,
            maxLength: 100
        },
        code: {
            type: 'string',
            minLength: 6,
            maxLength: 6
        },
        newPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 100
        }
    },
    required: ['token', 'code', 'newPassword'],
    strict: true
};

/**
 * POST /auth/password/forgot - Demande de réinitialisation
 */
router.post('/forgot',
    BodyFilter.validate(forgotPasswordSchema),
    async (req, res) => {
        try {
            const { email, telephone } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🔄 Demande reset password: ${email || telephone} - IP: ${clientIp}`);

            // Nettoyer le téléphone si fourni
            let cleanPhone = null;
            if (telephone) {
                cleanPhone = telephone.replace(/\D/g, '');
                if (cleanPhone.length < 8 || cleanPhone.length > 10) {
                    return ApiResponse.badRequest(res, 'Numéro de téléphone invalide');
                }
            }

            // Rechercher l'utilisateur
            const whereClause = {};
            if (email) whereClause.email = email.toLowerCase().trim();
            if (cleanPhone) whereClause.telephone = cleanPhone;

            const user = await prisma.user.findFirst({
                where: whereClause,
                select: {
                    id: true,
                    email: true,
                    telephone: true,
                    nom: true,
                    prenom: true,
                    role: true,
                    statut: true,
                    medecin: {
                        select: {
                            statutValidation: true
                        }
                    }
                }
            });

            if (!user) {
                return ApiResponse.badRequest(res, 'Utilisateur non trouvé', {
                    code: 'USER_NOT_FOUND',
                    message: email ? 'Aucun compte associé à cette adresse email' : 'Aucun compte associé à ce numéro'
                });
            }

            // Vérifier que c'est un MEDECIN ou ADMIN
            if (user.role === 'PATIENT') {
                return ApiResponse.badRequest(res, 'Action non autorisée', {
                    code: 'WRONG_USER_TYPE',
                    message: 'Les patients se connectent uniquement avec un code SMS'
                });
            }

            // Vérifier que le compte est actif
            if (user.statut !== 'ACTIF') {
                return ApiResponse.badRequest(res, 'Compte inactif', {
                    code: 'ACCOUNT_INACTIVE',
                    message: 'Ce compte est suspendu ou désactivé'
                });
            }

            // Vérifier validation médecin
            if (user.role === 'MEDECIN' && user.medecin?.statutValidation !== 'VALIDE') {
                return ApiResponse.badRequest(res, 'Compte non validé', {
                    code: 'DOCTOR_NOT_VALIDATED',
                    message: 'Votre compte médecin n\'est pas encore validé'
                });
            }

            // Générer token et code
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

            // Transaction pour sauvegarder
            await prisma.$transaction(async (tx) => {
                // Supprimer anciens tokens de reset
                await tx.userToken.deleteMany({
                    where: {
                        userId: user.id,
                        type: 'RESET_PASSWORD'
                    }
                });

                // Créer nouveau token
                await tx.userToken.create({
                    data: {
                        userId: user.id,
                        type: 'RESET_PASSWORD',
                        token: resetToken,
                        payload: {
                            resetCode,
                            method: email ? 'EMAIL' : 'SMS'
                        },
                        expiresAt,
                        clientIp
                    }
                });
            });

            // Envoyer selon méthode
            const sendMethod = email ? 'EMAIL' : 'SMS';
            let sendResult = { success: false };

            if (sendMethod === 'EMAIL' && user.email) {
                const emailHtml = await TemplateService.renderTemplate('password-reset', {
                    userName: user.prenom,
                    resetCode,
                    resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
                    expiryMinutes: 30
                });

                sendResult = await EmailService.sendEmail({
                    to: user.email,
                    subject: 'Réinitialisation de votre mot de passe',
                    html: emailHtml
                });

            } else if (sendMethod === 'SMS' && user.telephone) {
                sendResult = await SmsService.sendSms(
                    user.telephone,
                    `Votre code de réinitialisation : ${resetCode}. Valide 30 minutes.`
                );
            }

            if (!sendResult.success) {
                return ApiResponse.serverError(res, 'Erreur lors de l\'envoi', {
                    code: 'SEND_FAILED',
                    message: 'Impossible d\'envoyer le code de réinitialisation'
                });
            }

            console.log(`✅ Reset password envoyé par ${sendMethod}: ${user.id}`);

            return ApiResponse.success(res, 'Code de réinitialisation envoyé', {
                method: sendMethod,
                destination: email ? user.email : user.telephone,
                expiresIn: 30,
                token: resetToken // Optionnel : pour le frontend
            });

        } catch (error) {
            console.error('Erreur password/forgot:', error);
            return ApiResponse.serverError(res, 'Erreur interne du serveur');
        }
    }
);

/**
 * POST /auth/password/reset - Réinitialiser avec token + code
 */
router.post('/reset',
    BodyFilter.validate(resetPasswordSchema),
    async (req, res) => {
        try {
            const { token, code, newPassword } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🔄 Tentative reset password avec token: ${token.substring(0, 8)}...`);

            // Vérifier le token de reset
            const resetToken = await prisma.userToken.findFirst({
                where: {
                    token,
                    type: 'RESET_PASSWORD',
                    utilise: false,
                    expiresAt: {
                        gt: new Date()
                    }
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            nom: true,
                            prenom: true,
                            role: true,
                            statut: true
                        }
                    }
                }
            });

            if (!resetToken) {
                return ApiResponse.badRequest(res, 'Token invalide ou expiré', {
                    code: 'INVALID_TOKEN',
                    message: 'Le lien de réinitialisation est invalide ou a expiré'
                });
            }

            // Vérifier le code de réinitialisation
            const storedCode = resetToken.payload?.resetCode;
            if (!storedCode || storedCode !== code) {
                return ApiResponse.badRequest(res, 'Code incorrect', {
                    code: 'INVALID_CODE',
                    message: 'Le code de réinitialisation est incorrect'
                });
            }

            // Vérifier que l'utilisateur est toujours actif
            if (resetToken.user.statut !== 'ACTIF') {
                return ApiResponse.badRequest(res, 'Compte inactif', {
                    code: 'ACCOUNT_INACTIVE',
                    message: 'Ce compte est suspendu ou désactivé'
                });
            }

            // Hasher le nouveau mot de passe
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash(newPassword, 12);

            // Transaction pour réinitialiser
            await prisma.$transaction(async (tx) => {
                // Mettre à jour le mot de passe
                await tx.user.update({
                    where: { id: resetToken.user.id },
                    data: { password: hashedPassword }
                });

                // Marquer le token comme utilisé
                await tx.userToken.update({
                    where: { id: resetToken.id },
                    data: { utilise: true }
                });

                // Révoquer tous les autres tokens actifs (déconnexion globale)
                await tx.userToken.updateMany({
                    where: {
                        userId: resetToken.user.id,
                        type: { in: ['ACCESS', 'REFRESH'] },
                        utilise: false
                    },
                    data: { utilise: true }
                });
            });

            console.log(`✅ Mot de passe réinitialisé pour: ${resetToken.user.id}`);

            return ApiResponse.success(res, 'Mot de passe réinitialisé avec succès', {
                message: 'Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.',
                redirectToLogin: true
            });

        } catch (error) {
            console.error('Erreur password/reset:', error);
            return ApiResponse.serverError(res, 'Erreur interne du serveur');
        }
    }
);

module.exports = router;