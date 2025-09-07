// routes/admin/doctors/profile.js
const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');
const bcrypt = require('bcrypt');

// Schéma de validation pour la mise à jour du profil médecin
const updateMedecinProfileSchema = {
    fields: {
        // Données utilisateur
        nom: {
            type: 'string',
            minLength: 2,
            maxLength: 100
        },
        prenom: {
            type: 'string', 
            minLength: 2,
            maxLength: 100
        },
        email: {
            type: 'email'
        },
        telephone: {
            type: 'phone'
        },
        password: {
            type: 'string',
            minLength: 8,
            maxLength: 100
        },
        // Données médecin
        numeroOrdre: {
            type: 'string',
            minLength: 5,
            maxLength: 50,
            pattern: '^[A-Z0-9]+$'
        },
        specialites: {
            type: 'array'
        },
        bio: {
            type: 'string',
            maxLength: 1000
        },
        experienceAnnees: {
            type: 'number',
            min: 0,
            max: 60
        },
        languesParlees: {
            type: 'array'
        },
        tarifConsultationBase: {
            type: 'number',
            min: 0
        },
        accepteDomicile: {
            type: 'boolean'
        },
        accepteTeleconsultation: {
            type: 'boolean'
        },
        accepteclinique: {
            type: 'boolean'
        },
        cliniqueId: {
            type: 'string'
        }
    },
    required: [], // Tous les champs sont optionnels pour une mise à jour partielle
    strict: true
};

// PUT /v1/admin/doctors/:medecinId/profile
router.put('/:medecinId/profile',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(updateMedecinProfileSchema),
    async (req, res) => {
        try {
            const { medecinId } = req.params;
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`✏️ Admin ${adminUser.prenom} ${adminUser.nom} met à jour le profil du médecin: ${medecinId}`);

            // Vérifier que le médecin existe
            const medecin = await prisma.medecin.findUnique({
                where: { id: medecinId },
                include: {
                    user: {
                        select: {
                            id: true,
                            nom: true,
                            prenom: true,
                            email: true,
                            telephone: true
                        }
                    }
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Médecin non trouvé', {
                    code: 'MEDECIN_NOT_FOUND',
                    medecinId
                });
            }

            // Séparer les données utilisateur des données médecin
            const {
                nom, prenom, email, telephone, password,
                numeroOrdre, specialites, bio, experienceAnnees,
                languesParlees, tarifConsultationBase,
                accepteDomicile, accepteTeleconsultation, accepteclinique,
                cliniqueId
            } = req.body;

            // Préparer les données de mise à jour
            const userUpdateData = {};
            const medecinUpdateData = {};

            // === VALIDATION ET PRÉPARATION DES DONNÉES USER ===
            if (nom) {
                userUpdateData.nom = nom.trim();
            }
            if (prenom) {
                userUpdateData.prenom = prenom.trim();
            }
            if (email) {
                const cleanEmail = email.toLowerCase().trim();
                // Vérifier l'unicité de l'email si changé
                if (cleanEmail !== medecin.user.email) {
                    const existingUser = await prisma.user.findUnique({
                        where: { email: cleanEmail }
                    });
                    if (existingUser) {
                        return ApiResponse.badRequest(res, 'Adresse email déjà utilisée', {
                            code: 'EMAIL_ALREADY_EXISTS',
                            field: 'email'
                        });
                    }
                }
                userUpdateData.email = cleanEmail;
            }
            if (telephone) {
                const cleanPhone = telephone.replace(/[^0-9]/g, '');
                // Vérifier l'unicité du téléphone si changé
                if (cleanPhone !== medecin.user.telephone) {
                    const existingUser = await prisma.user.findUnique({
                        where: { telephone: cleanPhone }
                    });
                    if (existingUser) {
                        return ApiResponse.badRequest(res, 'Numéro de téléphone déjà utilisé', {
                            code: 'PHONE_ALREADY_EXISTS',
                            field: 'telephone'
                        });
                    }
                }
                userUpdateData.telephone = cleanPhone;
            }
            if (password) {
                userUpdateData.password = await bcrypt.hash(password, 12);
            }

            // === VALIDATION ET PRÉPARATION DES DONNÉES MEDECIN ===
            if (numeroOrdre) {
                const cleanNumeroOrdre = numeroOrdre.toUpperCase().trim();
                // Vérifier l'unicité du numéro d'ordre si changé
                if (cleanNumeroOrdre !== medecin.numeroOrdre) {
                    const existingMedecin = await prisma.medecin.findUnique({
                        where: { numeroOrdre: cleanNumeroOrdre }
                    });
                    if (existingMedecin) {
                        return ApiResponse.badRequest(res, 'Numéro d\'ordre déjà utilisé', {
                            code: 'ORDRE_NUMBER_EXISTS',
                            field: 'numeroOrdre'
                        });
                    }
                }
                medecinUpdateData.numeroOrdre = cleanNumeroOrdre;
            }

            if (specialites !== undefined) {
                // Validation des spécialités
                if (!Array.isArray(specialites) || specialites.length === 0) {
                    return ApiResponse.badRequest(res, 'Au moins une spécialité est requise', {
                        code: 'SPECIALITES_REQUIRED',
                        field: 'specialites'
                    });
                }

                // Spécialités autorisées (même liste que lors de l'inscription)
                const specialitesAutorisees = [
                    'MEDECINE_GENERALE', 'CARDIOLOGIE', 'DERMATOLOGIE', 'PEDIATRIE',
                    'GYNECOLOGIE', 'NEUROLOGIE', 'PSYCHIATRIE', 'CHIRURGIE_GENERALE',
                    'OPHTALMOLOGIE', 'ORL', 'RADIOLOGIE', 'ANESTHESIE', 'URGENCES',
                    'MEDECINE_INTERNE', 'ENDOCRINOLOGIE', 'RHUMATOLOGIE',
                    'GASTROENTEROLOGIE', 'PNEUMOLOGIE', 'NEPHROLOGIE', 'ONCOLOGIE'
                ];

                const specialitesInvalides = specialites.filter(spec => !specialitesAutorisees.includes(spec));
                if (specialitesInvalides.length > 0) {
                    return ApiResponse.badRequest(res, 'Spécialités non reconnues', {
                        code: 'INVALID_SPECIALITES',
                        message: `Les spécialités suivantes ne sont pas reconnues: ${specialitesInvalides.join(', ')}`,
                        field: 'specialites',
                        specialitesAutorisees
                    });
                }

                medecinUpdateData.specialites = specialites;
            }

            if (bio !== undefined) {
                medecinUpdateData.bio = bio ? bio.trim() : null;
            }

            if (experienceAnnees !== undefined) {
                if (experienceAnnees !== null && (experienceAnnees < 0 || experienceAnnees > 60)) {
                    return ApiResponse.badRequest(res, 'Années d\'expérience invalides', {
                        code: 'INVALID_EXPERIENCE',
                        message: 'L\'expérience doit être comprise entre 0 et 60 ans.',
                        field: 'experienceAnnees'
                    });
                }
                medecinUpdateData.experienceAnnees = experienceAnnees;
            }

            if (languesParlees !== undefined) {
                medecinUpdateData.languesParlees = languesParlees;
            }

            if (tarifConsultationBase !== undefined) {
                if (tarifConsultationBase !== null && tarifConsultationBase < 0) {
                    return ApiResponse.badRequest(res, 'Tarif de consultation invalide', {
                        code: 'INVALID_TARIF',
                        field: 'tarifConsultationBase'
                    });
                }
                medecinUpdateData.tarifConsultationBase = tarifConsultationBase;
            }

            if (accepteDomicile !== undefined) {
                medecinUpdateData.accepteDomicile = accepteDomicile;
            }
            if (accepteTeleconsultation !== undefined) {
                medecinUpdateData.accepteTeleconsultation = accepteTeleconsultation;
            }
            if (accepteclinique !== undefined) {
                medecinUpdateData.accepteclinique = accepteclinique;
            }

            if (cliniqueId !== undefined) {
                if (cliniqueId) {
                    // Vérifier que la clinique existe
                    const clinique = await prisma.clinique.findUnique({
                        where: { id: cliniqueId }
                    });
                    if (!clinique) {
                        return ApiResponse.badRequest(res, 'Clinique non trouvée', {
                            code: 'CLINIQUE_NOT_FOUND',
                            field: 'cliniqueId'
                        });
                    }
                }
                medecinUpdateData.cliniqueId = cliniqueId;
            }

            // === MISE À JOUR EN TRANSACTION ===
            const result = await prisma.$transaction(async (tx) => {
                let updatedUser = medecin.user;
                let updatedMedecin = medecin;

                // Mettre à jour l'utilisateur si nécessaire
                if (Object.keys(userUpdateData).length > 0) {
                    updatedUser = await tx.user.update({
                        where: { id: medecin.user.id },
                        data: userUpdateData
                    });
                }

                // Mettre à jour le médecin si nécessaire
                if (Object.keys(medecinUpdateData).length > 0) {
                    updatedMedecin = await tx.medecin.update({
                        where: { id: medecinId },
                        data: medecinUpdateData,
                        include: {
                            user: true,
                            clinique: {
                                select: {
                                    id: true,
                                    nom: true,
                                    ville: true
                                }
                            }
                        }
                    });
                }

                return { user: updatedUser, medecin: updatedMedecin };
            });

            console.log(`✅ Profil médecin mis à jour avec succès: Dr ${result.medecin.user.prenom} ${result.medecin.user.nom} par admin ${adminUser.prenom} ${adminUser.nom}`);

            // === RÉPONSE ===
            return ApiResponse.success(res, 'Profil médecin mis à jour avec succès', {
                medecin: {
                    id: result.medecin.id,
                    user: {
                        id: result.medecin.user.id,
                        nom: result.medecin.user.nom,
                        prenom: result.medecin.user.prenom,
                        email: result.medecin.user.email,
                        telephone: result.medecin.user.telephone,
                        role: result.medecin.user.role,
                        statut: result.medecin.user.statut
                    },
                    numeroOrdre: result.medecin.numeroOrdre,
                    specialites: result.medecin.specialites,
                    statutValidation: result.medecin.statutValidation,
                    bio: result.medecin.bio,
                    experienceAnnees: result.medecin.experienceAnnees,
                    languesParlees: result.medecin.languesParlees,
                    tarifConsultationBase: result.medecin.tarifConsultationBase,
                    accepteDomicile: result.medecin.accepteDomicile,
                    accepteTeleconsultation: result.medecin.accepteTeleconsultation,
                    accepteclinique: result.medecin.accepteclinique,
                    noteMoyenne: result.medecin.noteMoyenne,
                    nombreEvaluations: result.medecin.nombreEvaluations,
                    clinique: result.medecin.clinique
                },
                updateInfo: {
                    fieldsUpdated: [
                        ...Object.keys(userUpdateData).map(key => `user.${key}`),
                        ...Object.keys(medecinUpdateData).map(key => `medecin.${key}`)
                    ],
                    updatedBy: `${adminUser.prenom} ${adminUser.nom}`,
                    updatedAt: new Date().toISOString(),
                    ip: clientIp
                }
            });

        } catch (error) {
            console.error('❌ Erreur mise à jour profil médecin:', error);

            // Gestion des erreurs Prisma spécifiques
            if (error.code === 'P2002') {
                const target = error.meta?.target;
                if (target?.includes('email')) {
                    return ApiResponse.badRequest(res, 'Adresse email déjà utilisée', {
                        code: 'EMAIL_ALREADY_EXISTS',
                        field: 'email'
                    });
                }
                if (target?.includes('telephone')) {
                    return ApiResponse.badRequest(res, 'Numéro de téléphone déjà utilisé', {
                        code: 'PHONE_ALREADY_EXISTS',
                        field: 'telephone'
                    });
                }
                if (target?.includes('numeroOrdre')) {
                    return ApiResponse.badRequest(res, 'Numéro d\'ordre déjà utilisé', {
                        code: 'ORDRE_NUMBER_EXISTS',
                        field: 'numeroOrdre'
                    });
                }
            }

            return ApiResponse.serverError(res, 'Erreur interne lors de la mise à jour du profil médecin');
        }
    }
);

module.exports = router;