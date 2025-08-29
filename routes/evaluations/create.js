const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation pour les évaluations
const createEvaluationSchema = {
    fields: {
        rendezVousId: {
            type: 'string',
            minLength: 1
        },
        typeEvaluation: {
            type: 'string',
            enum: ['PATIENT_EVALUE_MEDECIN', 'MEDECIN_EVALUE_PATIENT']
        },
        note: {
            type: 'number',
            min: 1,
            max: 5
        },
        commentaire: {
            type: 'string',
            minLength: 10,
            maxLength: 1000
        },
        recommande: {
            type: 'boolean'
        },
        criteresSpecifiques: {
            type: 'object',
            properties: {
                ponctualite: { type: 'number', min: 1, max: 5 },
                communication: { type: 'number', min: 1, max: 5 },
                competence: { type: 'number', min: 1, max: 5 },
                courtoisie: { type: 'number', min: 1, max: 5 },
                suivi: { type: 'number', min: 1, max: 5 }
            }
        },
        anonyme: {
            type: 'boolean'
        }
    },
    required: ['rendezVousId', 'typeEvaluation', 'note', 'commentaire', 'recommande'],
    strict: true
};

/**
 * POST /evaluations - Créer une évaluation post-rendez-vous
 */
router.post('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT', 'MEDECIN']),
    BodyFilter.validate(createEvaluationSchema),
    async (req, res) => {
        try {
            const user = req.user;
            const {
                rendezVousId,
                typeEvaluation,
                note,
                commentaire,
                recommande,
                criteresSpecifiques = {},
                anonyme = false
            } = req.body;

            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`⭐ Nouvelle évaluation: ${user.prenom} ${user.nom} (${user.role}) - Note: ${note}/5`);

            // Vérification du rendez-vous
            const rendezVous = await prisma.rendezVous.findUnique({
                where: { id: rendezVousId },
                include: {
                    patient: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    nom: true,
                                    prenom: true
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
                                    prenom: true
                                }
                            }
                        }
                    }
                }
            });

            if (!rendezVous) {
                return ApiResponse.notFound(res, 'Rendez-vous non trouvé');
            }

            // Vérifications d'autorisation selon le type d'évaluation
            let evaluateurId, evalueId, authorisationValide = false;

            if (typeEvaluation === 'PATIENT_EVALUE_MEDECIN') {
                // Patient évalue médecin
                if (user.role === 'PATIENT' && rendezVous.patient.user.id === user.id) {
                    evaluateurId = user.id;
                    evalueId = rendezVous.medecin.user.id;
                    authorisationValide = true;
                }
            } else if (typeEvaluation === 'MEDECIN_EVALUE_PATIENT') {
                // Médecin évalue patient
                if (user.role === 'MEDECIN' && rendezVous.medecin.user.id === user.id) {
                    evaluateurId = user.id;
                    evalueId = rendezVous.patient.user.id;
                    authorisationValide = true;
                }
            }

            if (!authorisationValide) {
                return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à évaluer ce rendez-vous');
            }

            // Vérification que le rendez-vous est terminé
            if (rendezVous.statut !== 'TERMINE') {
                return ApiResponse.badRequest(res, 'Seuls les rendez-vous terminés peuvent être évalués');
            }

            // Vérification qu'aucune évaluation n'existe déjà
            const evaluationExistante = await prisma.evaluation.findFirst({
                where: {
                    rendezVousId: rendezVousId,
                    evaluateurId: evaluateurId,
                    typeEvaluation: typeEvaluation
                }
            });

            if (evaluationExistante) {
                return ApiResponse.badRequest(res, 'Vous avez déjà évalué ce rendez-vous');
            }

            // Vérification de la limite de temps pour évaluer (ex: 30 jours après le RDV)
            const limiteEvaluation = new Date(rendezVous.dateHeureFin.getTime() + (30 * 24 * 60 * 60 * 1000));
            if (new Date() > limiteEvaluation) {
                return ApiResponse.badRequest(res, 'Délai d\'évaluation dépassé (30 jours maximum)');
            }

            // Validation des critères spécifiques selon le type
            let criteresValides = {};
            if (typeEvaluation === 'PATIENT_EVALUE_MEDECIN') {
                // Critères pour l'évaluation d'un médecin
                const criteresAutoriseseMedecin = ['ponctualite', 'communication', 'competence', 'courtoisie', 'suivi'];
                Object.keys(criteresSpecifiques).forEach(critere => {
                    if (criteresAutoriseseMedecin.includes(critere)) {
                        criteresValides[critere] = criteresSpecifiques[critere];
                    }
                });
            } else {
                // Critères pour l'évaluation d'un patient
                const criteresAutorisesPatient = ['ponctualite', 'communication', 'courtoisie', 'suivi'];
                Object.keys(criteresSpecifiques).forEach(critere => {
                    if (criteresAutorisesPatient.includes(critere)) {
                        criteresValides[critere] = criteresSpecifiques[critere];
                    }
                });
            }

            // Création de l'évaluation en transaction
            const evaluation = await prisma.$transaction(async (tx) => {
                // Créer l'évaluation
                const nouvelleEvaluation = await tx.evaluation.create({
                    data: {
                        rendezVousId,
                        evaluateurId,
                        evalueId,
                        typeEvaluation,
                        note,
                        commentaire,
                        recommande,
                        criteresSpecifiques: Object.keys(criteresValides).length > 0 
                            ? JSON.stringify(criteresValides) 
                            : null,
                        anonyme,
                        adresseIP: clientIp,
                        userAgent: req.get('User-Agent') || 'Unknown'
                    },
                    include: {
                        rendezVous: {
                            include: {
                                patient: {
                                    include: {
                                        user: {
                                            select: { nom: true, prenom: true }
                                        }
                                    }
                                },
                                medecin: {
                                    include: {
                                        user: {
                                            select: { nom: true, prenom: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });

                // Notification à l'évalué
                const evaluateurNom = anonyme ? 'Un utilisateur' : `${user.prenom} ${user.nom}`;
                const titreNotification = typeEvaluation === 'PATIENT_EVALUE_MEDECIN' 
                    ? '⭐ Nouvelle évaluation reçue'
                    : '📝 Évaluation de votre consultation';

                const contenuNotification = typeEvaluation === 'PATIENT_EVALUE_MEDECIN'
                    ? `${evaluateurNom} vous a évalué ${note}/5 étoiles${recommande ? ' et vous recommande' : ''}.${commentaire ? ` "${commentaire.substring(0, 100)}..."` : ''}`
                    : `Votre médecin vous a évalué ${note}/5 pour la consultation du ${rendezVous.dateHeureDebut.toLocaleDateString()}.`;

                await tx.notification.create({
                    data: {
                        userId: evalueId,
                        type: 'EVALUATION',
                        titre: titreNotification,
                        contenu: contenuNotification,
                        statutNotification: 'EN_ATTENTE',
                        priorite: note >= 4 ? 'NORMALE' : 'HAUTE',
                        canal: 'EMAIL', // Canal par défaut
                        donnees: JSON.stringify({
                            evaluationId: nouvelleEvaluation.id,
                            note,
                            recommande,
                            typeEvaluation,
                            anonyme
                        })
                    }
                });

                // Mise à jour des statistiques de l'évalué (cache)
                if (typeEvaluation === 'PATIENT_EVALUE_MEDECIN') {
                    // Recalcul de la note moyenne du médecin
                    const toutesEvaluations = await tx.evaluation.findMany({
                        where: {
                            evalueId,
                            typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                        },
                        select: { note: true, recommande: true }
                    });

                    const noteMoyenne = toutesEvaluations.reduce((sum, e) => sum + e.note, 0) / toutesEvaluations.length;
                    const tauxRecommandation = Math.round((toutesEvaluations.filter(e => e.recommande).length / toutesEvaluations.length) * 100);

                    // Mise à jour des stats du médecin (si table de cache existe)
                    await tx.medecin.update({
                        where: { userId: evalueId },
                        data: {
                            noteMoyenne: Math.round(noteMoyenne * 10) / 10,
                            nombreEvaluations: toutesEvaluations.length,
                            tauxRecommandation
                        }
                    }).catch(() => {
                        // Les champs n'existent peut-être pas encore dans la table
                        console.log('⚠️ Champs de statistiques non disponibles dans la table Medecin');
                    });
                }

                return nouvelleEvaluation;
            });

            // Préparation de la réponse
            const reponse = {
                evaluation: {
                    id: evaluation.id,
                    note: evaluation.note,
                    commentaire: evaluation.commentaire,
                    recommande: evaluation.recommande,
                    criteresSpecifiques: evaluation.criteresSpecifiques ? 
                        JSON.parse(evaluation.criteresSpecifiques) : null,
                    anonyme: evaluation.anonyme,
                    dateCreation: evaluation.createdAt
                },
                
                rendezVous: {
                    id: evaluation.rendezVous.id,
                    date: evaluation.rendezVous.dateHeureDebut,
                    typeConsultation: evaluation.rendezVous.typeConsultation,
                    motif: evaluation.rendezVous.motifConsultation
                },

                partenaire: typeEvaluation === 'PATIENT_EVALUE_MEDECIN' ? {
                    type: 'medecin',
                    nom: evaluation.rendezVous.medecin.user.nom,
                    prenom: evaluation.rendezVous.medecin.user.prenom
                } : {
                    type: 'patient',
                    nom: anonyme ? 'Anonyme' : evaluation.rendezVous.patient.user.nom,
                    prenom: anonyme ? '' : evaluation.rendezVous.patient.user.prenom
                },

                impact: {
                    notificationEnvoyee: true,
                    contributionStats: true,
                    visibilitePublique: !anonyme,
                    aideFutursProfessionnels: recommande
                },

                prochaines_etapes: typeEvaluation === 'PATIENT_EVALUE_MEDECIN' ? [
                    'Votre évaluation aide d\'autres patients dans leur choix',
                    recommande ? 'Merci de recommander ce médecin' : null,
                    'Vous pouvez modifier votre évaluation pendant 7 jours',
                    'Le médecin peut vous répondre publiquement'
                ].filter(Boolean) : [
                    'Votre retour aide à améliorer l\'expérience patient',
                    'Cette évaluation reste confidentielle',
                    'Merci pour votre professionnalisme'
                ]
            };

            console.log(`✅ Évaluation créée: ${user.prenom} ${user.nom} -> ${typeEvaluation} - Note: ${note}/5`);

            return ApiResponse.success(res, 'Évaluation enregistrée avec succès', reponse);

        } catch (error) {
            console.error('❌ Erreur création évaluation:', error);

            if (error.code === 'P2002') {
                return ApiResponse.badRequest(res, 'Une évaluation existe déjà pour ce rendez-vous');
            }

            return ApiResponse.serverError(res, 'Erreur lors de l\'enregistrement de l\'évaluation');
        }
    }
);

module.exports = router;