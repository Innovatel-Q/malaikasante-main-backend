const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation pour la reprogrammation
const rescheduleAppointmentSchema = {
    fields: {
        nouvelleDateHeureDebut: {
            type: 'string'
        },
        motifReprogrammation: {
            type: 'string',
            minLength: 5,
            maxLength: 1000
        },
        nouveauTypeConsultation: {
            type: 'string',
            enum: ['CLINIQUE', 'DOMICILE', 'TELECONSULTATION']
        },
        nouvelleDureeEstimee: {
            type: 'number',
            min: 15,
            max: 120
        },
        nouvelleAdresse: {
            type: 'string',
            maxLength: 500
        },
        demandeAccordMutuel: {
            type: 'boolean'
        }
    },
    required: ['nouvelleDateHeureDebut', 'motifReprogrammation'],
    strict: true
};

/**
 * PUT /appointments/:id/reschedule - Reprogrammer un rendez-vous
 */
router.put('/:id',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT', 'MEDECIN']),
    BodyFilter.validate(rescheduleAppointmentSchema),
    async (req, res) => {
        try {
            const user = req.user;
            const rendezVousId = req.params.id;
            const {
                nouvelleDateHeureDebut,
                motifReprogrammation,
                nouveauTypeConsultation,
                nouvelleDureeEstimee = 30,
                nouvelleAdresse,
                demandeAccordMutuel = true
            } = req.body;

            // Validation de la nouvelle date
            const nouvelleDate = new Date(nouvelleDateHeureDebut);
            const maintenant = new Date();
            
            if (nouvelleDate <= maintenant) {
                return ApiResponse.badRequest(res, 'La nouvelle date doit être dans le futur');
            }

            // Marge minimale de 2h
            const margeMinimale = new Date(maintenant.getTime() + (2 * 60 * 60 * 1000));
            if (nouvelleDate < margeMinimale) {
                return ApiResponse.badRequest(res, 'La nouvelle date doit être au minimum 2h à l\'avance');
            }

            // Récupération du RDV avec toutes les informations
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
                return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à reprogrammer ce rendez-vous');
            }

            // Vérification du statut du RDV
            if (rendezVous.statut !== 'CONFIRME') {
                return ApiResponse.badRequest(res, 'Seuls les rendez-vous confirmés peuvent être reprogrammés');
            }

            // Vérification que l'ancien RDV n'est pas dans le passé
            if (new Date(rendezVous.dateHeureDebut) <= maintenant) {
                return ApiResponse.badRequest(res, 'Impossible de reprogrammer un rendez-vous passé');
            }

            // Déterminer le type de consultation (garder l'ancien si pas spécifié)
            const typeConsultation = nouveauTypeConsultation || rendezVous.typeConsultation;

            // Vérifier que le médecin propose ce type de consultation
            const typeAutorise = {
                'CLINIQUE': true,
                'DOMICILE': rendezVous.medecin.consultationDomicile,
                'TELECONSULTATION': rendezVous.medecin.teleconsultation
            };

            if (!typeAutorise[typeConsultation]) {
                return ApiResponse.badRequest(res, `Le médecin ne propose pas de consultation de type ${typeConsultation}`);
            }

            // Validation spécifique pour consultation à domicile
            if (typeConsultation === 'DOMICILE' && !nouvelleAdresse && !rendezVous.adresseConsultation) {
                return ApiResponse.badRequest(res, 'Adresse requise pour une consultation à domicile');
            }

            // Calcul de la nouvelle date de fin
            const nouvelleDateHeureFin = new Date(nouvelleDate.getTime() + (nouvelleDureeEstimee * 60 * 1000));

            // Vérification des conflits de créneaux pour le médecin
            const conflitMedecin = await prisma.rendezVous.findFirst({
                where: {
                    medecinId: rendezVous.medecinId,
                    id: { not: rendezVousId }, // Exclure le RDV actuel
                    statut: {
                        in: ['CONFIRME', 'EN_ATTENTE', 'DEMANDE']
                    },
                    OR: [
                        {
                            dateHeureDebut: {
                                lt: nouvelleDateHeureFin,
                                gte: nouvelleDate
                            }
                        },
                        {
                            dateHeureFin: {
                                gt: nouvelleDate,
                                lte: nouvelleDateHeureFin
                            }
                        },
                        {
                            dateHeureDebut: { lte: nouvelleDate },
                            dateHeureFin: { gte: nouvelleDateHeureFin }
                        }
                    ]
                }
            });

            if (conflitMedecin) {
                return ApiResponse.badRequest(res, 'Le nouveau créneau n\'est pas disponible pour le médecin');
            }

            // Vérification des congés du médecin
            const congeActif = await prisma.conge.findFirst({
                where: {
                    medecinId: rendezVous.medecinId,
                    dateDebut: { lte: nouvelleDate },
                    dateFin: { gte: nouvelleDate }
                }
            });

            if (congeActif) {
                return ApiResponse.badRequest(res, 'Le médecin n\'est pas disponible à cette nouvelle période (congés)');
            }

            // Calcul du nouveau tarif si le type change
            let nouveauTarif = rendezVous.tarifPrevu;
            if (typeConsultation !== rendezVous.typeConsultation) {
                switch (typeConsultation) {
                    case 'CLINIQUE':
                        nouveauTarif = rendezVous.medecin.tarifConsultationClinique;
                        break;
                    case 'DOMICILE':
                        nouveauTarif = rendezVous.medecin.tarifConsultationDomicile;
                        break;
                    case 'TELECONSULTATION':
                        nouveauTarif = rendezVous.medecin.tarifTeleconsultation;
                        break;
                }
            }

            // Calcul des frais de reprogrammation selon le délai
            const heuresAvantRdv = (new Date(rendezVous.dateHeureDebut) - maintenant) / (1000 * 60 * 60);
            let fraisReprogrammation = 0;
            let messageDelai = '';

            if (heuresAvantRdv < 24) {
                fraisReprogrammation = rendezVous.tarifPrevu * 0.10; // 10% de frais
                messageDelai = 'Reprogrammation tardive (moins de 24h): frais de 10%';
            } else {
                messageDelai = 'Reprogrammation gratuite (plus de 24h à l\'avance)';
            }

            // Exception pour les médecins
            if (user.role === 'MEDECIN') {
                fraisReprogrammation = 0;
                messageDelai = 'Reprogrammation par le médecin (sans frais)';
            }

            // Déterminer le nouveau statut selon qui demande
            let nouveauStatut;
            if (demandeAccordMutuel) {
                // Accord mutuel requis - passer en attente
                nouveauStatut = user.role === 'PATIENT' ? 'EN_ATTENTE' : 'CONFIRME';
            } else {
                // Reprogrammation directe (uniquement si proche ou par le médecin)
                if (user.role === 'MEDECIN' || heuresAvantRdv >= 48) {
                    nouveauStatut = 'CONFIRME';
                } else {
                    nouveauStatut = 'EN_ATTENTE';
                }
            }

            // Traitement en transaction
            const result = await prisma.$transaction(async (tx) => {
                // Mise à jour du RDV
                const rdvReprogramme = await tx.rendezVous.update({
                    where: { id: rendezVousId },
                    data: {
                        dateHeureDebut: nouvelleDate,
                        dateHeureFin: nouvelleDateHeureFin,
                        typeConsultation: typeConsultation,
                        statut: nouveauStatut,
                        tarifPrevu: nouveauTarif,
                        fraisReprogrammation,
                        adresseConsultation: nouvelleAdresse || 
                            (typeConsultation === 'DOMICILE' ? rendezVous.adresseConsultation : rendezVous.medecin.adresseConsultation),
                        motifReprogrammation,
                        reprogrammePar: user.role,
                        dateReprogrammation: maintenant
                    },
                    include: {
                        patient: {
                            include: {
                                user: {
                                    select: {
                                        nom: true,
                                        prenom: true,
                                        telephone: true
                                    }
                                }
                            }
                        },
                        medecin: {
                            include: {
                                user: {
                                    select: {
                                        nom: true,
                                        prenom: true
                                    }
                                }
                            }
                        }
                    }
                });

                // Ajout à l'historique
                await tx.rendezVousHistorique.create({
                    data: {
                        rendezVousId: rendezVousId,
                        ancienStatut: rendezVous.statut,
                        nouveauStatut: nouveauStatut,
                        motifChangement: `Reprogrammation par ${user.role.toLowerCase()}: ${motifReprogrammation}. Du ${rendezVous.dateHeureDebut.toLocaleDateString()} au ${nouvelleDate.toLocaleDateString()}`,
                        effectueeParId: user.id,
                        dateChangement: maintenant
                    }
                });

                // Notification à l'autre partie
                const destinataireNotification = estPatientProprietaire ?
                    rendezVous.medecin.user : rendezVous.patient.user;

                const expediteur = estPatientProprietaire ?
                    `${rendezVous.patient.user.prenom} ${rendezVous.patient.user.nom}` :
                    `Dr ${rendezVous.medecin.user.nom}`;

                const titreNotification = nouveauStatut === 'EN_ATTENTE' ?
                    '🔄 Demande de reprogrammation' :
                    '✅ Rendez-vous reprogrammé';

                const contenuNotification = nouveauStatut === 'EN_ATTENTE' ?
                    `${expediteur} demande de reprogrammer le rendez-vous du ${rendezVous.dateHeureDebut.toLocaleDateString()} au ${nouvelleDate.toLocaleDateString()} à ${nouvelleDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}. Motif: ${motifReprogrammation}` :
                    `Votre rendez-vous a été reprogrammé du ${rendezVous.dateHeureDebut.toLocaleDateString()} au ${nouvelleDate.toLocaleDateString()} à ${nouvelleDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} par ${expediteur}`;

                await tx.notification.create({
                    data: {
                        userId: destinataireNotification.id,
                        type: 'RENDEZ_VOUS',
                        titre: titreNotification,
                        contenu: contenuNotification,
                        statutNotification: 'EN_ATTENTE',
                        priorite: nouveauStatut === 'EN_ATTENTE' ? 'HAUTE' : 'NORMALE',
                        canal: destinataireNotification.canalCommunicationPrefere || 'EMAIL',
                        donnees: JSON.stringify({
                            rendezVousId: rdvReprogramme.id,
                            reprogrammePar: user.role,
                            ancienneDatee: rendezVous.dateHeureDebut,
                            nouvelleDatee: nouvelleDate,
                            nouveauStatut,
                            fraisReprogrammation
                        })
                    }
                });

                return rdvReprogramme;
            });

            // Préparation de la réponse
            const reponse = {
                rendezVous: {
                    id: result.id,
                    ancienneDateHeureDebut: rendezVous.dateHeureDebut,
                    nouvelleDateHeureDebut: result.dateHeureDebut,
                    nouvelleDateHeureFin: result.dateHeureFin,
                    ancienTypeConsultation: rendezVous.typeConsultation,
                    nouveauTypeConsultation: result.typeConsultation,
                    statut: result.statut,
                    motifReprogrammation: result.motifReprogrammation,
                    reprogrammePar: result.reprogrammePar
                },
                changements: {
                    date: rendezVous.dateHeureDebut.toLocaleDateString() !== result.dateHeureDebut.toLocaleDateString(),
                    heure: rendezVous.dateHeureDebut.toLocaleTimeString() !== result.dateHeureDebut.toLocaleTimeString(),
                    typeConsultation: rendezVous.typeConsultation !== result.typeConsultation,
                    adresse: (nouvelleAdresse && nouvelleAdresse !== rendezVous.adresseConsultation),
                    tarif: rendezVous.tarifPrevu !== result.tarifPrevu
                },
                tarification: {
                    ancienTarif: rendezVous.tarifPrevu,
                    nouveauTarif: nouveauTarif,
                    fraisReprogrammation,
                    total: nouveauTarif + fraisReprogrammation,
                    messageDelai
                },
                partenaire: estPatientProprietaire ? {
                    type: 'medecin',
                    nom: rendezVous.medecin.user.nom,
                    prenom: rendezVous.medecin.user.prenom,
                    specialite: rendezVous.medecin.specialitePrincipale
                } : {
                    type: 'patient',
                    nom: rendezVous.patient.user.nom,
                    prenom: rendezVous.patient.user.prenom,
                    telephone: rendezVous.patient.user.telephone
                },
                prochaines_etapes: nouveauStatut === 'EN_ATTENTE' ? [
                    'Demande de reprogrammation envoyée',
                    `En attente de confirmation de ${estPatientProprietaire ? 'le médecin' : 'le patient'}`,
                    'Vous recevrez une notification de la réponse',
                    'L\'ancien créneau reste réservé jusqu\'à la réponse'
                ] : [
                    'Rendez-vous reprogrammé avec succès',
                    'Les deux parties ont été notifiées',
                    'Le nouveau créneau est confirmé',
                    'L\'ancien créneau a été libéré'
                ]
            };

            const messageSucces = nouveauStatut === 'EN_ATTENTE' ?
                'Demande de reprogrammation envoyée avec succès' :
                'Rendez-vous reprogrammé avec succès';

            console.log(`🔄 RDV reprogrammé: ${user.prenom} ${user.nom} (${user.role}) - Du ${rendezVous.dateHeureDebut.toLocaleDateString()} au ${nouvelleDate.toLocaleDateString()}`);

            return ApiResponse.success(res, messageSucces, reponse);

        } catch (error) {
            console.error('❌ Erreur reprogrammation rendez-vous:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la reprogrammation du rendez-vous');
        }
    }
);

module.exports = router;