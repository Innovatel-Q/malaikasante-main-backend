const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation
const updateProfileSchema = {
    fields: {
        // Champs User
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
        canalCommunicationPrefere: {
            type: 'string',
            enum: ['SMS', 'EMAIL']
        },
        // Champs Patient
        dateNaissance: {
            type: 'date'
        },
        sexe: {
            type: 'string',
            enum: ['M', 'F', 'AUTRE']
        },
        adresse: {
            type: 'string',
            maxLength: 500
        },
        ville: {
            type: 'string',
            maxLength: 100
        },
        codePostal: {
            type: 'string',
            maxLength: 10
        },
        groupeSanguin: {
            type: 'string',
            enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
        },
        poids: {
            type: 'number',
            min: 1,
            max: 500
        },
        taille: {
            type: 'number',
            min: 30,
            max: 250
        },
        allergies: {
            type: 'string',
            maxLength: 2000
        },
        antecedentsMedicaux: {
            type: 'string',
            maxLength: 2000
        },
        traitementsEnCours: {
            type: 'string',
            maxLength: 2000
        }
    },
    required: [], // Aucun champ obligatoire pour une mise à jour
    strict: true
};

/**
 * PUT /patients/profile - Mise à jour du profil patient
 */
router.put('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    BodyFilter.validate(updateProfileSchema),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;
            const updateData = req.body;

            console.log(`📝 Mise à jour profil patient: ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Validation spécifique date de naissance
            if (updateData.dateNaissance) {
                const birthDate = new Date(updateData.dateNaissance);
                const today = new Date();
                const age = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));

                if (age < 0 || age > 120) {
                    return ApiResponse.badRequest(res, 'Date de naissance invalide', {
                        code: 'INVALID_BIRTH_DATE',
                        message: 'La date de naissance doit correspondre à un âge entre 0 et 120 ans.',
                        field: 'dateNaissance'
                    });
                }
            }

            // Validation unicité email si modifié
            if (updateData.email && updateData.email !== user.email) {
                const existingUserByEmail = await prisma.user.findUnique({
                    where: { email: updateData.email.toLowerCase().trim() },
                    select: { id: true }
                });

                if (existingUserByEmail) {
                    return ApiResponse.badRequest(res, 'Adresse email déjà utilisée', {
                        code: 'EMAIL_ALREADY_EXISTS',
                        message: 'Cette adresse email est déjà associée à un autre compte.',
                        field: 'email'
                    });
                }
            }

            // Validation unicité téléphone si modifié
            if (updateData.telephone) {
                const cleanPhone = updateData.telephone.replace(/[^0-9]/g, '');
                if (cleanPhone !== user.telephone) {
                    const existingUserByPhone = await prisma.user.findUnique({
                        where: { telephone: cleanPhone },
                        select: { id: true }
                    });

                    if (existingUserByPhone) {
                        return ApiResponse.badRequest(res, 'Numéro de téléphone déjà utilisé', {
                            code: 'PHONE_ALREADY_EXISTS',
                            message: 'Ce numéro est déjà associé à un autre compte.',
                            field: 'telephone'
                        });
                    }
                }
                updateData.telephone = cleanPhone;
            }

            // Séparation des données User et Patient
            const userFields = ['nom', 'prenom', 'email', 'telephone', 'canalCommunicationPrefere'];
            const patientFields = ['dateNaissance', 'sexe', 'adresse', 'ville', 'codePostal', 'groupeSanguin', 'poids', 'taille', 'allergies', 'antecedentsMedicaux', 'traitementsEnCours'];

            const userUpdateData = {};
            const patientUpdateData = {};

            // Répartition des champs
            Object.keys(updateData).forEach(field => {
                if (userFields.includes(field)) {
                    userUpdateData[field] = updateData[field];
                } else if (patientFields.includes(field)) {
                    patientUpdateData[field] = updateData[field];
                }
            });

            // Nettoyage des données User
            if (userUpdateData.email) {
                userUpdateData.email = userUpdateData.email.toLowerCase().trim();
            }
            if (userUpdateData.nom) {
                userUpdateData.nom = userUpdateData.nom.trim();
            }
            if (userUpdateData.prenom) {
                userUpdateData.prenom = userUpdateData.prenom.trim();
            }

            // Nettoyage des données Patient
            if (patientUpdateData.dateNaissance) {
                patientUpdateData.dateNaissance = new Date(patientUpdateData.dateNaissance);
            }
            if (patientUpdateData.adresse) {
                patientUpdateData.adresse = patientUpdateData.adresse.trim();
            }
            if (patientUpdateData.ville) {
                patientUpdateData.ville = patientUpdateData.ville.trim();
            }

            // Mise à jour en transaction
            const result = await prisma.$transaction(async (tx) => {
                let updatedUser = user;
                let updatedPatient = user.patient;

                // Mise à jour User si nécessaire
                if (Object.keys(userUpdateData).length > 0) {
                    updatedUser = await tx.user.update({
                        where: { id: user.id },
                        data: userUpdateData,
                        select: {
                            id: true,
                            email: true,
                            telephone: true,
                            nom: true,
                            prenom: true,
                            role: true,
                            statut: true,
                            canalCommunicationPrefere: true,
                            updatedAt: true
                        }
                    });
                }

                // Mise à jour Patient si nécessaire
                if (Object.keys(patientUpdateData).length > 0) {
                    updatedPatient = await tx.patient.update({
                        where: { userId: user.id },
                        data: patientUpdateData,
                        select: {
                            id: true,
                            dateNaissance: true,
                            sexe: true,
                            adresse: true,
                            ville: true,
                            codePostal: true,
                            groupeSanguin: true,
                            poids: true,
                            taille: true,
                            allergies: true,
                            antecedentsMedicaux: true,
                            traitementsEnCours: true,
                            abonneContenuPro: true
                        }
                    });
                }

                return { updatedUser, updatedPatient };
            });

            // Préparation de la réponse
            const responseData = {
                id: result.updatedUser.id,
                email: result.updatedUser.email,
                telephone: result.updatedUser.telephone,
                nom: result.updatedUser.nom,
                prenom: result.updatedUser.prenom,
                role: result.updatedUser.role,
                statut: result.updatedUser.statut,
                canalCommunicationPrefere: result.updatedUser.canalCommunicationPrefere,
                updatedAt: result.updatedUser.updatedAt,
                patient: {
                    id: result.updatedPatient.id,
                    dateNaissance: result.updatedPatient.dateNaissance,
                    sexe: result.updatedPatient.sexe,
                    adresse: result.updatedPatient.adresse,
                    ville: result.updatedPatient.ville,
                    codePostal: result.updatedPatient.codePostal,
                    groupeSanguin: result.updatedPatient.groupeSanguin,
                    poids: result.updatedPatient.poids,
                    taille: result.updatedPatient.taille,
                    allergies: result.updatedPatient.allergies,
                    antecedentsMedicaux: result.updatedPatient.antecedentsMedicaux,
                    traitementsEnCours: result.updatedPatient.traitementsEnCours,
                    abonneContenuPro: result.updatedPatient.abonneContenuPro
                }
            };

            // Calculs supplémentaires
            if (result.updatedPatient.dateNaissance) {
                const today = new Date();
                const birthDate = new Date(result.updatedPatient.dateNaissance);
                const age = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
                responseData.patient.age = age;
            }

            if (result.updatedPatient.poids && result.updatedPatient.taille) {
                const imc = result.updatedPatient.poids / Math.pow(result.updatedPatient.taille / 100, 2);
                responseData.patient.imc = Math.round(imc * 10) / 10;
            }

            // Informations de mise à jour
            const updateSummary = {
                fieldsUpdated: Object.keys(updateData),
                userFieldsUpdated: Object.keys(userUpdateData),
                patientFieldsUpdated: Object.keys(patientUpdateData),
                totalFieldsUpdated: Object.keys(updateData).length,
                updateTime: new Date().toISOString(),
                ip: clientIp
            };

            console.log(`✅ Profil patient mis à jour: ${result.updatedUser.prenom} ${result.updatedUser.nom} - ${updateSummary.totalFieldsUpdated} champs modifiés`);

            return ApiResponse.success(res, 'Profil mis à jour avec succès', {
                profile: responseData,
                updateSummary,
                nextSteps: [
                    'Votre profil a été mis à jour avec succès',
                    'Les modifications sont immédiatement disponibles',
                    'Vos préférences de communication sont prises en compte'
                ]
            });

        } catch (error) {
            console.error('❌ Erreur mise à jour profil patient:', error);

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
            }
            
            return ApiResponse.serverError(res, 'Erreur interne lors de la mise à jour du profil');
        }
    }
);

module.exports = router;