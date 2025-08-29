const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /medecins/patients - Liste des patients suivis par le médecin
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    async (req, res) => {
        try {
            const user = req.user;
            const {
                recherche,
                statut = 'TOUS',
                typeRelation = 'TOUS',
                orderBy = 'derniere_consultation',
                order = 'desc',
                page = 1,
                limit = 20
            } = req.query;

            const pageInt = parseInt(page);
            const limitInt = Math.min(parseInt(limit), 50);
            const offset = (pageInt - 1) * limitInt;

            console.log(`👥 Consultation liste patients: Dr ${user.prenom} ${user.nom} - Page ${pageInt}`);

            // Vérification du médecin
            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { id: true }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            // Construction de la requête pour récupérer les patients
            const whereCondition = {
                medecinId: medecin.id
            };

            // Ajout du filtre de statut
            if (statut !== 'TOUS') {
                whereCondition.statut = statut;
            }

            // Récupération des rendez-vous uniques avec informations patient
            const rendezVousUniques = await prisma.rendezVous.findMany({
                where: whereCondition,
                select: {
                    patientId: true,
                    statut: true,
                    dateHeureDebut: true,
                    typeConsultation: true,
                    createdAt: true
                },
                distinct: ['patientId']
            });

            const patientsIds = rendezVousUniques.map(rdv => rdv.patientId);

            // Construction des filtres patients
            const patientWhere = {
                id: { in: patientsIds }
            };

            // Filtre de recherche
            if (recherche) {
                patientWhere.user = {
                    OR: [
                        { nom: { contains: recherche, mode: 'insensitive' } },
                        { prenom: { contains: recherche, mode: 'insensitive' } },
                        { telephone: { contains: recherche } },
                        { email: { contains: recherche, mode: 'insensitive' } }
                    ]
                };
            }

            // Récupération des patients avec leurs statistiques
            const patients = await prisma.patient.findMany({
                where: patientWhere,
                include: {
                    user: {
                        select: {
                            id: true,
                            nom: true,
                            prenom: true,
                            email: true,
                            telephone: true,
                            statut: true,
                            createdAt: true
                        }
                    },
                    rendezVous: {
                        where: { medecinId: medecin.id },
                        select: {
                            id: true,
                            dateHeureDebut: true,
                            dateHeureFin: true,
                            statut: true,
                            typeConsultation: true,
                            motifConsultation: true,
                            tarifPrevu: true,
                            createdAt: true
                        },
                        orderBy: {
                            dateHeureDebut: 'desc'
                        }
                    }
                },
                skip: offset,
                take: limitInt
            });

            // Calcul des statistiques pour chaque patient
            const patientsEnriches = await Promise.all(patients.map(async (patient) => {
                const rendezVous = patient.rendezVous;
                
                // Statistiques générales
                const totalRendezVous = rendezVous.length;
                const rdvTermines = rendezVous.filter(rdv => rdv.statut === 'TERMINE').length;
                const rdvAnnules = rendezVous.filter(rdv => rdv.statut === 'ANNULE').length;
                const rdvFuturs = rendezVous.filter(rdv => 
                    rdv.dateHeureDebut > new Date() && 
                    ['CONFIRME', 'EN_ATTENTE'].includes(rdv.statut)
                ).length;

                // Dernière et prochaine consultation
                const derniereConsultation = rendezVous
                    .filter(rdv => rdv.statut === 'TERMINE')
                    .sort((a, b) => new Date(b.dateHeureDebut) - new Date(a.dateHeureDebut))[0];

                const prochaineConsultation = rendezVous
                    .filter(rdv => rdv.dateHeureDebut > new Date() && rdv.statut === 'CONFIRME')
                    .sort((a, b) => new Date(a.dateHeureDebut) - new Date(b.dateHeureDebut))[0];

                // Relation avec le patient
                const premiereConsultation = rendezVous
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

                let typeRelationPatient = 'NOUVEAU';
                if (rdvTermines >= 5) {
                    typeRelationPatient = 'REGULIER';
                } else if (rdvTermines >= 2) {
                    typeRelationPatient = 'SUIVI';
                }

                // Calcul de l'ancienneté de la relation
                const ancienneteJours = premiereConsultation
                    ? Math.floor((new Date() - new Date(premiereConsultation.createdAt)) / (1000 * 60 * 60 * 24))
                    : 0;

                // Types de consultation préférés
                const typesConsultation = {};
                rendezVous.forEach(rdv => {
                    typesConsultation[rdv.typeConsultation] = (typesConsultation[rdv.typeConsultation] || 0) + 1;
                });

                // Revenus générés par ce patient
                const revenus = rendezVous
                    .filter(rdv => rdv.statut === 'TERMINE')
                    .reduce((sum, rdv) => sum + (rdv.tarifPrevu || 0), 0);

                // Calcul âge si date de naissance disponible
                let age = null;
                if (patient.dateNaissance) {
                    age = Math.floor((new Date() - new Date(patient.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000));
                }

                // Dernières consultations détaillées avec diagnostic
                const dernieresConsultations = await prisma.consultation.findMany({
                    where: {
                        rendezVous: {
                            patientId: patient.id,
                            medecinId: medecin.id,
                            statut: 'TERMINE'
                        }
                    },
                    select: {
                        id: true,
                        diagnostic: true,
                        traitementPrescrit: true,
                        recommandations: true,
                        createdAt: true,
                        rendezVous: {
                            select: {
                                dateHeureDebut: true,
                                typeConsultation: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 5
                });

                // Évaluations reçues de ce patient
                const evaluations = await prisma.evaluation.findMany({
                    where: {
                        evaluateurId: patient.user.id,
                        evalueId: user.id,
                        typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                    },
                    select: {
                        note: true,
                        commentaire: true,
                        recommande: true,
                        createdAt: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                const noteMoyennePatient = evaluations.length > 0
                    ? evaluations.reduce((sum, eval) => sum + eval.note, 0) / evaluations.length
                    : null;

                return {
                    // Informations de base
                    patient: {
                        id: patient.id,
                        nom: patient.user.nom,
                        prenom: patient.user.prenom,
                        email: patient.user.email,
                        telephone: patient.user.telephone,
                        statut: patient.user.statut,
                        dateInscription: patient.user.createdAt,
                        
                        // Informations médicales de base (non sensibles)
                        age,
                        sexe: patient.sexe,
                        ville: patient.ville,
                        groupeSanguin: patient.groupeSanguin,
                        
                        // Informations importantes pour le médecin
                        allergiesConnues: !!patient.allergies,
                        antecedenets: !!patient.antecedentsMedicaux,
                        traitementsEnCours: !!patient.traitementsEnCours
                    },

                    // Relation médicale
                    relation: {
                        type: typeRelationPatient,
                        ancienneteJours,
                        ancienneteMois: Math.floor(ancienneteJours / 30),
                        premiereConsultation: premiereConsultation?.createdAt,
                        derniereConsultation: derniereConsultation?.dateHeureDebut,
                        prochaineConsultation: prochaineConsultation?.dateHeureDebut
                    },

                    // Statistiques des rendez-vous
                    statistiques: {
                        totalRendezVous,
                        rdvTermines,
                        rdvAnnules,
                        rdvFuturs,
                        tauxCompletionRdv: totalRendezVous > 0 ? Math.round((rdvTermines / totalRendezVous) * 100) : 0,
                        typesConsultationPreferences: typesConsultation,
                        revenus: {
                            total: revenus,
                            devise: 'XOF',
                            moyenneParConsultation: rdvTermines > 0 ? Math.round(revenus / rdvTermines) : 0
                        }
                    },

                    // Historique médical récent
                    historiqueMedical: {
                        dernieresConsultations: dernieresConsultations.map(consultation => ({
                            id: consultation.id,
                            date: consultation.rendezVous.dateHeureDebut,
                            type: consultation.rendezVous.typeConsultation,
                            aDiagnostic: !!consultation.diagnostic,
                            aTraitement: !!consultation.traitementPrescrit,
                            aRecommandations: !!consultation.recommandations
                        })),
                        nombreConsultationsDetaillees: dernieresConsultations.length
                    },

                    // Évaluations et satisfaction
                    evaluations: {
                        nombre: evaluations.length,
                        noteMoyenne: noteMoyennePatient ? Math.round(noteMoyennePatient * 10) / 10 : null,
                        recommandations: evaluations.filter(e => e.recommande).length,
                        derniereEvaluation: evaluations.length > 0 ? {
                            note: evaluations[0].note,
                            date: evaluations[0].createdAt,
                            recommande: evaluations[0].recommande
                        } : null
                    },

                    // Actions possibles
                    actionsPossibles: [
                        prochaineConsultation ? 'VOIR_PROCHAIN_RDV' : null,
                        'CONSULTER_HISTORIQUE_COMPLET',
                        'PROPOSER_RDV',
                        derniereConsultation ? 'VOIR_DERNIERE_CONSULTATION' : null,
                        rdvTermines >= 2 ? 'ANALYSE_EVOLUTION' : null
                    ].filter(Boolean),

                    // Indicateurs de priorité
                    priorite: {
                        niveau: rdvFuturs > 0 ? 'NORMALE' : 
                               ancienneteJours > 180 && rdvTermines === 0 ? 'RELANCE' :
                               typeRelationPatient === 'REGULIER' ? 'SUIVI' : 'NORMALE',
                        raison: rdvFuturs > 0 ? 'RDV programmé' :
                               ancienneteJours > 180 && rdvTermines === 0 ? 'Patient inactif' :
                               typeRelationPatient === 'REGULIER' ? 'Patient régulier' : null
                    }
                };
            }));

            // Tri selon le critère demandé
            patientsEnriches.sort((a, b) => {
                let compareValue = 0;
                switch (orderBy) {
                    case 'nom':
                        compareValue = a.patient.nom.localeCompare(b.patient.nom);
                        break;
                    case 'derniere_consultation':
                        const dateA = a.relation.derniereConsultation ? new Date(a.relation.derniereConsultation) : new Date(0);
                        const dateB = b.relation.derniereConsultation ? new Date(b.relation.derniereConsultation) : new Date(0);
                        compareValue = dateB - dateA;
                        break;
                    case 'nombre_rdv':
                        compareValue = b.statistiques.totalRendezVous - a.statistiques.totalRendezVous;
                        break;
                    case 'anciennete':
                        compareValue = b.relation.ancienneteJours - a.relation.ancienneteJours;
                        break;
                    case 'revenus':
                        compareValue = b.statistiques.revenus.total - a.statistiques.revenus.total;
                        break;
                }
                return order === 'asc' ? compareValue : -compareValue;
            });

            // Filtrage par type de relation si spécifié
            const patientsFiltres = typeRelation !== 'TOUS' 
                ? patientsEnriches.filter(p => p.relation.type === typeRelation)
                : patientsEnriches;

            // Statistiques globales
            const statistiquesGlobales = {
                totalPatients: patientsFiltres.length,
                repartitionTypes: {
                    NOUVEAU: patientsEnriches.filter(p => p.relation.type === 'NOUVEAU').length,
                    SUIVI: patientsEnriches.filter(p => p.relation.type === 'SUIVI').length,
                    REGULIER: patientsEnriches.filter(p => p.relation.type === 'REGULIER').length
                },
                rdvFutursTotal: patientsEnriches.reduce((sum, p) => sum + p.statistiques.rdvFuturs, 0),
                revenusTotal: patientsEnriches.reduce((sum, p) => sum + p.statistiques.revenus.total, 0),
                patientsPriorite: patientsEnriches.filter(p => p.priorite.niveau !== 'NORMALE').length
            };

            const pagination = {
                page: pageInt,
                limit: limitInt,
                totalResults: patientsFiltres.length,
                totalPages: Math.ceil(patientsFiltres.length / limitInt),
                hasNext: pageInt < Math.ceil(patientsFiltres.length / limitInt),
                hasPrevious: pageInt > 1
            };

            const responseData = {
                patients: patientsFiltres,
                statistiques: statistiquesGlobales,
                pagination,
                filtres: {
                    recherche: recherche || null,
                    statut,
                    typeRelation,
                    orderBy,
                    order
                },
                metadata: {
                    derniereActualisation: new Date().toISOString(),
                    medecin: {
                        nom: user.nom,
                        prenom: user.prenom
                    }
                }
            };

            console.log(`✅ Liste patients consultée: Dr ${user.prenom} ${user.nom} - ${patientsFiltres.length} patients trouvés`);

            return ApiResponse.success(res, 'Liste des patients récupérée avec succès', responseData);

        } catch (error) {
            console.error('❌ Erreur récupération liste patients:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la récupération de la liste des patients');
        }
    }
);

module.exports = router;