const prisma = require('../prisma/client');
const EmailService = require('./EmailService');
const SmsService = require('./SmsService');

class NotificationService {

    /**
     * Créer une notification en base de données
     */
    static async createNotification({
        userId,
        typeNotification,
        titre,
        message,
        canal = 'EMAIL',
        priorite = 'NORMALE',
        donneesSupplementaires = null,
        dateEnvoiPrevue = null
    }) {
        try {
            const notification = await prisma.notification.create({
                data: {
                    userId,
                    typeNotification,
                    titre,
                    message,
                    canal,
                    statut: 'EN_ATTENTE',
                    priorite,
                    donneesSupplementaires,
                    dateEnvoiPrevue,
                    tentativesEnvoi: 0
                }
            });

            console.log(`📧 Notification créée: ${notification.id} pour user ${userId}`);
            return notification;

        } catch (error) {
            console.error('Erreur création notification:', error);
            throw new Error(`Erreur lors de la création de la notification: ${error.message}`);
        }
    }

    /**
     * Envoyer une notification immédiatement
     */
    static async sendNotification(notificationId) {
        try {
            const notification = await prisma.notification.findUnique({
                where: { id: notificationId },
                include: {
                    user: {
                        select: {
                            email: true,
                            telephone: true,
                            nom: true,
                            prenom: true,
                            canalCommunicationPrefere: true
                        }
                    }
                }
            });

            if (!notification) {
                throw new Error('Notification introuvable');
            }

            if (notification.statut !== 'EN_ATTENTE') {
                console.log(`⚠️ Notification ${notificationId} déjà traitée (statut: ${notification.statut})`);
                return false;
            }

            // Marquer comme tentative d'envoi
            await prisma.notification.update({
                where: { id: notificationId },
                data: {
                    tentativesEnvoi: notification.tentativesEnvoi + 1,
                    dateEnvoiReel: new Date()
                }
            });

            let success = false;
            let errorMessage = null;

            // Choisir le canal d'envoi
            const canalUtilise = notification.canal || notification.user.canalCommunicationPrefere || 'EMAIL';

            if (canalUtilise === 'EMAIL') {
                // Préparer les variables pour le template
                const templateVariables = {
                    nom: notification.user.nom,
                    prenom: notification.user.prenom,
                    titre: notification.titre,
                    message: notification.message,
                    // Ajouter les données supplémentaires directement aux variables
                    ...(notification.donneesSupplementaires || {})
                };

                const emailResult = await EmailService.sendNotificationEmail({
                    to: notification.user.email,
                    subject: notification.titre,
                    templateName: this._getEmailTemplate(notification.typeNotification),
                    variables: templateVariables
                });
                success = emailResult.success;
                errorMessage = emailResult.error;

            } else if (canalUtilise === 'SMS') {
                const smsResult = await SmsService.sendSms(
                    notification.user.telephone,
                    `${notification.titre}\n${notification.message}`
                );
                success = smsResult.success;
                errorMessage = smsResult.message;
            }

            // Mettre à jour le statut
            await prisma.notification.update({
                where: { id: notificationId },
                data: {
                    statut: success ? 'ENVOYE' : 'ECHEC',
                    ...(errorMessage && { donneesSupplementaires: { error: errorMessage } })
                }
            });

            console.log(`${success ? '✅' : '❌'} Notification ${notificationId} ${success ? 'envoyée' : 'échouée'} via ${canalUtilise}`);
            return success;

        } catch (error) {
            console.error(`Erreur envoi notification ${notificationId}:`, error);

            // Marquer comme échec
            await prisma.notification.update({
                where: { id: notificationId },
                data: {
                    statut: 'ECHEC',
                    donneesSupplementaires: { error: error.message }
                }
            });

            return false;
        }
    }

    /**
     * Traiter toutes les notifications en attente
     */
    static async processQueuedNotifications() {
        try {
            const notifications = await prisma.notification.findMany({
                where: {
                    statut: 'EN_ATTENTE',
                    OR: [
                        { dateEnvoiPrevue: null },
                        { dateEnvoiPrevue: { lte: new Date() } }
                    ]
                },
                orderBy: [
                    { priorite: 'desc' },
                    { createdAt: 'asc' }
                ],
                take: 50 // Traiter par batch
            });

            console.log(`🔄 Traitement de ${notifications.length} notifications en attente`);

            for (const notification of notifications) {
                await this.sendNotification(notification.id);
                // Petite pause pour éviter la surcharge
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return notifications.length;

        } catch (error) {
            console.error('Erreur traitement queue notifications:', error);
            throw error;
        }
    }

    /**
     * Créer et envoyer immédiatement une notification
     */
    static async createAndSendNotification(notificationData) {
        const notification = await this.createNotification(notificationData);
        const sent = await this.sendNotification(notification.id);
        return { notification, sent };
    }

    /**
     * Méthodes spécialisées pour les rendez-vous
     */

    static async notifyRendezVousConfirmed(rendezVous, messagePersonnalise = null) {
        const dateRdv = new Date(rendezVous.dateHeureDebut);
        const message = `Votre rendez-vous du ${dateRdv.toLocaleDateString('fr-FR')} à ${dateRdv.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} avec le Dr ${rendezVous.medecin.user.nom} a été confirmé.${messagePersonnalise ? ' Message du médecin: ' + messagePersonnalise : ''}`;

        return await this.createAndSendNotification({
            userId: rendezVous.patient.user.id,
            typeNotification: 'RENDEZ_VOUS',
            titre: 'Rendez-vous confirmé ✅',
            message,
            canal: rendezVous.patient.user.canalCommunicationPrefere || 'EMAIL',
            priorite: 'NORMALE',
            donneesSupplementaires: {
                rendezVousId: rendezVous.id,
                medecinId: rendezVous.medecinId,
                dateRendezVous: rendezVous.dateHeureDebut
            }
        });
    }

    static async notifyRendezVousRefused(rendezVous, motifRefus, creneauxAlternatifs = []) {
        const dateRdv = new Date(rendezVous.dateHeureDebut);
        const message = `Votre demande de rendez-vous du ${dateRdv.toLocaleDateString('fr-FR')} avec le Dr ${rendezVous.medecin.user.nom} a été refusée. Motif: ${motifRefus}${creneauxAlternatifs.length > 0 ? '. Des créneaux alternatifs vous ont été proposés.' : ''}`;

        return await this.createAndSendNotification({
            userId: rendezVous.patient.user.id,
            typeNotification: 'RENDEZ_VOUS',
            titre: 'Rendez-vous refusé ⚠️',
            message,
            canal: rendezVous.patient.user.canalCommunicationPrefere || 'EMAIL',
            priorite: 'HAUTE',
            donneesSupplementaires: {
                rendezVousId: rendezVous.id,
                medecinId: rendezVous.medecinId,
                motifRefus,
                creneauxAlternatifs
            }
        });
    }

    static async notifyRendezVousAnnule(rendezVous, motifAnnulation, annulePar) {
        const dateRdv = new Date(rendezVous.dateHeureDebut);
        const estPatientProprietaire = annulePar === 'PATIENT';

        const destinataire = estPatientProprietaire ?
            rendezVous.medecin.user : rendezVous.patient.user;

        const expediteur = estPatientProprietaire ?
            `${rendezVous.patient.user.prenom} ${rendezVous.patient.user.nom}` :
            `Dr ${rendezVous.medecin.user.nom}`;

        const message = `Le rendez-vous du ${dateRdv.toLocaleDateString('fr-FR')} à ${dateRdv.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} avec ${expediteur} a été annulé. Motif: ${motifAnnulation}`;

        const heuresAvantRdv = (dateRdv - new Date()) / (1000 * 60 * 60);

        return await this.createAndSendNotification({
            userId: destinataire.id,
            typeNotification: 'RENDEZ_VOUS',
            titre: '🚫 Rendez-vous annulé',
            message,
            canal: destinataire.canalCommunicationPrefere || 'EMAIL',
            priorite: heuresAvantRdv < 24 ? 'HAUTE' : 'NORMALE',
            donneesSupplementaires: {
                rendezVousId: rendezVous.id,
                annulePar,
                motifAnnulation,
                heuresAvantRdv: Math.round(heuresAvantRdv)
            }
        });
    }

    static async notifyNouvelleDemandeRendezVous(rendezVous) {
        // Construire la date complète du rendez-vous
        const dateRdv = new Date(rendezVous.dateRendezVous);
        const [heures, minutes] = rendezVous.heureDebut.split(':');
        dateRdv.setHours(parseInt(heures), parseInt(minutes), 0, 0);

        const message = `Nouvelle demande de rendez-vous de ${rendezVous.patient.user.prenom} ${rendezVous.patient.user.nom} pour le ${dateRdv.toLocaleDateString('fr-FR')} à ${rendezVous.heureDebut}`;

        return await this.createAndSendNotification({
            userId: rendezVous.medecin.user.id,
            typeNotification: 'RENDEZ_VOUS',
            titre: 'Nouvelle demande de rendez-vous',
            message,
            canal: rendezVous.medecin.user.canalCommunicationPrefere || 'EMAIL',
            priorite: 'NORMALE',
            donneesSupplementaires: {
                rendezVousId: rendezVous.id,
                patientId: rendezVous.patientId,
                dateRendezVous: dateRdv.toISOString(),
                typeConsultation: rendezVous.typeConsultation,
                motifConsultation: rendezVous.motifConsultation
            }
        });
    }

    static async notifyCongesMedicaux(userId, nomMedecin, rendezVousAnnules) {
        const message = `Votre rendez-vous avec Dr ${nomMedecin} a été annulé en raison d'un congé médical. Veuillez reprendre rendez-vous.`;

        return await this.createAndSendNotification({
            userId,
            typeNotification: 'RENDEZ_VOUS',
            titre: '⚠️ Rendez-vous annulé',
            message,
            canal: 'EMAIL',
            priorite: 'HAUTE',
            donneesSupplementaires: {
                motif: 'conge_medical',
                nombreRdvAnnules: rendezVousAnnules
            }
        });
    }

    /**
     * Méthodes spécialisées pour les patients
     */

    static async notifyPatientBienvenue(patient) {
        const message = `Félicitations ! Votre compte patient a été créé avec succès sur notre plateforme médicale.

Vous faites maintenant partie d'une communauté qui facilite l'accès aux soins de santé en Côte d'Ivoire.`;

        return await this.createAndSendNotification({
            userId: patient.userId,
            typeNotification: 'SYSTEME',
            titre: '🎉 Bienvenue sur Malaika',
            message,
            canal: 'EMAIL',
            priorite: 'NORMALE',
            donneesSupplementaires: {
                typeCompte: 'PATIENT',
                dateInscription: new Date(),
                // Variables pour le template email
                badge: 'Nouveau Patient',
                showContactInfo: true
            }
        });
    }

    /**
     * Méthodes spécialisées pour les médecins
     */

    static async notifyMedecinValidationRequest(medecin) {
        // Notification aux admins pour validation
        const admins = await prisma.user.findMany({
            where: { role: 'ADMIN' }
        });

        const notifications = [];
        for (const admin of admins) {
            const notification = await this.createAndSendNotification({
                userId: admin.id,
                typeNotification: 'VALIDATION_COMPTE',
                titre: 'Nouveau médecin à valider',
                message: `Le Dr ${medecin.user.prenom} ${medecin.user.nom} a créé un compte et attend votre validation.`,
                canal: 'EMAIL',
                priorite: 'NORMALE',
                donneesSupplementaires: {
                    medecinId: medecin.id,
                    userId: medecin.userId
                }
            });
            notifications.push(notification);
        }

        return notifications;
    }

    static async notifyMedecinValidated(medecin, valideParAdmin) {
        const message = `Félicitations ! Votre compte médecin a été validé par ${valideParAdmin.nom}. Vous pouvez maintenant accéder à toutes les fonctionnalités de la plateforme.`;

        return await this.createAndSendNotification({
            userId: medecin.userId,
            typeNotification: 'VALIDATION_COMPTE',
            titre: '✅ Compte validé',
            message,
            canal: 'EMAIL',
            priorite: 'HAUTE',
            donneesSupplementaires: {
                validePar: valideParAdmin.id,
                dateValidation: new Date()
            }
        });
    }

    static async notifyMedecinRejected(medecin, motifRejet, valideParAdmin) {
        const message = `Votre demande de compte médecin a été rejetée. Motif: ${motifRejet}. Vous pouvez contacter l'administration pour plus d'informations.`;

        return await this.createAndSendNotification({
            userId: medecin.userId,
            typeNotification: 'VALIDATION_COMPTE',
            titre: '❌ Compte rejeté',
            message,
            canal: 'EMAIL',
            priorite: 'HAUTE',
            donneesSupplementaires: {
                motifRejet,
                rejeteePar: valideParAdmin.id,
                dateRejet: new Date()
            }
        });
    }

    /**
     * Méthodes utilitaires
     */

    static async getUserNotifications(userId, options = {}) {
        const { page = 1, limit = 20, statut = null, type = null } = options;

        const where = { userId };
        if (statut) where.statut = statut;
        if (type) where.typeNotification = type;

        const notifications = await prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit
        });

        const total = await prisma.notification.count({ where });

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    static async getUnreadCount(userId) {
        return await prisma.notification.count({
            where: {
                userId,
                statut: { in: ['EN_ATTENTE', 'ENVOYE'] }
            }
        });
    }

    static async markAsRead(notificationId, userId) {
        return await prisma.notification.updateMany({
            where: {
                id: notificationId,
                userId
            },
            data: {
                statut: 'LU',
                dateLecture: new Date()
            }
        });
    }

    static async retryFailedNotifications() {
        const failedNotifications = await prisma.notification.findMany({
            where: {
                statut: 'ECHEC',
                tentativesEnvoi: { lt: 3 }, // Max 3 tentatives
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Dans les 24h
            },
            orderBy: { priorite: 'desc' },
            take: 20
        });

        console.log(`🔄 Retry de ${failedNotifications.length} notifications échouées`);

        for (const notification of failedNotifications) {
            await this.sendNotification(notification.id);
        }

        return failedNotifications.length;
    }

    /**
     * Déterminer le template email selon le type de notification
     */
    static _getEmailTemplate(typeNotification) {
        const templates = {
            'RENDEZ_VOUS': 'base',
            'VALIDATION_COMPTE': 'base',
            'PAIEMENT': 'base',
            'RAPPEL': 'base',
            'SYSTEME': 'base'
        };

        return templates[typeNotification] || 'base';
    }
}

module.exports = NotificationService;