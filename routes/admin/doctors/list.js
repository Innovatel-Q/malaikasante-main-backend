const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');

// Schéma de validation pour la liste des médecins
const doctorsListSchema = {
    fields: {
        page: { type: 'number', min: 1 },
        limit: { type: 'number', min: 1, max: 100 },
        statutValidation: { type: 'string', enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'] },
        specialite: { type: 'string' },
        statut: { type: 'string', enum: ['ACTIF', 'SUSPENDU', 'INACTIF'] },
        search: { type: 'string' }
    },
    required: [],
    strict: false
};

router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(doctorsListSchema),
    async (req, res) => {
        try {
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            // Filtres optionnels
            const { statutValidation, specialite, statut, search } = req.query;

            console.log(`🔍 Admin ${adminUser.prenom} ${adminUser.nom} consulte la liste des médecins - Page: ${page}, Limite: ${limit}`);

            // Construction des conditions de recherche
            const whereConditions = {};

            if (statutValidation) {
                whereConditions.statutValidation = statutValidation;
            }

            if (specialite) {
                whereConditions.specialites = {
                    has: specialite
                };
            }

            if (statut || search) {
                whereConditions.user = {};
                
                if (statut) {
                    whereConditions.user.statut = statut;
                }

                if (search) {
                    whereConditions.user.OR = [
                        { nom: { contains: search, mode: 'insensitive' } },
                        { prenom: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { telephone: { contains: search } }
                    ];
                }
            }

            // Récupération des médecins avec pagination
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
                                createdAt: true,
                                statut: true
                            }
                        },
                        _count: {
                            select: {
                                rendezVous: true,
                                disponibilites: true,
                                ordonnances: true
                            }
                        }
                    },
                    orderBy: [
                        { statutValidation: 'asc' }, // EN_ATTENTE d'abord
                        { user: { createdAt: 'desc' } }
                    ],
                    skip,
                    take: limit
                }),
                prisma.medecin.count({
                    where: whereConditions
                })
            ]);

            const totalPages = Math.ceil(totalCount / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            // Formatage des données
            const formattedMedecins = medecins.map(medecin => {
                const timeElapsed = Math.floor((new Date() - new Date(medecin.user.createdAt)) / (1000 * 60 * 60 * 24));
                
                return {
                    id: medecin.id,
                    userId: medecin.user.id,
                    informationsPersonnelles: {
                        nom: medecin.user.nom,
                        prenom: medecin.user.prenom,
                        email: medecin.user.email,
                        telephone: medecin.user.telephone
                    },
                    informationsProfessionnelles: {
                        numeroOrdre: medecin.numeroOrdre,
                        specialites: medecin.specialites || [],
                        experienceAnnees: medecin.experienceAnnees || 0,
                        bio: medecin.bio,
                        tarifConsultationBase: medecin.tarifConsultationBase || 0
                    },
                    servicesOfferts: {
                        accepteDomicile: medecin.accepteDomicile,
                        accepteTeleconsultation: medecin.accepteTeleconsultation,
                        accepteclinique: medecin.accepteclinique
                    },
                    statutValidation: {
                        statut: medecin.statutValidation,
                        dateValidation: medecin.dateValidation,
                        motifRejet: medecin.motifRejet
                    },
                    activite: {
                        statutCompte: medecin.user.statut,
                        dateInscription: medecin.user.createdAt,
                        joursDepuisInscription: timeElapsed,
                        nombreRendezVous: medecin._count.rendezVous,
                        nombreDisponibilites: medecin._count.disponibilites,
                        nombreOrdonnances: medecin._count.ordonnances
                    }
                };
            });

            // Statistiques générales
            const statsGenerales = await prisma.medecin.groupBy({
                by: ['statutValidation'],
                _count: true
            });

            const stats = {
                total: totalCount,
                enAttente: statsGenerales.find(s => s.statutValidation === 'EN_ATTENTE')?._count || 0,
                valides: statsGenerales.find(s => s.statutValidation === 'VALIDE')?._count || 0,
                rejetes: statsGenerales.find(s => s.statutValidation === 'REJETE')?._count || 0
            };

            console.log(`✅ ${medecins.length} médecins récupérés par admin: ${adminUser.prenom} ${adminUser.nom}`);

            return ApiResponse.success(res, 'Liste des médecins récupérée avec succès', {
                medecins: formattedMedecins,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    limit,
                    hasNextPage,
                    hasPrevPage,
                    itemsOnPage: medecins.length
                },
                statistiques: stats,
                filtres: {
                    statutValidation,
                    specialite,
                    statut,
                    search
                },
                actions: {
                    validateEndpoint: 'PUT /v1/admin/doctors/{id}/validate',
                    profileEndpoint: 'GET /v1/admin/doctors/{id}/profile',
                    documentsEndpoint: 'GET /v1/admin/doctors/{id}/documents'
                },
                adminInfo: {
                    consultePar: `${adminUser.prenom} ${adminUser.nom}`,
                    consulteA: new Date().toISOString(),
                    ip: clientIp
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération liste médecins:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la récupération de la liste des médecins');
        }
    }
);

module.exports = router;