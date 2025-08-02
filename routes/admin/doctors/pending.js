const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');

// Schéma de validation simplifié
const doctorsPendingSchema = {
    fields: {
        page: { type: 'number', min: 1 },
        limit: { type: 'number', min: 1, max: 100 }
    },
    required: [],
    strict: false
};

router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(doctorsPendingSchema),
    async (req, res) => {
        try {
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            console.log(`🔍 Admin ${adminUser.prenom} ${adminUser.nom} consulte les médecins en attente - Page: ${page}, Limite: ${limit}`);

            // ✅ Récupérer uniquement les médecins EN_ATTENTE
            const whereConditions = {
                statutValidation: 'EN_ATTENTE'
            };

            // ✅ Récupération simple avec tri par date d'inscription (plus récent en premier)
            const [medecinsEnAttente, totalCount] = await Promise.all([
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
                        }
                    },
                    orderBy: {
                        user: { createdAt: 'desc' }
                    },
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

            // ✅ Formatage simple
            const formattedMedecins = medecinsEnAttente.map(medecin => {
                const timeElapsed = Math.floor((new Date() - new Date(medecin.user.createdAt)) / (1000 * 60 * 60));
                const isUrgent = timeElapsed > 48;

                return {
                    id: medecin.id,
                    userId: medecin.user.id,
                    medecinInfo: {
                        nom: medecin.user.nom,
                        prenom: medecin.user.prenom,
                        email: medecin.user.email,
                        telephone: medecin.user.telephone,
                        numeroOrdre: medecin.numeroOrdre,
                        specialites: medecin.specialites || [],
                        experienceAnnees: medecin.experienceAnnees || 0,
                        bio: medecin.bio,
                        accepteDomicile: medecin.accepteDomicile,
                        accepteTeleconsultation: medecin.accepteTeleconsultation,
                        accepteclinique: medecin.accepteclinique
                    },
                    validationDetails: {
                        statutValidation: medecin.statutValidation,
                        dateInscription: medecin.user.createdAt,
                        timeElapsed: `${timeElapsed}h`,
                        isUrgent,
                        priority: isUrgent ? 'HAUTE' : 'NORMALE'
                    },
                    accountStatus: {
                        statut: medecin.user.statut,
                        isActive: medecin.user.statut === 'ACTIF',
                        hasTokens: false,
                        canLogin: false
                    }
                };
            });

            console.log(`✅ ${medecinsEnAttente.length} médecins en attente récupérés par admin: ${adminUser.prenom} ${adminUser.nom}`);

            return ApiResponse.success(res, 'Médecins en attente récupérés avec succès', {
                medecins: formattedMedecins,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    limit,
                    hasNextPage,
                    hasPrevPage,
                    itemsOnPage: medecinsEnAttente.length
                },
                statistics: {
                    totalEnAttente: totalCount
                },
                actions: {
                    validateEndpoint: 'PUT /v1/admin/doctors/{id}/validate'
                },
                adminInfo: {
                    reviewedBy: `${adminUser.prenom} ${adminUser.nom}`,
                    reviewedAt: new Date().toISOString(),
                    ip: clientIp
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération médecins en attente:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la récupération des médecins en attente');
        }
    }
);

module.exports = router;