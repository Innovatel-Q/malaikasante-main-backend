const axios = require('axios');
const Consts = require('../config/const');

/**
 * Service d'envoi de SMS via l'API LeTexto
 */
class SmsService {
    /**
     * Génère un code OTP numérique
     */
    static generateOtp(length = Consts.OTP_CONFIG.length) {
        const digits = '0123456789';
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += digits[Math.floor(Math.random() * digits.length)];
        }
        return otp;
    }

    /**
     * Effectue une requête GET HTTP vers l'API LeTexto
     */
    static async _makeGetRequest({ baseUrl, endpoint }) {
        try {
            const response = await axios.get(`${baseUrl}${endpoint}`, {
                timeout: 10000 // 10 secondes
            });

            return {
                success: true,
                data: response.data,
                status: response.status
            };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || error.message,
                status: error.response?.status || 500
            };
        }
    }

    /**
     * Envoie un SMS via l'API LeTexto
     */
    static async sendSms(phone, message) {
        try {
            const { baseUrl, apiKey, sender, countryCode } = Consts.SMS_CONFIG;

            // Validation des paramètres
            if (!baseUrl || !apiKey) {
                return {
                    success: false,
                    message: 'Configuration SMS manquante'
                };
            }

            if (!phone || !message) {
                return {
                    success: false,
                    message: 'Numéro de téléphone et message requis'
                };
            }

            // Nettoyage du numéro (enlever espaces, tirets, etc.)
            const cleanPhone = phone.replace(/[^0-9]/g, '');

            // Construction de l'endpoint LeTexto
            let endpoint = '/messages/send';
            endpoint += `?token=${apiKey}`;
            endpoint += `&from=${sender}`;
            endpoint += `&to=${countryCode}${cleanPhone}`;
            endpoint += `&content=${encodeURIComponent(message)}`;

            // Envoi de la requête
            const result = await this._makeGetRequest({
                baseUrl,
                endpoint
            });

            if (result.success) {
                console.log(`✅ SMS envoyé avec succès au ${countryCode}${cleanPhone}`);
                return {
                    success: true,
                    data: result.data,
                    phoneNumber: `${countryCode}${cleanPhone}`
                };
            } else {
                console.error(`❌ Erreur SMS LeTexto: ${result.message}`);
                return {
                    success: false,
                    message: `Erreur lors de l'envoi du SMS: ${result.message}`
                };
            }

        } catch (error) {
            console.error('Erreur SmsService:', error.message);
            return {
                success: false,
                message: `Erreur lors de l'envoi du SMS: ${error.message}`
            };
        }
    }

    /**
     * Envoie un code OTP par SMS avec message personnalisé
     */
    static async sendOtp(phone, otp) {
        const message = `Votre code de vérification ${Consts.APP_NAME} est: ${otp}. Valable ${Consts.OTP_CONFIG.expirationMinutes} minutes.`;
        return await this.sendSms(phone, message);
    }

    /**
     * Envoie un SMS de rappel de rendez-vous
     */
    static async sendRendezVousReminder(phone, medecinName, dateRendezVous, heureRendezVous) {
        const message = `Rappel: Rendez-vous avec Dr ${medecinName} le ${dateRendezVous} à ${heureRendezVous}. ${Consts.APP_NAME}`;
        return await this.sendSms(phone, message);
    }

    /**
     * Envoie un SMS de confirmation de rendez-vous
     */
    static async sendRendezVousConfirmation(phone, medecinName, dateRendezVous, heureRendezVous) {
        const message = `✅ Rendez-vous confirmé avec Dr ${medecinName} le ${dateRendezVous} à ${heureRendezVous}. ${Consts.APP_NAME}`;
        return await this.sendSms(phone, message);
    }
}

module.exports = SmsService;