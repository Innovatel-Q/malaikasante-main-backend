// routes/admin/cliniques/update.js
const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');

// Schéma de validation pour la modification d'une clinique
const updateCliniqueSchema = {
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
        },
        active: {
            type: 'boolean'
        }
    },
    required: [], // Tous les champs sont optionnels pour une mise à jour partielle
    strict: true
};

// PUT /v1/admin/cliniques/:cliniqueId - Modifier les données d'une clinique
router.put('/:cliniqueId',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(updateCliniqueSchema),
    async (req, res) => {
        try {
            const { cliniqueId } = req.params;
            const {
                nom,
                adresse,
                ville,
                telephone,
                email,
                latitude,
                longitude,
                horaires,
                services,
                active
            } = req.body;
            
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🏥 Admin ${adminUser.prenom} ${adminUser.nom} modifie la clinique: ${cliniqueId}`);

            // Vérifier que la clinique existe
            const cliniqueExistante = await prisma.clinique.findUnique({
                where: { id: cliniqueId }
            });

            if (!cliniqueExistante) {
                return ApiResponse.notFound(res, 'Clinique non trouvée', {
                    code: 'CLINIQUE_NOT_FOUND',
                    cliniqueId
                });
            }

            // Préparer les données de mise à jour
            const updateData = {};

            // Validation et préparation des champs
            if (nom) {
                // Vérifier l'unicité du nom dans la ville (si nom ou ville changent)
                const nomVille = ville || cliniqueExistante.ville;
                if (nom !== cliniqueExistante.nom || nomVille !== cliniqueExistante.ville) {
                    const conflictClinique = await prisma.clinique.findFirst({
                        where: {
                            nom: nom.trim(),
                            ville: nomVille.trim(),
                            active: true,
                            id: { not: cliniqueId } // Exclure la clinique actuelle
                        }
                    });

                    if (conflictClinique) {
                        return ApiResponse.badRequest(res, 'Une clinique avec ce nom existe déjà dans cette ville', {
                            code: 'CLINIQUE_NAME_EXISTS',
                            field: 'nom',
                            conflict: {
                                nom: conflictClinique.nom,
                                ville: conflictClinique.ville
                            }
                        });
                    }
                }
                updateData.nom = nom.trim();
            }

            if (adresse) {
                updateData.adresse = adresse.trim();
            }

            if (ville) {
                updateData.ville = ville.trim();
            }

            if (telephone !== undefined) {
                updateData.telephone = telephone ? telephone.replace(/[^0-9+]/g, '') : null;
            }

            if (email !== undefined) {
                if (email) {
                    // Vérifier l'unicité de l'email si changé
                    const cleanEmail = email.toLowerCase().trim();
                    if (cleanEmail !== cliniqueExistante.email) {
                        const existingEmail = await prisma.clinique.findFirst({
                            where: {
                                email: cleanEmail,
                                active: true,
                                id: { not: cliniqueId }
                            }
                        });

                        if (existingEmail) {
                            return ApiResponse.badRequest(res, 'Cette adresse email est déjà utilisée', {
                                code: 'EMAIL_ALREADY_EXISTS',
                                field: 'email'
                            });
                        }
                    }
                    updateData.email = cleanEmail;
                } else {
                    updateData.email = null;
                }
            }

            // Validation des coordonnées GPS
            if (latitude !== undefined || longitude !== undefined) {
                const newLatitude = latitude !== undefined ? latitude : cliniqueExistante.latitude;
                const newLongitude = longitude !== undefined ? longitude : cliniqueExistante.longitude;

                if ((newLatitude && !newLongitude) || (!newLatitude && newLongitude)) {
                    return ApiResponse.badRequest(res, 'Latitude et longitude doivent être fournies ensemble', {
                        code: 'INCOMPLETE_GPS_COORDINATES',
                        message: 'Si vous modifiez les coordonnées GPS, latitude ET longitude sont requises'
                    });
                }

                if (latitude !== undefined) {
                    updateData.latitude = latitude ? parseFloat(latitude) : null;
                }
                if (longitude !== undefined) {
                    updateData.longitude = longitude ? parseFloat(longitude) : null;
                }
            }

            // Validation des horaires si fourni
            if (horaires !== undefined) {
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
                updateData.horaires = horaires;
            }

            // Validation des services si fourni
            if (services !== undefined) {
                if (services) {
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
                updateData.services = services;
            }

            if (active !== undefined) {
                updateData.active = active;
                
                // Si on désactive la clinique, vérifier l'impact sur les médecins
                if (!active) {
                    const medecinsAffilies = await prisma.medecin.count({
                        where: { cliniqueId: cliniqueId }
                    });

                    if (medecinsAffilies > 0) {
                        console.log(`⚠️ Désactivation clinique avec ${medecinsAffilies} médecins affiliés`);
                        // On informe mais on n'empêche pas la désactivation
                    }
                }
            }

            // Si aucune modification n'est demandée
            if (Object.keys(updateData).length === 0) {
                return ApiResponse.badRequest(res, 'Aucune modification fournie', {
                    code: 'NO_UPDATE_DATA',
                    message: 'Veuillez fournir au moins un champ à modifier'
                });
            }

            // Mise à jour de la clinique
            const cliniqueModifiee = await prisma.clinique.update({
                where: { id: cliniqueId },
                data: updateData,
                include: {
                    medecins: {
                        select: {
                            id: true,
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

            // Compter les statistiques après modification
            const statistiques = {
                totalMedecinsAffilies: cliniqueModifiee.medecins.length,
                totalCliniquesActives: await prisma.clinique.count({ where: { active: true } }),
                cliniqueActive: cliniqueModifiee.active
            };

            console.log(`✅ Clinique modifiée avec succès: ${cliniqueModifiee.nom} (ID: ${cliniqueModifiee.id}) par admin ${adminUser.prenom} ${adminUser.nom}`);

            // Réponse de succès
            return ApiResponse.success(res, 'Clinique modifiée avec succès', {
                clinique: {
                    id: cliniqueModifiee.id,
                    nom: cliniqueModifiee.nom,
                    adresse: cliniqueModifiee.adresse,
                    ville: cliniqueModifiee.ville,
                    telephone: cliniqueModifiee.telephone,
                    email: cliniqueModifiee.email,
                    latitude: cliniqueModifiee.latitude,
                    longitude: cliniqueModifiee.longitude,
                    horaires: cliniqueModifiee.horaires,
                    services: cliniqueModifiee.services,
                    active: cliniqueModifiee.active,
                    createdAt: cliniqueModifiee.createdAt
                },
                medecinsAffilies: cliniqueModifiee.medecins.map(m => ({
                    id: m.id,
                    nom: `Dr ${m.user.prenom} ${m.user.nom}`
                })),
                updateInfo: {
                    fieldsUpdated: Object.keys(updateData),
                    updatedBy: `${adminUser.prenom} ${adminUser.nom}`,
                    updatedAt: new Date().toISOString(),
                    ip: clientIp,
                    previousActive: cliniqueExistante.active,
                    currentActive: cliniqueModifiee.active
                },
                statistiques,
                avertissements: active === false && statistiques.totalMedecinsAffilies > 0 ? [
                    `⚠️ Cette clinique a ${statistiques.totalMedecinsAffilies} médecin(s) affilié(s)`,
                    'La désactivation peut affecter leur visibilité',
                    'Considérez informer les médecins concernés'
                ] : [],
                actions: {
                    voirDetails: `GET /v1/admin/cliniques/${cliniqueId}`,
                    gererMedecins: `GET /v1/admin/cliniques/${cliniqueId}/medecins`
                }
            });

        } catch (error) {
            console.error('❌ Erreur modification clinique:', error);

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

            return ApiResponse.serverError(res, 'Erreur interne lors de la modification de la clinique');
        }
    }
);

module.exports = router;