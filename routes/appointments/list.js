const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /appointments - Lister les rendez-vous de l'utilisateur
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT', 'MEDECIN']),
    async (req, res) => {
        try {
            const user = req.user;
            const {
                page = 1,
                limit = 20
            } = req.query;

            const pageInt = parseInt(page);
            const limitInt = Math.min(parseInt(limit), 50);
            const offset = (pageInt - 1) * limitInt;

            // Construction de la requête selon le rôle
            let whereClause = {};
            let include = {};

            if (user.role === 'PATIENT') {
                // Pour les patients : leurs propres RDV
                const patient = await prisma.patient.findUnique({
                    where: { userId: user.id },
                    select: { id: true }
                });

                if (!patient) {
                    return ApiResponse.notFound(res, 'Profil patient non trouvé');
                }

                whereClause.patientId = patient.id;
                include = {
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
                    },
                    patient: {
                        include: {
                            user: {
                                select: {
                                    nom: true,
                                    prenom: true
                                }
                            }
                        }
                    }
                };
            } else if (user.role === 'MEDECIN') {
                // Pour les médecins : leurs propres RDV
                const medecin = await prisma.medecin.findUnique({
                    where: { userId: user.id },
                    select: { id: true }
                });

                if (!medecin) {
                    return ApiResponse.notFound(res, 'Profil médecin non trouvé');
                }

                whereClause.medecinId = medecin.id;
                include = {
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
                                    prenom: true
                                }
                            }
                        }
                    }
                };
            }

            // Pas de filtres additionnels - liste complète avec pagination uniquement

            // Requêtes parallèles pour les données et le compte
            const [rendezVous, totalCount] = await Promise.all([
                prisma.rendezVous.findMany({
                    where: whereClause,
                    include: {
                        ...include,
                        evaluations: {
                            select: {
                                id: true,
                                note: true,
                                commentaire: true,
                                typeEvaluation: true,
                                dateEvaluation: true
                            }
                        },
                        consultation: {
                            select: {
                                id: true,
                                diagnostic: true,
                                documentsJoints: true
                            }
                        }
                    },
                    skip: offset,
                    take: limitInt,
                    orderBy: {
                        dateRendezVous: 'desc'
                    }
                }),
                prisma.rendezVous.count({ where: whereClause })
            ]);

            // Enrichissement des données selon le rôle
            const rendezVousEnriches = rendezVous.map(rdv => {
                const maintenant = new Date();
                // Reconstituer la date complète à partir de dateRendezVous et heureDebut
                const dateComplete = new Date(`${rdv.dateRendezVous.toISOString().split('T')[0]}T${rdv.heureDebut}:00.000Z`);
                const estPasse = dateComplete < maintenant;
                const estProche = !estPasse && (dateComplete - maintenant) < (24 * 60 * 60 * 1000);

                // Informations de base
                const rdvEnrichi = {
                    id: rdv.id,
                    dateRendezVous: rdv.dateRendezVous,
                    heureDebut: rdv.heureDebut,
                    heureFin: rdv.heureFin,
                    typeConsultation: rdv.typeConsultation,
                    statut: rdv.statut,
                    motifConsultation: rdv.motifConsultation,
                    niveauUrgence: rdv.niveauUrgence,
                    tarif: rdv.tarif,
                    adresseConsultation: rdv.adresseConsultation,
                    symptomes: rdv.symptomes,
                    
                    // Calculs temporels
                    estPasse,
                    estProche,
                    dansXMinutes: !estPasse ? Math.round((dateComplete - maintenant) / (1000 * 60)) : null,
                    dateHumaine: dateComplete.toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    heureHumaine: rdv.heureDebut,

                    // Dates importantes
                    dateCreation: rdv.createdAt,
                    
                    // Informations sur l'autre partie
                    partenaire: {}
                };

                if (user.role === 'PATIENT') {
                    // Vue patient : informations sur le médecin
                    rdvEnrichi.partenaire = {
                        type: 'medecin',
                        id: rdv.medecin.id,
                        nom: rdv.medecin.user.nom,
                        prenom: rdv.medecin.user.prenom,
                        specialites: rdv.medecin.specialites,
                        telephone: rdv.medecin.user.telephone,
                        email: rdv.medecin.user.email
                    };
                } else {
                    // Vue médecin : informations sur le patient
                    rdvEnrichi.partenaire = {
                        type: 'patient',
                        id: rdv.patient.id,
                        nom: rdv.patient.user.nom,
                        prenom: rdv.patient.user.prenom,
                        telephone: rdv.patient.user.telephone,
                        email: rdv.patient.user.email,
                        age: rdv.patient.dateNaissance ?
                            Math.floor((new Date() - new Date(rdv.patient.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000)) : null,
                        sexe: rdv.patient.sexe,
                        groupeSanguin: rdv.patient.groupeSanguin
                    };
                }

                // Évaluations
                rdvEnrichi.evaluation = {
                    aEvalue: rdv.evaluations.length > 0,
                    details: rdv.evaluations.map(evaluation => ({
                        id: evaluation.id,
                        note: evaluation.note,
                        commentaire: evaluation.commentaire,
                        typeEvaluation: evaluation.typeEvaluation,
                        date: evaluation.dateEvaluation
                    }))
                };

                // Consultation (si terminée)
                rdvEnrichi.consultation = rdv.consultation ? {
                    id: rdv.consultation.id,
                    aDiagnostic: !!rdv.consultation.diagnostic,
                    aDocuments: rdv.consultation.documentsJoints ? (Array.isArray(rdv.consultation.documentsJoints) ? rdv.consultation.documentsJoints.length : 0) : 0
                } : null;

                // Actions possibles selon le statut et le rôle
                rdvEnrichi.actionsPossibles = [];

                if (rdv.statut === 'DEMANDE' && user.role === 'MEDECIN') {
                    rdvEnrichi.actionsPossibles.push('ACCEPTER', 'REFUSER');
                }

                if (['DEMANDE', 'EN_ATTENTE', 'CONFIRME'].includes(rdv.statut) && !estPasse) {
                    rdvEnrichi.actionsPossibles.push('ANNULER');
                    if (rdv.statut === 'CONFIRME') {
                        rdvEnrichi.actionsPossibles.push('REPROGRAMMER');
                    }
                }

                if (rdv.statut === 'TERMINE' && !rdvEnrichi.evaluation.aEvalue) {
                    rdvEnrichi.actionsPossibles.push('EVALUER');
                }

                if (rdv.statut === 'CONFIRME' && user.role === 'MEDECIN' && estProche) {
                    rdvEnrichi.actionsPossibles.push('COMMENCER_CONSULTATION');
                }

                return rdvEnrichi;
            });

            // Statistiques globales
            const statistiques = {
                total: totalCount,
                parStatut: {},
                prochainRendezVous: null,
                rendezVousEnCours: rendezVousEnriches.filter(rdv => rdv.statut === 'EN_COURS').length,
                rendezVousAujourdHui: rendezVousEnriches.filter(rdv => {
                    const aujourdhui = new Date().toDateString();
                    return rdv.dateRendezVous.toDateString() === aujourdhui;
                }).length
            };

            // Calcul des statistiques par statut
            const tous_rdv = await prisma.rendezVous.findMany({
                where: user.role === 'PATIENT' ?
                    { patientId: (await prisma.patient.findUnique({ where: { userId: user.id }, select: { id: true } })).id } :
                    { medecinId: (await prisma.medecin.findUnique({ where: { userId: user.id }, select: { id: true } })).id },
                select: { statut: true }
            });

            tous_rdv.forEach(rdv => {
                statistiques.parStatut[rdv.statut] = (statistiques.parStatut[rdv.statut] || 0) + 1;
            });

            // Prochain RDV confirmé
            const prochainRdv = rendezVousEnriches.find(rdv =>
                rdv.statut === 'CONFIRME' && !rdv.estPasse
            );

            if (prochainRdv) {
                statistiques.prochainRendezVous = {
                    id: prochainRdv.id,
                    date: prochainRdv.dateHumaine,
                    heure: prochainRdv.heureHumaine,
                    avec: `${prochainRdv.partenaire.prenom} ${prochainRdv.partenaire.nom}`,
                    type: prochainRdv.typeConsultation,
                    dansXMinutes: prochainRdv.dansXMinutes
                };
            }

            // Métadonnées de pagination
            const totalPages = Math.ceil(totalCount / limitInt);

            const reponse = {
                rendezVous: rendezVousEnriches,
                pagination: {
                    page: pageInt,
                    limit: limitInt,
                    totalResults: totalCount,
                    totalPages,
                    hasNext: pageInt < totalPages,
                    hasPrevious: pageInt > 1
                },
                // Pas de filtres - liste simple avec pagination
                statistiques,
                user: {
                    role: user.role,
                    nom: user.nom,
                    prenom: user.prenom
                }
            };

            return ApiResponse.success(res, 'Rendez-vous récupérés avec succès', reponse);

        } catch (error) {
            console.error('❌ Erreur récupération rendez-vous:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la récupération des rendez-vous');
        }
    }
);

module.exports = router;