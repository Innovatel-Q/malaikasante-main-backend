const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation pour la réponse du médecin
const respondAppointmentSchema = {
    fields: {
        decision: {
            type: 'string',
            enum: ['ACCEPTER', 'REFUSER']
        },
        motifRefus: {
            type: 'string',
            maxLength: 1000
        },
        creneauxAlternatifs: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    dateHeureDebut: { type: 'string' },
                    typeConsultation: { 
                        type: 'string', 
                        enum: ['CLINIQUE', 'DOMICILE', 'TELECONSULTATION'] 
                    }
                },
                required: ['dateHeureDebut']
            },
            maxItems: 5
        },
        messagePersonnalise: {
            type: 'string',
            maxLength: 500
        },
        modificationsTarif: {
            type: 'object',
            properties: {
                nouveau_tarif: { type: 'number', min: 0 },
                motif_modification: { type: 'string', maxLength: 200 }
            }
        }
    },
    required: ['decision'],
    strict: true
};

/**
 * PUT /appointments/:id/respond - Réponse du médecin à une demande de RDV
 */
router.put('/:id',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorizeValidatedMedecin(),
    BodyFilter.validate(respondAppointmentSchema),
    async (req, res) => {
        try {
            const medecinUser = req.user;
            const rendezVousId = req.params.id;
            const {
                decision,
                motifRefus,
                creneauxAlternatifs = [],
                messagePersonnalise,
                modificationsTarif
            } = req.body;

            // Validation de la décision et des champs requis
            if (decision === 'REFUSER' && !motifRefus) {
                return ApiResponse.badRequest(res, 'Motif de refus obligatoire');
            }

            // Récupération du RDV avec toutes les informations nécessaires
            const rendezVous = await prisma.rendezVous.findUnique({
                where: { id: rendezVousId },
                include: {
                    medecin: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    nom: true,
                                    prenom: true,
                                    telephone: true,
                                    email: true
                                }
                            }
                        }
                    },
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
                    }
                }
            });

            if (!rendezVous) {
                return ApiResponse.notFound(res, 'Rendez-vous non trouvé');
            }

            // Vérification que le médecin est bien propriétaire du RDV
            if (rendezVous.medecin.user.id !== medecinUser.id) {
                return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à répondre à cette demande');
            }

            // Vérification du statut du RDV
            if (rendezVous.statut !== 'DEMANDE' && rendezVous.statut !== 'EN_ATTENTE') {
                return ApiResponse.badRequest(res, 'Cette demande de rendez-vous ne peut plus être modifiée');
            }

            // Vérification que le RDV n'est pas dans le passé
            if (new Date(rendezVous.dateHeureDebut) <= new Date()) {
                return ApiResponse.badRequest(res, 'Impossible de répondre à un rendez-vous passé');
            }

            // Validation des créneaux alternatifs pour un refus
            if (decision === 'REFUSER' && creneauxAlternatifs.length > 0) {
                for (const creneau of creneauxAlternatifs) {
                    const dateCreneau = new Date(creneau.dateHeureDebut);
                    if (dateCreneau <= new Date()) {
                        return ApiResponse.badRequest(res, 'Les créneaux alternatifs ne peuvent pas être dans le passé');
                    }
                    
                    // Vérifier disponibilité du créneau alternatif
                    const conflit = await prisma.rendezVous.findFirst({
                        where: {
                            medecinId: rendezVous.medecinId,
                            statut: { in: ['CONFIRME', 'EN_ATTENTE'] },
                            dateHeureDebut: {
                                lte: new Date(dateCreneau.getTime() + (30 * 60 * 1000))
                            },
                            dateHeureFin: {
                                gte: dateCreneau
                            }
                        }
                    });
                    
                    if (conflit) {
                        return ApiResponse.badRequest(res, `Créneau alternatif du ${dateCreneau.toLocaleDateString()} non disponible`);
                    }
                }
            }

            // Traitement en transaction
            const result = await prisma.$transaction(async (tx) => {
                let nouveauStatut;
                let updatedData = {};

                if (decision === 'ACCEPTER') {
                    nouveauStatut = 'CONFIRME';
                    
                    // Application des modifications de tarif si spécifiées
                    if (modificationsTarif && modificationsTarif.nouveau_tarif !== undefined) {
                        updatedData.tarifPrevu = modificationsTarif.nouveau_tarif;
                    }
                } else {
                    nouveauStatut = 'REFUSE';
                    updatedData.motifRefus = motifRefus;
                }

                // Mise à jour du RDV
                const rdvUpdated = await tx.rendezVous.update({
                    where: { id: rendezVousId },
                    data: {
                        statut: nouveauStatut,
                        dateReponse: new Date(),
                        messagePersonnaliseMedecin: messagePersonnalise,
                        ...updatedData
                    },
                    include: {
                        patient: {
                            include: {
                                user: {
                                    select: {
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
                        motifChangement: decision === 'ACCEPTER' ? 
                            `Accepté par le médecin${messagePersonnalise ? ': ' + messagePersonnalise : ''}` :
                            `Refusé par le médecin: ${motifRefus}`,
                        effectueeParId: medecinUser.id,
                        dateChangement: new Date()
                    }
                });

                // Stockage des créneaux alternatifs si refus
                if (decision === 'REFUSER' && creneauxAlternatifs.length > 0) {
                    for (const creneau of creneauxAlternatifs) {
                        await tx.creneauAlternatif.create({
                            data: {
                                rendezVousRefuseId: rendezVousId,
                                dateHeureDebut: new Date(creneau.dateHeureDebut),
                                typeConsultation: creneau.typeConsultation || rendezVous.typeConsultation,
                                proposeParMedecinId: rendezVous.medecinId,
                                statut: 'PROPOSE'
                            }
                        });
                    }
                }

                // Notification au patient
                const titreNotification = decision === 'ACCEPTER' ?
                    'Rendez-vous confirmé ✅' :
                    'Rendez-vous refusé ⚠️';

                const contenuNotification = decision === 'ACCEPTER' ?
                    `Votre rendez-vous du ${rdvUpdated.dateHeureDebut.toLocaleDateString('fr-FR')} à ${rdvUpdated.dateHeureDebut.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} avec le Dr ${rdvUpdated.medecin.user.nom} a été confirmé.${messagePersonnalise ? ' Message du médecin: ' + messagePersonnalise : ''}` :
                    `Votre demande de rendez-vous du ${rdvUpdated.dateHeureDebut.toLocaleDateString('fr-FR')} avec le Dr ${rdvUpdated.medecin.user.nom} a été refusée. Motif: ${motifRefus}${creneauxAlternatifs.length > 0 ? '. Des créneaux alternatifs vous ont été proposés.' : ''}`;

                await tx.notification.create({
                    data: {
                        userId: rdvUpdated.patient.user.id,
                        type: 'RENDEZ_VOUS',
                        titre: titreNotification,
                        contenu: contenuNotification,
                        statutNotification: 'EN_ATTENTE',
                        priorite: decision === 'ACCEPTER' ? 'NORMALE' : 'HAUTE',
                        canal: rdvUpdated.patient.user.canalCommunicationPrefere || 'EMAIL',
                        donnees: JSON.stringify({
                            rendezVousId: rdvUpdated.id,
                            decision,
                            creneauxAlternatifs: creneauxAlternatifs.length,
                            tarif_modifie: modificationsTarif ? modificationsTarif.nouveau_tarif : null
                        })
                    }
                });

                return { rdvUpdated, creneauxAlternatifs };
            });

            // Préparation de la réponse
            const reponse = {
                rendezVous: {
                    id: result.rdvUpdated.id,
                    statut: result.rdvUpdated.statut,
                    dateHeureDebut: result.rdvUpdated.dateHeureDebut,
                    dateHeureFin: result.rdvUpdated.dateHeureFin,
                    typeConsultation: result.rdvUpdated.typeConsultation,
                    dateReponse: result.rdvUpdated.dateReponse,
                    tarifPrevu: result.rdvUpdated.tarifPrevu
                },
                patient: {
                    nom: result.rdvUpdated.patient.user.nom,
                    prenom: result.rdvUpdated.patient.user.prenom,
                    telephone: result.rdvUpdated.patient.user.telephone
                },
                decision: decision,
                details: {}
            };

            if (decision === 'ACCEPTER') {
                reponse.details = {
                    message: 'Rendez-vous confirmé avec succès',
                    messagePersonnalise: messagePersonnalise || null,
                    modifications: modificationsTarif ? {
                        tarif: modificationsTarif.nouveau_tarif,
                        motif: modificationsTarif.motif_modification
                    } : null,
                    prochaines_etapes: [
                        'Le patient a été notifié de la confirmation',
                        'Le rendez-vous apparaît maintenant dans votre planning',
                        'Vous pouvez contacter le patient au ' + result.rdvUpdated.patient.user.telephone,
                        'Le patient peut annuler gratuitement jusqu\'à 24h avant le RDV'
                    ]
                };
            } else {
                reponse.details = {
                    message: 'Demande de rendez-vous refusée',
                    motifRefus: motifRefus,
                    messagePersonnalise: messagePersonnalise || null,
                    creneauxAlternatifs: creneauxAlternatifs.map(c => ({
                        dateHeureDebut: c.dateHeureDebut,
                        typeConsultation: c.typeConsultation || result.rdvUpdated.typeConsultation,
                        date: new Date(c.dateHeureDebut).toLocaleDateString('fr-FR'),
                        heure: new Date(c.dateHeureDebut).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})
                    })),
                    prochaines_etapes: [
                        'Le patient a été notifié du refus',
                        creneauxAlternatifs.length > 0 ? 'Des créneaux alternatifs lui ont été proposés' : null,
                        'Le patient peut faire une nouvelle demande',
                        'Votre planning reste inchangé'
                    ].filter(Boolean)
                };
            }

            const messageSucces = decision === 'ACCEPTER' ?
                'Rendez-vous confirmé avec succès' :
                'Demande de rendez-vous refusée avec succès';

            console.log(`✅ Réponse RDV: Dr ${medecinUser.nom} ${decision.toLowerCase()} RDV de ${result.rdvUpdated.patient.user.prenom} ${result.rdvUpdated.patient.user.nom}`);

            return ApiResponse.success(res, messageSucces, reponse);

        } catch (error) {
            console.error('❌ Erreur réponse rendez-vous:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la réponse au rendez-vous');
        }
    }
);

module.exports = router;