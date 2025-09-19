const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

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

    async loadTemplate(templateName) {
        try {
            const templatePath = path.join(process.cwd(), 'templates', 'email', `${templateName}.html`);
            return await fs.readFile(templatePath, 'utf8');
        } catch (error) {
            console.error(`Erreur chargement template ${templateName}:`, error);
            // Retourner un template par défaut si le fichier n'existe pas
            return await this.getDefaultTemplate();
        }
    }

    replaceVariables(template, variables) {
        let result = template;

        // Variables de base
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, value || '');
        }

        // Gestion des classes conditionnelles pour masquer/afficher les sections
        const conditionalClasses = {
            badgeClass: variables.badge ? '' : 'hidden',
            ctaClass: variables.ctaText ? '' : 'hidden',
            featuresClass: variables.featuresList ? '' : 'hidden',
            infoBoxClass: variables.infoBoxTitle ? '' : 'hidden',
            warningBoxClass: variables.warningBoxTitle ? '' : 'hidden',
            contactInfoClass: variables.showContactInfo ? '' : 'hidden',
            detailsClass: variables.details ? '' : 'hidden'
        };

        // Remplacer les classes conditionnelles
        for (const [key, value] of Object.entries(conditionalClasses)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, value);
        }

        return result;
    }

    async renderTemplate(templateName, variables) {
        const template = await this.loadTemplate(templateName);
        return this.replaceVariables(template, variables);
    }

    async getDefaultTemplate() {
        try {
            // Essayer de charger le template de base
            return await this.loadTemplate('base');
        } catch (error) {
            // Template de fallback minimal si base.html n'existe pas
            return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>{{titre}} - Plateforme Médecins-Patients</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; color: #000; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #009787 0%, #007a6b 100%); color: #fff; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .footer { background: #E0E0E0; padding: 20px; text-align: center; font-size: 12px; color: #757575; }
        .cta-button { display: inline-block; background: #009787; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Plateforme Médecins-Patients</h1>
            <p>Votre santé, notre priorité</p>
        </div>
        <div class="content">
            <h2 style="color: #009787;">{{titre}}</h2>
            <p>Bonjour {{prenom}} {{nom}},</p>
            <div style="color: #757575; line-height: 1.7;">{{message}}</div>
        </div>
        <div class="footer">
            <p><strong>Plateforme Médecins-Patients - Côte d'Ivoire</strong></p>
            <p>Ceci est un email automatique, merci de ne pas répondre.</p>
        </div>
    </div>
</body>
</html>`;
        }
    }

    async sendNotificationEmail({ to, subject, templateName, variables }) {
        try {
            // Ajouter l'URL du logo aux variables
            const enhancedVariables = {
                ...variables,
                logoUrl: process.env.APP_URL ? `${process.env.APP_URL}/images/logo.png` : 'https://via.placeholder.com/180x60/009787/FFFFFF?text=MALAIKA'
            };

            const html = await this.renderTemplate(templateName, enhancedVariables);

            return await this.sendEmail({
                to,
                subject,
                html,
                text: variables.message // Fallback text
            });

        } catch (error) {
            console.error('Erreur envoi email notification:', error);
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