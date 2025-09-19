/**
 * Service pour masquer partiellement les informations de contact
 * selon le statut de confirmation du rendez-vous
 */

class ContactMaskingService {
    /**
     * Masque partiellement un numéro de téléphone
     * Ex: 0701234567 -> 07*****67
     * @param {string} telephone - Le numéro de téléphone à masquer
     * @returns {string} Le numéro masqué
     */
    static maskPhone(telephone) {
        if (!telephone || typeof telephone !== 'string') {
            return '';
        }

        const cleanPhone = telephone.replace(/\s+/g, '');

        if (cleanPhone.length < 4) {
            return cleanPhone;
        }

        // Garde les 2 premiers et 2 derniers chiffres
        const start = cleanPhone.substring(0, 2);
        const end = cleanPhone.substring(cleanPhone.length - 2);
        const middle = '*'.repeat(Math.max(cleanPhone.length - 4, 1));

        return `${start}${middle}${end}`;
    }

    /**
     * Masque partiellement une adresse email
     * Ex: user@example.com -> u***@example.com
     * @param {string} email - L'email à masquer
     * @returns {string} L'email masqué
     */
    static maskEmail(email) {
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return '';
        }

        const [localPart, domain] = email.split('@');

        if (localPart.length <= 1) {
            return `${localPart}***@${domain}`;
        }

        // Garde le premier caractère et masque le reste jusqu'à @
        const maskedLocal = localPart.charAt(0) + '*'.repeat(Math.max(localPart.length - 1, 3));

        return `${maskedLocal}@${domain}`;
    }

    /**
     * Détermine si les contacts doivent être masqués selon le statut du rendez-vous
     * @param {string} statutRendezVous - Le statut du rendez-vous
     * @param {string} userRole - Le rôle de l'utilisateur ('PATIENT' ou 'MEDECIN')
     * @returns {boolean} True si les contacts doivent être masqués
     */
    static shouldMaskContacts(statutRendezVous, userRole) {
        // Les contacts sont masqués tant que le médecin n'a pas confirmé
        // Statuts où les contacts restent masqués : DEMANDE, EN_ATTENTE
        // Statuts où les contacts sont visibles : CONFIRME, EN_COURS, TERMINE, ANNULE, REFUSE

        const statutsAvecContactsVisibles = ['CONFIRME', 'EN_COURS', 'TERMINE', 'ANNULE', 'REFUSE'];

        return !statutsAvecContactsVisibles.includes(statutRendezVous);
    }

    /**
     * Applique le masquage des contacts selon les règles métier
     * @param {Object} contactInfo - Les informations de contact
     * @param {string} contactInfo.telephone - Le téléphone
     * @param {string} contactInfo.email - L'email
     * @param {string} statutRendezVous - Le statut du rendez-vous
     * @param {string} userRole - Le rôle de l'utilisateur
     * @returns {Object} Les contacts masqués ou non selon les règles
     */
    static applyContactMasking(contactInfo, statutRendezVous, userRole) {
        if (!contactInfo) {
            return { telephone: '', email: '' };
        }

        const shouldMask = this.shouldMaskContacts(statutRendezVous, userRole);

        if (!shouldMask) {
            // Pas de masquage nécessaire, retourner les contacts tels quels
            return {
                telephone: contactInfo.telephone || '',
                email: contactInfo.email || ''
            };
        }

        // Appliquer le masquage
        return {
            telephone: this.maskPhone(contactInfo.telephone),
            email: this.maskEmail(contactInfo.email),
            // Indicateur pour le frontend
            contactsMasques: true
        };
    }
}

module.exports = ContactMaskingService;