const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /medecins/dashboard - Tableau de bord médecin
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;
            const maintenant = new Date();

            console.log(`📊 Consultation dashboard médecin: Dr ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Récupération des informations de base du médecin
            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: {
                    id: true,
                    specialitePrincipale: true,
                    accepteNouveauxPatients: true,
                    statutValidation: true,
                    statut: true,
                    delaiMoyenReponse: true
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            // === STATISTIQUES GÉNÉRALES ===
            const [
                totalRendezVous,
                rdvAujourdHui,
                rdvDemain,
                rdvSemaineProchaine,
                rdvEnAttente,
                rdvConfirmes,
                rdvTerminesMoisActuel,
                totalPatients
            ] = await Promise.all([
                // Total des RDV
                prisma.rendezVous.count({
                    where: { medecinId: medecin.id }
                }),

                // RDV aujourd'hui
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        dateHeureDebut: {
                            gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()),
                            lt: new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1)
                        },
                        statut: { in: ['CONFIRME', 'EN_COURS'] }
                    }
                }),

                // RDV demain
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        dateHeureDebut: {
                            gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1),
                            lt: new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 2)
                        },
                        statut: { in: ['CONFIRME', 'EN_COURS'] }
                    }
                }),

                // RDV semaine prochaine
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        dateHeureDebut: {
                            gte: new Date(maintenant.getTime() + (7 * 24 * 60 * 60 * 1000)),
                            lt: new Date(maintenant.getTime() + (14 * 24 * 60 * 60 * 1000))
                        },
                        statut: { in: ['CONFIRME', 'EN_COURS'] }
                    }
                }),

                // RDV en attente de réponse
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        statut: { in: ['DEMANDE', 'EN_ATTENTE'] }
                    }
                }),

                // RDV confirmés (futurs)
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        statut: 'CONFIRME',
                        dateHeureDebut: { gte: maintenant }
                    }
                }),

                // RDV terminés ce mois
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        statut: 'TERMINE',
                        dateHeureDebut: {
                            gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1),
                            lt: new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1)
                        }
                    }
                }),

                // Patients uniques
                prisma.rendezVous.findMany({
                    where: {
                        medecinId: medecin.id,
                        statut: 'TERMINE'
                    },
                    select: { patientId: true },
                    distinct: ['patientId']
                })
            ]);

            // === PROCHAINS RENDEZ-VOUS ===
            const prochainsRendezVous = await prisma.rendezVous.findMany({
                where: {
                    medecinId: medecin.id,
                    dateHeureDebut: { gte: maintenant },
                    statut: { in: ['CONFIRME', 'EN_COURS'] }
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
                    }
                },
                orderBy: {
                    dateHeureDebut: 'asc'
                },
                take: 10
            });

            // === DEMANDES EN ATTENTE ===
            const demandesEnAttente = await prisma.rendezVous.findMany({
                where: {
                    medecinId: medecin.id,
                    statut: { in: ['DEMANDE', 'EN_ATTENTE'] }
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
                    }
                },
                orderBy: {
                    createdAt: 'asc'
                },
                take: 10
            });

            // === ÉVALUATIONS RÉCENTES ===
            const evaluationsRecentes = await prisma.evaluation.findMany({
                where: {
                    evalueId: user.id,
                    typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                },
                include: {
                    evaluateur: {
                        select: {
                            patient: {
                                select: {
                                    user: {
                                        select: {
                                            prenom: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 5
            });

            // === REVENUS ESTIMÉS (si système de paiement) ===
            const revenus = await prisma.rendezVous.aggregate({
                where: {
                    medecinId: medecin.id,
                    statut: 'TERMINE',
                    dateHeureDebut: {
                        gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
                    }
                },
                _sum: {
                    tarifPrevu: true
                }
            });

            // === STATISTIQUES PAR TYPE DE CONSULTATION ===
            const [consultationsClinique, consultationsDomicile, teleconsultations] = await Promise.all([
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        typeConsultation: 'CLINIQUE',
                        statut: 'TERMINE',
                        dateHeureDebut: {
                            gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
                        }
                    }
                }),
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        typeConsultation: 'DOMICILE',
                        statut: 'TERMINE',
                        dateHeureDebut: {
                            gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
                        }
                    }
                }),
                prisma.rendezVous.count({
                    where: {
                        medecinId: medecin.id,
                        typeConsultation: 'TELECONSULTATION',
                        statut: 'TERMINE',
                        dateHeureDebut: {
                            gte: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
                        }
                    }
                })
            ]);

            // === CALCULS ET MÉTRIQUES ===
            const moyenneEvaluations = evaluationsRecentes.length > 0
                ? evaluationsRecentes.reduce((sum, evaluation) => sum + evaluation.note, 0) / evaluationsRecentes.length
                : null;

            const tauxRecommandation = evaluationsRecentes.length > 0
                ? Math.round((evaluationsRecentes.filter(e => e.recommande).length / evaluationsRecentes.length) * 100)
                : null;

            // Calcul du temps de réponse moyen actuel
            const demandesAvecReponse = await prisma.rendezVous.findMany({
                where: {
                    medecinId: medecin.id,
                    dateReponse: { not: null },
                    createdAt: {
                        gte: new Date(maintenant.getTime() - (30 * 24 * 60 * 60 * 1000)) // 30 derniers jours
                    }
                },
                select: {
                    createdAt: true,
                    dateReponse: true
                }
            });

            const tempsReponse = demandesAvecReponse.length > 0
                ? Math.round(
                    demandesAvecReponse.reduce((sum, rdv) => 
                        sum + ((new Date(rdv.dateReponse) - new Date(rdv.createdAt)) / (1000 * 60 * 60)), 0
                    ) / demandesAvecReponse.length
                )
                : null;

            // === PRÉPARATION DE LA RÉPONSE ===
            const dashboardData = {
                medecin: {
                    nom: user.nom,
                    prenom: user.prenom,
                    specialite: medecin.specialitePrincipale,
                    statutValidation: medecin.statutValidation,
                    statut: medecin.statut,
                    accepteNouveauxPatients: medecin.accepteNouveauxPatients
                },

                // Statistiques principales
                statistiquesGlobales: {
                    totalRendezVous,
                    totalPatients: totalPatients.length,
                    rdvTerminesMoisActuel,
                    rdvEnAttente,
                    rdvConfirmes,
                    revenus: {
                        moisActuel: revenus._sum.tarifPrevu || 0,
                        devise: 'XOF'
                    }
                },

                // Planning immédiat
                planning: {
                    aujourdHui: rdvAujourdHui,
                    demain: rdvDemain,
                    semaineProchaine: rdvSemaineProchaine,
                    prochainsRendezVous: prochainsRendezVous.map(rdv => ({
                        id: rdv.id,
                        date: rdv.dateHeureDebut,
                        patient: `${rdv.patient.user.prenom} ${rdv.patient.user.nom}`,
                        telephone: rdv.patient.user.telephone,
                        typeConsultation: rdv.typeConsultation,
                        motif: rdv.motifConsultation,
                        duree: rdv.dureeEstimee || 30,
                        statut: rdv.statut,
                        dansXHeures: Math.round((new Date(rdv.dateHeureDebut) - maintenant) / (1000 * 60 * 60))
                    }))
                },

                // Demandes à traiter
                demandes: {
                    nombreEnAttente: rdvEnAttente,
                    liste: demandesEnAttente.map(demande => ({
                        id: demande.id,
                        dateeDemande: demande.createdAt,
                        patient: `${demande.patient.user.prenom} ${demande.patient.user.nom}`,
                        telephone: demande.patient.user.telephone,
                        datesouhaitee: demande.dateHeureDebut,
                        typeConsultation: demande.typeConsultation,
                        motif: demande.motifConsultation,
                        niveauUrgence: demande.niveauUrgence,
                        enAttenteDepuis: Math.round((maintenant - new Date(demande.createdAt)) / (1000 * 60 * 60)),
                        statut: demande.statut
                    })),
                    tempsReponseActuel: tempsReponse ? `${tempsReponse}h` : null,
                    tempsReponseCible: medecin.delaiMoyenReponse ? `${medecin.delaiMoyenReponse}h` : '24h'
                },

                // Performance et évaluations
                performance: {
                    evaluations: {
                        nombre: evaluationsRecentes.length,
                        moyenneNotes: moyenneEvaluations ? Math.round(moyenneEvaluations * 10) / 10 : null,
                        tauxRecommandation,
                        dernieresEvaluations: evaluationsRecentes.map(evaluation => ({
                            note: evaluation.note,
                            commentaire: evaluation.commentaire,
                            recommande: evaluation.recommande,
                            patient: evaluation.evaluateur.patient?.user.prenom || 'Anonyme',
                            date: evaluation.createdAt
                        }))
                    },
                    consultations: {
                        repartitionTypes: {
                            clinique: consultationsClinique,
                            domicile: consultationsDomicile,
                            teleconsultation: teleconsultations
                        },
                        total: consultationsClinique + consultationsDomicile + teleconsultations
                    }
                },

                // Alertes et recommandations
                alertes: {
                    urgentes: [
                        rdvEnAttente > 5 ? `${rdvEnAttente} demandes en attente de réponse` : null,
                        rdvAujourdHui > 0 ? `${rdvAujourdHui} RDV aujourd'hui` : null,
                        tempsReponse && tempsReponse > 24 ? `Temps de réponse élevé: ${tempsReponse}h` : null
                    ].filter(Boolean),
                    recommandations: [
                        !medecin.accepteNouveauxPatients ? 'Ouvrir l\'agenda pour recevoir de nouveaux patients' : null,
                        evaluationsRecentes.length < 5 ? 'Encourager les patients à laisser des évaluations' : null,
                        rdvTerminesMoisActuel < 20 ? 'Activité faible ce mois-ci' : null
                    ].filter(Boolean)
                },

                // Métadonnées
                metadata: {
                    derniereActualisation: maintenant.toISOString(),
                    periodAnalysee: 'Mois en cours',
                    versionDashboard: '1.0'
                }
            };

            console.log(`✅ Dashboard médecin consulté: Dr ${user.prenom} ${user.nom} - RDV aujourd'hui: ${rdvAujourdHui}, En attente: ${rdvEnAttente}`);

            return ApiResponse.success(res, 'Tableau de bord récupéré avec succès', dashboardData);

        } catch (error) {
            console.error('❌ Erreur consultation dashboard médecin:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la consultation du tableau de bord');
        }
    }
);

module.exports = router;