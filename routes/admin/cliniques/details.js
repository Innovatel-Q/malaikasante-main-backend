// routes/admin/cliniques/details.js
const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');

// GET /v1/admin/cliniques/:cliniqueId - Consulter les détails d'une clinique avec ses médecins
router.get('/:cliniqueId',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    async (req, res) => {
        try {
            const { cliniqueId } = req.params;
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🏥 Admin ${adminUser.prenom} ${adminUser.nom} consulte les détails de la clinique: ${cliniqueId}`);

            // Récupérer la clinique avec tous ses détails et médecins affiliés
            const clinique = await prisma.clinique.findUnique({
                where: { id: cliniqueId },
                include: {
                    medecins: {
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
                            }
                        },
                        orderBy: {
                            user: { createdAt: 'desc' }
                        }
                    },
                    disponibilites: {
                        select: {
                            id: true,
                            jourSemaine: true,
                            heureDebut: true,
                            heureFin: true,
                            typeConsultation: true,
                            medecin: {
                                select: {
                                    user: {
                                        select: {
                                            nom: true,
                                            prenom: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    rendezVous: {
                        where: {
                            dateRendezVous: {
                                gte: new Date() // Seulement les RDV futurs
                            }
                        },
                        select: {
                            id: true,
                            dateRendezVous: true,
                            statut: true,
                            typeConsultation: true,
                            medecin: {
                                select: {
                                    user: {
                                        select: {
                                            nom: true,
                                            prenom: true
                                        }
                                    }
                                }
                            },
                            patient: {
                                select: {
                                    user: {
                                        select: {
                                            nom: true,
                                            prenom: true
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: {
                            dateRendezVous: 'asc'
                        },
                        take: 10 // Limiter à 10 prochains RDV
                    }
                }
            });

            if (!clinique) {
                return ApiResponse.notFound(res, 'Clinique non trouvée', {
                    code: 'CLINIQUE_NOT_FOUND',
                    cliniqueId
                });
            }

            // Formatage des médecins affiliés avec statistiques
            const medecinFormates = clinique.medecins.map(medecin => {
                // Calculer les statistiques du médecin
                const rdvMedecin = clinique.rendezVous.filter(rdv => rdv.medecin && rdv.medecin.user.nom === medecin.user.nom);
                
                return {
                    id: medecin.id,
                    user: {
                        id: medecin.user.id,
                        nom: medecin.user.nom,
                        prenom: medecin.user.prenom,
                        email: medecin.user.email,
                        telephone: medecin.user.telephone,
                        statut: medecin.user.statut
                    },
                    numeroOrdre: medecin.numeroOrdre,
                    specialites: medecin.specialites,
                    statutValidation: medecin.statutValidation,
                    experienceAnnees: medecin.experienceAnnees,
                    accepteDomicile: medecin.accepteDomicile,
                    accepteTeleconsultation: medecin.accepteTeleconsultation,
                    accepteclinique: medecin.accepteclinique,
                    tarifConsultationBase: medecin.tarifConsultationBase,
                    noteMoyenne: medecin.noteMoyenne,
                    nombreEvaluations: medecin.nombreEvaluations,
                    dateAssociation: medecin.user.createdAt,
                    statistiques: {
                        prochainRendezVous: rdvMedecin.length,
                        disponibilitesClinique: clinique.disponibilites.filter(
                            dispo => dispo.medecin.user.nom === medecin.user.nom
                        ).length
                    }
                };
            });

            // Statistiques générales de la clinique
            const statistiquesGenerales = {
                totalMedecins: clinique.medecins.length,
                medecinsValides: clinique.medecins.filter(m => m.statutValidation === 'VALIDE').length,
                medecinsEnAttente: clinique.medecins.filter(m => m.statutValidation === 'EN_ATTENTE').length,
                totalDisponibilites: clinique.disponibilites.length,
                prochainsRendezVous: clinique.rendezVous.length,
                specialitesDisponibles: [
                    ...new Set(
                        clinique.medecins
                            .filter(m => m.statutValidation === 'VALIDE')
                            .flatMap(m => m.specialites || [])
                    )
                ],
                typesConsultation: {
                    domicile: clinique.medecins.filter(m => m.accepteDomicile).length,
                    teleconsultation: clinique.medecins.filter(m => m.accepteTeleconsultation).length,
                    clinique: clinique.medecins.filter(m => m.accepteclinique).length
                }
            };

            // Informations sur les disponibilités par jour
            const disponibilitesParJour = {};
            const jours = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
            
            jours.forEach(jour => {
                disponibilitesParJour[jour] = clinique.disponibilites
                    .filter(d => d.jourSemaine === jour)
                    .map(d => ({
                        heureDebut: d.heureDebut,
                        heureFin: d.heureFin,
                        typeConsultation: d.typeConsultation,
                        medecin: `Dr ${d.medecin.user.prenom} ${d.medecin.user.nom}`
                    }));
            });

            console.log(`✅ Détails clinique récupérés: ${clinique.nom} avec ${medecinFormates.length} médecins par admin ${adminUser.prenom} ${adminUser.nom}`);

            // Réponse complète
            return ApiResponse.success(res, 'Détails de la clinique récupérés avec succès', {
                clinique: {
                    id: clinique.id,
                    nom: clinique.nom,
                    adresse: clinique.adresse,
                    ville: clinique.ville,
                    telephone: clinique.telephone,
                    email: clinique.email,
                    latitude: clinique.latitude,
                    longitude: clinique.longitude,
                    horaires: clinique.horaires,
                    services: clinique.services,
                    active: clinique.active,
                    createdAt: clinique.createdAt
                },
                medecinsAffilies: medecinFormates,
                disponibilites: {
                    parJour: disponibilitesParJour,
                    total: clinique.disponibilites.length
                },
                prochainsRendezVous: clinique.rendezVous.map(rdv => ({
                    id: rdv.id,
                    date: rdv.dateRendezVous,
                    statut: rdv.statut,
                    type: rdv.typeConsultation,
                    medecin: rdv.medecin ? `Dr ${rdv.medecin.user.prenom} ${rdv.medecin.user.nom}` : 'Non assigné',
                    patient: rdv.patient ? `${rdv.patient.user.prenom} ${rdv.patient.user.nom}` : 'Anonyme'
                })),
                statistiques: statistiquesGenerales,
                consultationInfo: {
                    consultedBy: `${adminUser.prenom} ${adminUser.nom}`,
                    consultedAt: new Date().toISOString(),
                    ip: clientIp
                },
                actions: {
                    modifierClinique: `PUT /v1/admin/cliniques/${cliniqueId}`,
                    associerMedecin: 'PUT /v1/admin/doctors/:medecinId/profile (cliniqueId)',
                    gererDisponibilites: 'Voir routes médecins individuelles'
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération détails clinique:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la récupération des détails de la clinique');
        }
    }
);

// GET /v1/admin/cliniques/:cliniqueId/medecins - Lister seulement les médecins d'une clinique
router.get('/:cliniqueId/medecins',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    async (req, res) => {
        try {
            const { cliniqueId } = req.params;
            const { statut, page = 1, limit = 20 } = req.query;
            const adminUser = req.user;

            console.log(`👨‍⚕️ Admin ${adminUser.prenom} ${adminUser.nom} liste les médecins de la clinique: ${cliniqueId}`);

            // Vérifier que la clinique existe
            const clinique = await prisma.clinique.findUnique({
                where: { id: cliniqueId },
                select: { id: true, nom: true, ville: true }
            });

            if (!clinique) {
                return ApiResponse.notFound(res, 'Clinique non trouvée', {
                    code: 'CLINIQUE_NOT_FOUND',
                    cliniqueId
                });
            }

            // Construire les conditions de filtrage
            const whereConditions = {
                cliniqueId: cliniqueId
            };

            if (statut && ['VALIDE', 'EN_ATTENTE', 'REJETE'].includes(statut)) {
                whereConditions.statutValidation = statut;
            }

            // Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);

            // Récupération des médecins
            const [medecins, totalCount] = await Promise.all([
                prisma.medecin.findMany({
                    where: whereConditions,
                    include: {
                        user: {
                            select: {
                                id: true,
                                nom: true,
                                prenom: true,
                                email: true,
                                telephone: true,
                                statut: true
                            }
                        }
                    },
                    orderBy: {
                        user: { nom: 'asc' }
                    },
                    skip,
                    take: parseInt(limit)
                }),
                prisma.medecin.count({ where: whereConditions })
            ]);

            const totalPages = Math.ceil(totalCount / parseInt(limit));
            const hasNextPage = parseInt(page) < totalPages;
            const hasPrevPage = parseInt(page) > 1;

            // Formatage des médecins
            const medecinsFormates = medecins.map(medecin => ({
                id: medecin.id,
                user: medecin.user,
                numeroOrdre: medecin.numeroOrdre,
                specialites: medecin.specialites,
                statutValidation: medecin.statutValidation,
                experienceAnnees: medecin.experienceAnnees,
                noteMoyenne: medecin.noteMoyenne,
                nombreEvaluations: medecin.nombreEvaluations,
                typesConsultationAcceptes: {
                    domicile: medecin.accepteDomicile,
                    teleconsultation: medecin.accepteTeleconsultation,
                    clinique: medecin.accepteclinique
                }
            }));

            return ApiResponse.success(res, 'Médecins de la clinique récupérés avec succès', {
                clinique: {
                    id: clinique.id,
                    nom: clinique.nom,
                    ville: clinique.ville
                },
                medecins: medecinsFormates,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalCount,
                    limit: parseInt(limit),
                    hasNextPage,
                    hasPrevPage,
                    itemsOnPage: medecins.length
                },
                filtres: {
                    statutFiltre: statut || 'TOUS',
                    filtresDisponibles: ['VALIDE', 'EN_ATTENTE', 'REJETE']
                },
                statistiques: {
                    totalMedecins: totalCount,
                    totalValides: await prisma.medecin.count({
                        where: { cliniqueId, statutValidation: 'VALIDE' }
                    }),
                    totalEnAttente: await prisma.medecin.count({
                        where: { cliniqueId, statutValidation: 'EN_ATTENTE' }
                    })
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération médecins clinique:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la récupération des médecins');
        }
    }
);

module.exports = router;