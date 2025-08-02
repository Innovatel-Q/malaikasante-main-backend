const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const SmsService = require('../../services/SmsService');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const Consts = require('../../config/const');

// Schéma de validation
const otpSendSchema = {
    fields: {
        telephone: {
            type: 'phone'
        }
    },
    required: ['telephone'],
    strict: true
};

/**
 * POST /auth/otp/send - Génération et envoi d'un code OTP par SMS
 */
router.post('/',
    BodyFilter.validate(otpSendSchema),
    async (req, res) => {
        try {
            const { telephone } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`📱 Demande OTP pour: ${telephone} - IP: ${clientIp}`);

            // Nettoyage du numéro
            const cleanPhone = telephone.replace(/[^0-9]/g, '');

            // Validation longueur (Côte d'Ivoire)
            if (cleanPhone.length < 8 || cleanPhone.length > 10) {
                return ApiResponse.badRequest(res, 'Numéro de téléphone invalide pour la Côte d\'Ivoire', {
                    format: 'Le numéro doit contenir entre 8 et 10 chiffres',
                    exemples: ['01234567', '0123456789']
                });
            }

            // Vérification anti-spam (1 minute)
            const dernierOtp = await prisma.otp.findFirst({
                where: {
                    telephone: cleanPhone,
                    createdAt: {
                        gte: new Date(Date.now() - 60000)
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (dernierOtp) {
                const tempsRestant = Math.ceil((60000 - (Date.now() - dernierOtp.createdAt)) / 1000);
                return ApiResponse.badRequest(res, 'Veuillez patienter avant de demander un nouveau code', {
                    message: 'Un code OTP a déjà été envoyé récemment',
                    tempsAttenteSecondes: tempsRestant
                });
            }

            // Marquer les anciens OTP comme utilisés (nettoyage)
            await prisma.otp.updateMany({
                where: {
                    telephone: cleanPhone,
                    utilise: false
                },
                data: {
                    utilise: true
                }
            });

            // Génération du code OTP
            const otpCode = SmsService.generateOtp(Consts.OTP_CONFIG.length);
            const expirationDate = new Date(Date.now() + (Consts.OTP_CONFIG.expirationMinutes * 60 * 1000));

            console.log(`🔢 Code OTP généré: ${otpCode} (expire à ${expirationDate.toISOString()})`);

            // Sauvegarde en base
            const otpRecord = await prisma.otp.create({
                data: {
                    telephone: cleanPhone,
                    code: otpCode,
                    expiresAt: expirationDate,
                    utilise: false,
                    tentatives: 0
                }
            });

            // Envoi SMS
            const smsResult = await SmsService.sendOtp(cleanPhone, otpCode);

            if (!smsResult.success) {
                // Marquer comme utilisé si échec SMS
                await prisma.otp.update({
                    where: { id: otpRecord.id },
                    data: { utilise: true }
                });

                console.error(`❌ Échec envoi SMS pour ${cleanPhone}: ${smsResult.message}`);
                return ApiResponse.serverError(res, 'Erreur lors de l\'envoi du SMS', {
                    code: 'SMS_SEND_FAILED'
                });
            }

            console.log(`✅ OTP envoyé avec succès au ${Consts.SMS_CONFIG.countryCode}${cleanPhone}`);

            // Réponse succès
            return ApiResponse.success(res, 'Code de vérification envoyé par SMS', {
                telephone: cleanPhone,
                maskedPhone: `${cleanPhone.substring(0, 2)}${'*'.repeat(cleanPhone.length - 4)}${cleanPhone.substring(cleanPhone.length - 2)}`,
                expirationMinutes: Consts.OTP_CONFIG.expirationMinutes,
                format: `Code à ${Consts.OTP_CONFIG.length} chiffres`
            });

        } catch (error) {
            console.error('❌ Erreur génération OTP:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la génération du code');
        }
    }
);

module.exports = router;