const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation pour l'annulation
const cancelAppointmentSchema = {
    fields: {
        motifAnnulation: {
            type: 'string',
            minLength: 5,
            maxLength: 1000
        },
        demandeRemboursement: {
            type: 'boolean'
        }
    },
    required: ['motifAnnulation'],
    strict: true
};

/**
 * DELETE /appointments/:id/cancel - Annuler un rendez-vous
 */
router.delete('/:id',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT', 'MEDECIN']),
    BodyFilter.validate(cancelAppointmentSchema),
    async (req, res) => {
        try {
            const user = req.user;
            const rendezVousId = req.params.id;
            const { motifAnnulation, demandeRemboursement = false } = req.body;

            // Récupération du rendez-vous avec toutes les informations
            const rendezVous = await prisma.rendezVous.findUnique({
                where: { id: rendezVousId },
                include: {
                    patient: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    nom: true,
                                    prenom: true,
                                    telephone: true,
                                    email: true,
                                    canalCommunicationPrefere: true
                                }
                            }
                        }
                    },
                    medecin: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    nom: true,
                                    prenom: true,
                                    telephone: true,
                                    email: true,
                                    canalCommunicationPrefere: true
                                }
                            }
                        }
                    }
                }
            });

            if (!rendezVous) {
                return ApiResponse.notFound(res, 'Rendez-vous non trouvé');
            }

            // Vérification des autorisations
            const estPatientProprietaire = user.role === 'PATIENT' && rendezVous.patient.user.id === user.id;
            const estMedecinProprietaire = user.role === 'MEDECIN' && rendezVous.medecin.user.id === user.id;

            if (!estPatientProprietaire && !estMedecinProprietaire) {
                return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à annuler ce rendez-vous');
            }

            // Vérification du statut du RDV
            const statutsAnnulables = ['DEMANDE', 'EN_ATTENTE', 'CONFIRME'];
            if (!statutsAnnulables.includes(rendezVous.statut)) {
                return ApiResponse.badRequest(res, `Impossible d'annuler un rendez-vous avec le statut: ${rendezVous.statut}`);
            }

            // Vérification du délai d'annulation
            const dateRdv = new Date(rendezVous.dateHeureDebut);
            const maintenant = new Date();
            const heuresAvantRdv = (dateRdv - maintenant) / (1000 * 60 * 60);

            // Règles d'annulation selon le délai
            let annulationGratuite = false;
            let fraisAnnulation = 0;
            let messageDelai = '';

            if (heuresAvantRdv < 0) {
                return ApiResponse.badRequest(res, 'Impossible d\'annuler un rendez-vous passé');
            } else if (heuresAvantRdv >= 24) {
                annulationGratuite = true;
                messageDelai = 'Annulation gratuite (plus de 24h à l\'avance)';
            } else if (heuresAvantRdv >= 12) {
                fraisAnnulation = rendezVous.tarifPrevu * 0.25; // 25% du tarif
                messageDelai = 'Annulation avec frais (12-24h à l\'avance): 25% du tarif';
            } else if (heuresAvantRdv >= 2) {
                fraisAnnulation = rendezVous.tarifPrevu * 0.50; // 50% du tarif
                messageDelai = 'Annulation avec frais (2-12h à l\'avance): 50% du tarif';
            } else {
                fraisAnnulation = rendezVous.tarifPrevu; // 100% du tarif
                messageDelai = 'Annulation avec frais (moins de 2h à l\'avance): 100% du tarif';
            }

            // Exceptions pour les médecins (moins de restrictions)
            if (user.role === 'MEDECIN' && heuresAvantRdv >= 2) {
                annulationGratuite = true;
                fraisAnnulation = 0;
                messageDelai = 'Annulation par le médecin (plus de 2h à l\'avance)';
            }

            // Traitement de l'annulation en transaction
            const result = await prisma.$transaction(async (tx) => {
                // Mise à jour du RDV
                const rdvAnnule = await tx.rendezVous.update({
                    where: { id: rendezVousId },
                    data: {
                        statut: 'ANNULE',
                        dateAnnulation: maintenant,
                        motifAnnulation,
                        annulePar: user.role,
                        fraisAnnulation,
                        annulationGratuite
                    }
                });

                // Ajout à l'historique
                await tx.rendezVousHistorique.create({
                    data: {
                        rendezVousId: rendezVousId,
                        ancienStatut: rendezVous.statut,
                        nouveauStatut: 'ANNULE',
                        motifChangement: `Annulation par ${user.role.toLowerCase()}: ${motifAnnulation}`,
                        effectueeParId: user.id,
                        dateChangement: maintenant
                    }
                });

                // Déterminer qui notifier
                const destinataireNotification = estPatientProprietaire ? 
                    rendezVous.medecin.user : rendezVous.patient.user;

                const expediteur = estPatientProprietaire ? 
                    `${rendezVous.patient.user.prenom} ${rendezVous.patient.user.nom}` :
                    `Dr ${rendezVous.medecin.user.nom}`;

                // Notification à l'autre partie
                await tx.notification.create({
                    data: {
                        userId: destinataireNotification.id,
                        type: 'RENDEZ_VOUS',
                        titre: '🚫 Rendez-vous annulé',
                        contenu: `Le rendez-vous du ${dateRdv.toLocaleDateString('fr-FR')} à ${dateRdv.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} avec ${expediteur} a été annulé. Motif: ${motifAnnulation}`,
                        statutNotification: 'EN_ATTENTE',
                        priorite: heuresAvantRdv < 24 ? 'HAUTE' : 'NORMALE',
                        canal: destinataireNotification.canalCommunicationPrefere || 'EMAIL',
                        donnees: JSON.stringify({
                            rendezVousId: rdvAnnule.id,
                            annulePar: user.role,
                            heuresAvantRdv: Math.round(heuresAvantRdv * 10) / 10,
                            fraisAnnulation,
                            annulationGratuite
                        })
                    }
                });

                // Gestion du remboursement si demandé et justifié
                let remboursement = null;
                if (demandeRemboursement && (annulationGratuite || user.role === 'MEDECIN')) {
                    remboursement = await tx.demande_remboursement.create({
                        data: {
                            rendezVousId: rdvAnnule.id,
                            demandePar: user.role,
                            montant: rendezVous.tarifPrevu - fraisAnnulation,
                            motif: `Annulation de RDV: ${motifAnnulation}`,
                            statut: 'EN_ATTENTE',
                            dateCreation: maintenant
                        }
                    });
                }

                return { rdvAnnule, remboursement };
            });

            // Calcul du temps humainement lisible
            const tempsAvantRdv = heuresAvantRdv >= 24 ?
                `${Math.floor(heuresAvantRdv / 24)} jour(s)` :
                `${Math.round(heuresAvantRdv)} heure(s)`;

            // Préparation de la réponse
            const reponse = {
                rendezVous: {
                    id: result.rdvAnnule.id,
                    statut: result.rdvAnnule.statut,
                    dateHeureDebut: result.rdvAnnule.dateHeureDebut,
                    dateAnnulation: result.rdvAnnule.dateAnnulation,
                    motifAnnulation: result.rdvAnnule.motifAnnulation,
                    annulePar: result.rdvAnnule.annulePar
                },
                annulation: {
                    gratuite: annulationGratuite,
                    frais: fraisAnnulation,
                    delaiAnnulation: tempsAvantRdv,
                    messageDelai,
                    tarifOriginal: rendezVous.tarifPrevu
                },
                partenaire: estPatientProprietaire ? {
                    type: 'medecin',
                    nom: rendezVous.medecin.user.nom,
                    prenom: rendezVous.medecin.user.prenom,
                    specialite: rendezVous.medecin.specialitePrincipale
                } : {
                    type: 'patient',
                    nom: rendezVous.patient.user.nom,
                    prenom: rendezVous.patient.user.prenom
                },
                remboursement: result.remboursement ? {
                    demande: true,
                    montant: result.remboursement.montant,
                    statut: result.remboursement.statut,
                    delaiTraitement: '3-5 jours ouvrés'
                } : {
                    demande: false,
                    raison: !annulationGratuite ? 'Annulation tardive avec frais' : 'Pas de remboursement demandé'
                },
                consequences: {
                    creneauLibere: true,
                    notification_envoyee: true,
                    planning_mis_a_jour: true,
                    historique_conserve: true
                },
                actions_possibles: [
                    'Reprendre rendez-vous avec le même médecin',
                    'Chercher un nouveau médecin',
                    estPatientProprietaire ? 'Consulter les créneaux disponibles' : 'Proposer de nouveaux créneaux'
                ]
            };

            const message = annulationGratuite ?
                'Rendez-vous annulé avec succès (sans frais)' :
                `Rendez-vous annulé avec des frais de ${fraisAnnulation} XOF`;

            console.log(`❌ RDV annulé: ${user.prenom} ${user.nom} (${user.role}) - RDV du ${dateRdv.toLocaleDateString()} avec frais: ${fraisAnnulation}`);

            return ApiResponse.success(res, message, reponse);

        } catch (error) {
            console.error('❌ Erreur annulation rendez-vous:', error);
            return ApiResponse.serverError(res, 'Erreur lors de l\'annulation du rendez-vous');
        }
    }
);

module.exports = router;