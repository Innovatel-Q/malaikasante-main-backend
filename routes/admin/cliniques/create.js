// routes/admin/cliniques/create.js
const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');

// Schéma de validation pour la création d'une clinique
const createCliniqueSchema = {
    fields: {
        nom: {
            type: 'string',
            minLength: 3,
            maxLength: 200
        },
        adresse: {
            type: 'string',
            minLength: 10,
            maxLength: 1000
        },
        ville: {
            type: 'string',
            minLength: 2,
            maxLength: 100
        },
        telephone: {
            type: 'phone'
        },
        email: {
            type: 'email'
        },
        latitude: {
            type: 'number',
            min: -90,
            max: 90
        },
        longitude: {
            type: 'number',
            min: -180,
            max: 180
        },
        horaires: {
            type: 'object'
        },
        services: {
            type: 'array'
        }
    },
    required: ['nom', 'adresse'],
    strict: true
};

// POST /v1/admin/cliniques - Créer une nouvelle clinique
router.post('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(createCliniqueSchema),
    async (req, res) => {
        try {
            const {
                nom,
                adresse,
                ville = 'Abidjan',
                telephone,
                email,
                latitude,
                longitude,
                horaires,
                services
            } = req.body;
            
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🏥 Admin ${adminUser.prenom} ${adminUser.nom} crée une nouvelle clinique: ${nom}`);

            // Vérifier l'unicité du nom dans la même ville
            const existingClinique = await prisma.clinique.findFirst({
                where: {
                    nom: nom.trim(),
                    ville: ville.trim(),
                    active: true
                }
            });

            if (existingClinique) {
                return ApiResponse.badRequest(res, 'Une clinique avec ce nom existe déjà dans cette ville', {
                    code: 'CLINIQUE_NAME_EXISTS',
                    field: 'nom',
                    conflict: {
                        nom: existingClinique.nom,
                        ville: existingClinique.ville
                    }
                });
            }

            // Vérifier l'unicité de l'email si fourni
            if (email) {
                const existingEmail = await prisma.clinique.findFirst({
                    where: {
                        email: email.toLowerCase().trim(),
                        active: true
                    }
                });

                if (existingEmail) {
                    return ApiResponse.badRequest(res, 'Cette adresse email est déjà utilisée', {
                        code: 'EMAIL_ALREADY_EXISTS',
                        field: 'email'
                    });
                }
            }

            // Validation des horaires si fourni
            if (horaires) {
                const joursValides = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
                const horaireKeys = Object.keys(horaires);
                
                for (const jour of horaireKeys) {
                    if (!joursValides.includes(jour)) {
                        return ApiResponse.badRequest(res, 'Jour invalide dans les horaires', {
                            code: 'INVALID_DAY',
                            field: 'horaires',
                            invalidDay: jour,
                            validDays: joursValides
                        });
                    }

                    const horaireJour = horaires[jour];
                    if (horaireJour && (!horaireJour.ouverture || !horaireJour.fermeture)) {
                        return ApiResponse.badRequest(res, `Horaires incomplets pour ${jour}`, {
                            code: 'INCOMPLETE_HOURS',
                            field: 'horaires',
                            day: jour,
                            required: ['ouverture', 'fermeture']
                        });
                    }
                }
            }

            // Validation des services si fourni
            const servicesAutorise = [
                'CONSULTATION_GENERALE',
                'URGENCES',
                'CHIRURGIE',
                'MATERNITE',
                'PEDIATRIE',
                'CARDIOLOGIE',
                'RADIOLOGIE',
                'LABORATOIRE',
                'PHARMACIE',
                'DENTAIRE',
                'OPHTALMOLOGIE',
                'DERMATOLOGIE',
                'GYNECOLOGIE',
                'PSYCHIATRIE',
                'KINESITHERAPIE',
                'DIALYSE',
                'ONCOLOGIE'
            ];

            if (services) {
                if (!Array.isArray(services)) {
                    return ApiResponse.badRequest(res, 'Les services doivent être un tableau', {
                        code: 'SERVICES_MUST_BE_ARRAY',
                        field: 'services'
                    });
                }

                const servicesInvalides = services.filter(service => !servicesAutorise.includes(service));
                if (servicesInvalides.length > 0) {
                    return ApiResponse.badRequest(res, 'Services non reconnus', {
                        code: 'INVALID_SERVICES',
                        field: 'services',
                        invalidServices: servicesInvalides,
                        availableServices: servicesAutorise
                    });
                }
            }

            // Validation des coordonnées GPS
            if ((latitude && !longitude) || (!latitude && longitude)) {
                return ApiResponse.badRequest(res, 'Latitude et longitude doivent être fournies ensemble', {
                    code: 'INCOMPLETE_GPS_COORDINATES',
                    message: 'Si vous fournissez des coordonnées GPS, latitude ET longitude sont requises'
                });
            }

            // Création de la clinique
            const nouvelleClinique = await prisma.clinique.create({
                data: {
                    nom: nom.trim(),
                    adresse: adresse.trim(),
                    ville: ville.trim(),
                    telephone: telephone ? telephone.replace(/[^0-9+]/g, '') : null,
                    email: email ? email.toLowerCase().trim() : null,
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    horaires: horaires || null,
                    services: services || null,
                    active: true
                }
            });

            console.log(`✅ Clinique créée avec succès: ${nouvelleClinique.nom} (ID: ${nouvelleClinique.id}) par admin ${adminUser.prenom} ${adminUser.nom}`);

            // Réponse de succès
            return ApiResponse.created(res, 'Clinique créée avec succès', {
                clinique: {
                    id: nouvelleClinique.id,
                    nom: nouvelleClinique.nom,
                    adresse: nouvelleClinique.adresse,
                    ville: nouvelleClinique.ville,
                    telephone: nouvelleClinique.telephone,
                    email: nouvelleClinique.email,
                    latitude: nouvelleClinique.latitude,
                    longitude: nouvelleClinique.longitude,
                    horaires: nouvelleClinique.horaires,
                    services: nouvelleClinique.services,
                    active: nouvelleClinique.active,
                    createdAt: nouvelleClinique.createdAt
                },
                creationInfo: {
                    createdBy: `${adminUser.prenom} ${adminUser.nom}`,
                    createdAt: nouvelleClinique.createdAt,
                    ip: clientIp
                },
                nextSteps: [
                    'La clinique est maintenant active et visible',
                    'Les médecins peuvent maintenant s\'y associer',
                    'Vous pouvez modifier les informations via PUT /admin/cliniques/:id',
                    'Ajoutez des médecins via leur profil individuel'
                ],
                statistics: {
                    totalCliniques: await prisma.clinique.count({ where: { active: true } }),
                    nouvelleCliqueAjoutee: true
                }
            });

        } catch (error) {
            console.error('❌ Erreur création clinique:', error);

            // Gestion des erreurs Prisma spécifiques
            if (error.code === 'P2002') {
                const target = error.meta?.target;
                if (target?.includes('nom')) {
                    return ApiResponse.badRequest(res, 'Nom de clinique déjà utilisé', {
                        code: 'NAME_ALREADY_EXISTS',
                        field: 'nom'
                    });
                }
                if (target?.includes('email')) {
                    return ApiResponse.badRequest(res, 'Adresse email déjà utilisée', {
                        code: 'EMAIL_ALREADY_EXISTS',
                        field: 'email'
                    });
                }
            }

            return ApiResponse.serverError(res, 'Erreur interne lors de la création de la clinique');
        }
    }
);

module.exports = router;