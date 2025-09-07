// routes/admin/cliniques/list.js
const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');

// Schéma de validation pour les paramètres de liste (optionnels)
const listCliniquesSchema = {
    fields: {
        page: {
            type: 'number',
            min: 1
        },
        limit: {
            type: 'number',
            min: 1,
            max: 100
        },
        ville: {
            type: 'string',
            minLength: 2,
            maxLength: 100
        },
        active: {
            type: 'boolean'
        },
        search: {
            type: 'string',
            minLength: 2,
            maxLength: 200
        }
    },
    required: [],
    strict: false
};

// GET /v1/admin/cliniques - Récupérer la liste des cliniques (données essentielles)
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(listCliniquesSchema),
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                ville,
                active,
                search
            } = req.query;

            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🏥 Admin ${adminUser.prenom} ${adminUser.nom} récupère la liste des cliniques`);

            // Construction des conditions de filtrage
            const whereConditions = {};

            // Filtre par ville
            if (ville) {
                whereConditions.ville = {
                    contains: ville.trim(),
                    mode: 'insensitive'
                };
            }

            // Filtre par statut actif/inactif
            if (active !== undefined) {
                whereConditions.active = active === 'true';
            }

            // Recherche textuelle dans nom ou adresse
            if (search) {
                whereConditions.OR = [
                    {
                        nom: {
                            contains: search.trim(),
                            mode: 'insensitive'
                        }
                    },
                    {
                        adresse: {
                            contains: search.trim(),
                            mode: 'insensitive'
                        }
                    }
                ];
            }

            // Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const take = parseInt(limit);

            // Récupération des cliniques avec comptage des médecins
            const [cliniques, totalCount] = await Promise.all([
                prisma.clinique.findMany({
                    where: whereConditions,
                    select: {
                        id: true,
                        nom: true,
                        adresse: true,
                        ville: true,
                        telephone: true,
                        email: true,
                        active: true,
                        services: true,
                        createdAt: true,
                        _count: {
                            select: {
                                medecins: {
                                    where: {
                                        statutValidation: 'VALIDE'
                                    }
                                }
                            }
                        }
                    },
                    orderBy: [
                        { active: 'desc' }, // Actives en premier
                        { nom: 'asc' }      // Puis par ordre alphabétique
                    ],
                    skip,
                    take
                }),
                prisma.clinique.count({ where: whereConditions })
            ]);

            // Pagination info
            const totalPages = Math.ceil(totalCount / take);
            const hasNextPage = parseInt(page) < totalPages;
            const hasPrevPage = parseInt(page) > 1;

            // Formatage des données essentielles
            const cliniquesFormattees = cliniques.map(clinique => ({
                id: clinique.id,
                nom: clinique.nom,
                adresse: clinique.adresse,
                ville: clinique.ville,
                telephone: clinique.telephone,
                email: clinique.email,
                active: clinique.active,
                nombreServices: Array.isArray(clinique.services) ? clinique.services.length : 0,
                nombreMedecinsValides: clinique._count.medecins,
                dateCreation: clinique.createdAt,
                statut: clinique.active ? 'ACTIVE' : 'INACTIVE'
            }));

            // Statistiques rapides
            const statistiques = {
                totalCliniques: totalCount,
                cliniquesActives: cliniques.filter(c => c.active).length,
                cliniquesInactives: cliniques.filter(c => !c.active).length,
                totalMedecinsAffilies: cliniques.reduce((sum, c) => sum + c._count.medecins, 0),
                villesRepresentees: [...new Set(cliniques.map(c => c.ville))].length
            };

            console.log(`✅ Liste de ${cliniques.length} cliniques récupérée par admin ${adminUser.prenom} ${adminUser.nom}`);

            return ApiResponse.success(res, 'Liste des cliniques récupérée avec succès', {
                cliniques: cliniquesFormattees,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalCount,
                    limit: take,
                    hasNextPage,
                    hasPrevPage,
                    itemsOnPage: cliniques.length
                },
                filtres: {
                    ville: ville || null,
                    active: active !== undefined ? (active === 'true') : null,
                    search: search || null,
                    filtresAppliques: [
                        ville && `Ville: ${ville}`,
                        active !== undefined && `Statut: ${active === 'true' ? 'Actives' : 'Inactives'}`,
                        search && `Recherche: ${search}`
                    ].filter(Boolean)
                },
                statistiques,
                actions: {
                    voirDetails: 'GET /v1/admin/cliniques/{id}',
                    creerClinique: 'POST /v1/admin/cliniques',
                    modifierClinique: 'PUT /v1/admin/cliniques/{id}'
                },
                requestInfo: {
                    requestedBy: `${adminUser.prenom} ${adminUser.nom}`,
                    requestedAt: new Date().toISOString(),
                    ip: clientIp
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération liste cliniques:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la récupération de la liste des cliniques');
        }
    }
);

module.exports = router;