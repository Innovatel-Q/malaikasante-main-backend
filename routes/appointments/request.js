const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const NotificationService = require('../../services/NotificationService');

// Schéma de validation pour la demande de RDV
const requestAppointmentSchema = {
    fields: {
        medecinId: {
            type: 'string',
            minLength: 1
        },
        dateHeureDebut: {
            type: 'string'
        },
        typeConsultation: {
            type: 'string',
            enum: ['CLINIQUE', 'DOMICILE', 'TELECONSULTATION']
        },
        motifConsultation: {
            type: 'string',
            minLength: 10,
            maxLength: 1000
        },
        niveauUrgence: {
            type: 'string',
            enum: ['URGENT', 'NORMAL', 'SUIVI_ROUTINE']
        },
        dureeEstimee: {
            type: 'number',
            min: 15,
            max: 120
        },
        adressePatient: {
            type: 'string',
            maxLength: 500
        },
        informationsComplementaires: {
            type: 'string',
            maxLength: 1000
        }
    },
    required: ['medecinId', 'dateHeureDebut', 'typeConsultation', 'motifConsultation'],
    strict: true
};

/**
 * POST /appointments/request - Demander un rendez-vous
 */
router.post('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    BodyFilter.validate(requestAppointmentSchema),
    async (req, res) => {
        try {
            const patient = req.user;
            const {
                medecinId,
                dateHeureDebut,
                typeConsultation,
                motifConsultation,
                niveauUrgence = 'NORMAL',
                dureeEstimee = 30,
                adressePatient,
                informationsComplementaires
            } = req.body;

            // Validation de la date
            const dateRdv = new Date(dateHeureDebut);
            const maintenant = new Date();
            
            if (dateRdv <= maintenant) {
                return ApiResponse.badRequest(res, 'La date du rendez-vous doit être dans le futur');
            }

            // Marge minimale de 2h pour les RDV normaux, 30min pour urgents
            const margeMinimale = niveauUrgence === 'URGENT' ? 30 : 120;
            const dateMinimale = new Date(maintenant.getTime() + (margeMinimale * 60 * 1000));
            
            if (dateRdv < dateMinimale) {
                const heuresMinimales = margeMinimale / 60;
                return ApiResponse.badRequest(res, `Le rendez-vous doit être programmé au minimum ${heuresMinimales}h à l'avance`);
            }

            // Vérification du médecin
            const medecin = await prisma.medecin.findUnique({
                where: {
                    id: medecinId,
                    statutValidation: 'VALIDE'
                },
                include: {
                    user: {
                        select: {
                            nom: true,
                            prenom: true,
                            email: true,
                            telephone: true,
                            statut: true,
                            canalCommunicationPrefere: true
                        }
                    },
                    disponibilites: {
                        where: {
                            bloque: false
                        }
                    }
                }
            });

            if (!medecin || medecin.user.statut !== 'ACTIF') {
                return ApiResponse.notFound(res, 'Médecin non trouvé ou non disponible pour de nouveaux patients');
            }

            // Vérifier que le médecin propose ce type de consultation
            const typeAutorise = {
                'CLINIQUE': medecin.accepteclinique,
                'DOMICILE': medecin.accepteDomicile,
                'TELECONSULTATION': medecin.accepteTeleconsultation
            };

            if (!typeAutorise[typeConsultation]) {
                return ApiResponse.badRequest(res, `Le médecin ne propose pas de consultation de type ${typeConsultation}`);
            }

            // Validation spécifique pour consultation à domicile
            if (typeConsultation === 'DOMICILE') {
                if (!adressePatient) {
                    return ApiResponse.badRequest(res, 'Adresse du patient requise pour une consultation à domicile');
                }
            }

            // Calcul des heures de début et fin
            const heureDebut = dateRdv.toTimeString().slice(0, 5); // Format HH:MM
            const dateHeureFin = new Date(dateRdv.getTime() + (dureeEstimee * 60 * 1000));
            const heureFin = dateHeureFin.toTimeString().slice(0, 5); // Format HH:MM
            const dateRendezVous = new Date(dateRdv.toISOString().split('T')[0]); // Date seule

            // Vérification des conflits de créneaux
            const conflitMedecin = await prisma.rendezVous.findFirst({
                where: {
                    medecinId: medecinId,
                    dateRendezVous: dateRendezVous,
                    statut: {
                        in: ['CONFIRME', 'EN_ATTENTE', 'DEMANDE']
                    },
                    OR: [
                        {
                            heureDebut: { lt: heureFin },
                            heureFin: { gt: heureDebut }
                        }
                    ]
                }
            });

            if (conflitMedecin) {
                return ApiResponse.badRequest(res, 'Ce créneau n\'est plus disponible');
            }

            // Vérification des disponibilités du médecin pour cette date/heure
            const jourSemaine = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'][dateRdv.getDay()];

            const disponibiliteCompatible = medecin.disponibilites.find(dispo => {
                // Vérifier le jour de la semaine et le type de consultation
                return dispo.jourSemaine === jourSemaine &&
                       dispo.typeConsultation === typeConsultation &&
                       dispo.heureDebut <= heureDebut &&
                       dispo.heureFin >= heureFin &&
                       !dispo.bloque;
            });

            if (!disponibiliteCompatible) {
                return ApiResponse.badRequest(res, 'Le médecin n\'est pas disponible à cette date et heure pour ce type de consultation');
            }

            // Récupération des informations du patient
            const patientData = await prisma.patient.findUnique({
                where: { userId: patient.id },
                select: {
                    id: true,
                    dateNaissance: true,
                    sexe: true,
                    allergies: true,
                    antecedentsMedicaux: true,
                    groupeSanguin: true
                }
            });

            if (!patientData) {
                return ApiResponse.badRequest(res, 'Profil patient incomplet. Veuillez compléter votre profil avant de prendre rendez-vous');
            }

            // Calcul du tarif - utilisation du tarif de base
            let tarif = medecin.tarifConsultationBase || 0;

            // Ajustement selon le type de consultation (tarif de base + majoration éventuelle)
            switch (typeConsultation) {
                case 'CLINIQUE':
                    // Tarif de base
                    break;
                case 'DOMICILE':
                    // Majoration de 50% pour consultation à domicile
                    tarif = tarif * 1.5;
                    break;
                case 'TELECONSULTATION':
                    // Réduction de 20% pour téléconsultation
                    tarif = tarif * 0.8;
                    break;
            }

            // Création du rendez-vous
            const rendezVous = await prisma.$transaction(async (tx) => {
                // Créer le RDV
                const nouveauRdv = await tx.rendezVous.create({
                    data: {
                        patientId: patientData.id,
                        medecinId: medecinId,
                        disponibiliteId: disponibiliteCompatible.id,
                        dateRendezVous: dateRendezVous,
                        heureDebut: heureDebut,
                        heureFin: heureFin,
                        typeConsultation,
                        statut: 'DEMANDE',
                        motifConsultation,
                        niveauUrgence,
                        tarif: tarif,
                        adresseConsultation: typeConsultation === 'DOMICILE' ? adressePatient : null,
                        ...(informationsComplementaires && { symptomes: informationsComplementaires }),
                        ...(typeConsultation === 'CLINIQUE' && medecin.cliniqueId && { cliniqueId: medecin.cliniqueId })
                    },
                    include: {
                        patient: {
                            include: {
                                user: {
                                    select: {
                                        nom: true,
                                        prenom: true,
                                        telephone: true,
                                        email: true
                                    }
                                }
                            }
                        },
                        medecin: {
                            include: {
                                user: {
                                    select: {
                                        nom: true,
                                        prenom: true,
                                        telephone: true,
                                        email: true
                                    }
                                }
                            }
                        }
                    }
                });

                // Créer l'historique
                await tx.rendezVousHistorique.create({
                    data: {
                        rendezVousId: nouveauRdv.id,
                        statutPrecedent: null,
                        nouveauStatut: 'DEMANDE',
                        motifModification: 'Demande initiale du patient',
                        modifieParUserId: patient.id,
                        dateModification: new Date()
                    }
                });

                // Créer notification pour le médecin
                await tx.notification.create({
                    data: {
                        userId: medecin.userId,
                        typeNotification: 'RENDEZ_VOUS',
                        titre: 'Nouvelle demande de rendez-vous',
                        message: `Nouvelle demande de rendez-vous de ${patient.prenom} ${patient.nom} pour le ${dateRdv.toLocaleDateString('fr-FR')} à ${dateRdv.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
                        statut: 'EN_ATTENTE',
                        priorite: niveauUrgence === 'URGENT' ? 'HAUTE' : 'NORMALE',
                        canal: medecin.user.canalCommunicationPrefere || 'EMAIL',
                        donneesSupplementaires: JSON.stringify({
                            rendezVousId: nouveauRdv.id,
                            typeConsultation,
                            niveauUrgence
                        })
                    }
                });

                return nouveauRdv;
            });

            // Envoyer email de notification au médecin
            try {
                await NotificationService.notifyNouvelleDemandeRendezVous(rendezVous);
                console.log(`📧 Email de demande de RDV envoyé au Dr ${medecin.user.nom}`);
            } catch (emailError) {
                console.error('Erreur envoi email au médecin:', emailError);
                // Ne pas faire échouer la demande si l'email échoue
            }

            // Réponse de succès avec toutes les informations
            const reponse = {
                rendezVous: {
                    id: rendezVous.id,
                    dateRendezVous: rendezVous.dateRendezVous,
                    heureDebut: rendezVous.heureDebut,
                    heureFin: rendezVous.heureFin,
                    typeConsultation: rendezVous.typeConsultation,
                    statut: rendezVous.statut,
                    motifConsultation: rendezVous.motifConsultation,
                    niveauUrgence: rendezVous.niveauUrgence,
                    tarif: rendezVous.tarif,
                    adresseConsultation: rendezVous.adresseConsultation
                },
                medecin: {
                    id: medecin.id,
                    nom: medecin.user.nom,
                    prenom: medecin.user.prenom,
                    specialites: medecin.specialites
                },
                patient: {
                    nom: patient.nom,
                    prenom: patient.prenom,
                    telephone: patient.telephone
                },
                prochaines_etapes: [
                    'Votre demande de rendez-vous a été envoyée au médecin',
                    `Le Dr ${medecin.user.nom} recevra une notification et répondra dans les 24h`,
                    'Vous recevrez une notification de sa réponse par ' + (patient.canalCommunicationPrefere || 'email'),
                    'En cas d\'urgence, contactez directement le médecin au ' + medecin.user.telephone
                ],
                delaiReponse: '24h',
                annulation: {
                    possible: true,
                    gratuite: true,
                    limite: '24h avant le RDV'
                }
            };

            console.log(`✅ Nouvelle demande de RDV: ${patient.prenom} ${patient.nom} -> Dr ${medecin.user.nom} (${dateRdv.toLocaleDateString()})`);

            return ApiResponse.success(res, 'Demande de rendez-vous envoyée avec succès', reponse);

        } catch (error) {
            console.error('❌ Erreur demande rendez-vous:', error);
            
            // Gestion des erreurs spécifiques
            if (error.code === 'P2002') {
                return ApiResponse.badRequest(res, 'Un conflit de créneaux s\'est produit. Veuillez choisir un autre créneau.');
            }
            
            return ApiResponse.serverError(res, 'Erreur lors de la demande de rendez-vous');
        }
    }
);

module.exports = router;