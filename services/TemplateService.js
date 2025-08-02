const fs = require('fs').promises;
const path = require('path');

class TemplateService {
    static async loadTemplate(templateName) {
        try {
            const templatePath = path.join(process.cwd(), 'templates', 'email', `${templateName}.html`);
            return await fs.readFile(templatePath, 'utf8');
        } catch (error) {
            console.error(`Erreur chargement template ${templateName}:`, error);
            throw new Error(`Template ${templateName} non trouvé`);
        }
    }

    static replaceVariables(template, variables) {
        let result = template;

        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, value || '');
        }

        return result;
    }

    static async renderTemplate(templateName, variables) {
        const template = await this.loadTemplate(templateName);
        return this.replaceVariables(template, variables);
    }
}

module.exports = TemplateService;