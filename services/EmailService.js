const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT),
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }

    async sendEmail({ to, subject, html, text }) {
        try {
            const result = await this.transporter.sendMail({
                from: `"Plateforme Médecins-Patients" <${process.env.EMAIL_FROM_ADDRESS}>`,
                to,
                subject,
                html,
                text
            });

            console.log(`📧 Email envoyé à ${to}`);
            return { success: true, messageId: result.messageId };

        } catch (error) {
            console.error('Erreur envoi email:', error);
            return { success: false, error: error.message };
        }
    }

    async testConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ Connexion email configurée');
            return true;
        } catch (error) {
            console.error('❌ Erreur configuration email:', error);
            return false;
        }
    }
}

module.exports = new EmailService();