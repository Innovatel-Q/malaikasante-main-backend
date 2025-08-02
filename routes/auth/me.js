const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /auth/me - Récupérer les informations de l'utilisateur connecté
 */
router.get('/',
    AuthMiddleware.authenticate(),
    async (req, res) => {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`👤 Récupération infos utilisateur: ${userId} (${userRole})`);

            // Récupération des informations complètes selon le rôle
            let userWithDetails;

            switch (userRole) {
                case 'PATIENT':
                    userWithDetails = await prisma.user.findUnique({
                        where: { id: userId },
                        select: {
                            id: true,
                            email: true,
                            telephone: true,
                            nom: true,
                            prenom: true,
                            role: true,
                            statut: true,
                            canalCommunicationPrefere: true,
                            createdAt: true,
                            updatedAt: true,
                            patient: {
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
                            }
                        }
                    });
                    break;

                case 'MEDECIN':
                    userWithDetails = await prisma.user.findUnique({
                        where: { id: userId },
                        select: {
                            id: true,
                            email: true,
                            telephone: true,
                            nom: true,
                            prenom: true,
                            role: true,
                            statut: true,
                            canalCommunicationPrefere: true,
                            createdAt: true,
                            updatedAt: true,
                            medecin: {
                                select: {
                                    id: true,
                                    numeroOrdre: true,
                                    specialites: true,
                                    statutValidation: true,
                                    dateValidation: true,
                                    motifRejet: true,
                                    bio: true,
                                    experienceAnnees: true,
                                    languesParlees: true,
                                    tarifConsultationBase: true,
                                    accepteDomicile: true,
                                    accepteTeleconsultation: true,
                                    accepteclinique: true,
                                    noteMoyenne: true,
                                    nombreEvaluations: true,
                                    clinique: {
                                        select: {
                                            id: true,
                                            nom: true,
                                            adresse: true,
                                            ville: true,
                                            telephone: true,
                                            email: true,
                                            horaires: true,
                                            services: true
                                        }
                                    }
                                }
                            }
                        }
                    });
                    break;

                case 'ADMIN':
                    userWithDetails = await prisma.user.findUnique({
                        where: { id: userId },
                        select: {
                            id: true,
                            email: true,
                            telephone: true,
                            nom: true,
                            prenom: true,
                            role: true,
                            statut: true,
                            canalCommunicationPrefere: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    });
                    break;

                default:
                    return ApiResponse.badRequest(res, 'Rôle utilisateur non reconnu');
            }

            if (!userWithDetails) {
                console.log(`❌ Utilisateur non trouvé: ${userId}`);
                return ApiResponse.notFound(res, 'Utilisateur non trouvé');
            }

            // Préparer les informations de réponse
            const responseData = {
                id: userWithDetails.id,
                email: userWithDetails.email,
                telephone: userWithDetails.telephone,
                nom: userWithDetails.nom,
                prenom: userWithDetails.prenom,
                role: userWithDetails.role,
                statut: userWithDetails.statut,
                canalCommunicationPrefere: userWithDetails.canalCommunicationPrefere,
                createdAt: userWithDetails.createdAt,
                updatedAt: userWithDetails.updatedAt,
                authMethod: userWithDetails.role === 'PATIENT' ? 'OTP_ONLY' : 'EMAIL_PASSWORD'
            };

            // Ajouter les données spécifiques selon le rôle
            if (userRole === 'PATIENT' && userWithDetails.patient) {
                responseData.patient = {
                    id: userWithDetails.patient.id,
                    dateNaissance: userWithDetails.patient.dateNaissance,
                    sexe: userWithDetails.patient.sexe,
                    adresse: userWithDetails.patient.adresse,
                    ville: userWithDetails.patient.ville,
                    codePostal: userWithDetails.patient.codePostal,
                    groupeSanguin: userWithDetails.patient.groupeSanguin,
                    poids: userWithDetails.patient.poids,
                    taille: userWithDetails.patient.taille,
                    allergies: userWithDetails.patient.allergies,
                    antecedentsMedicaux: userWithDetails.patient.antecedentsMedicaux,
                    traitementsEnCours: userWithDetails.patient.traitementsEnCours,
                    abonneContenuPro: userWithDetails.patient.abonneContenuPro
                };

                // Calculer l'âge si date de naissance disponible
                if (userWithDetails.patient.dateNaissance) {
                    const today = new Date();
                    const birthDate = new Date(userWithDetails.patient.dateNaissance);
                    const age = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
                    responseData.patient.age = age;
                }

                // Calculer l'IMC si poids et taille disponibles
                if (userWithDetails.patient.poids && userWithDetails.patient.taille) {
                    const imc = userWithDetails.patient.poids / Math.pow(userWithDetails.patient.taille / 100, 2);
                    responseData.patient.imc = Math.round(imc * 10) / 10;
                }
            }

            if (userRole === 'MEDECIN' && userWithDetails.medecin) {
                responseData.medecin = {
                    id: userWithDetails.medecin.id,
                    numeroOrdre: userWithDetails.medecin.numeroOrdre,
                    specialites: userWithDetails.medecin.specialites,
                    statutValidation: userWithDetails.medecin.statutValidation,
                    dateValidation: userWithDetails.medecin.dateValidation,
                    motifRejet: userWithDetails.medecin.motifRejet,
                    bio: userWithDetails.medecin.bio,
                    experienceAnnees: userWithDetails.medecin.experienceAnnees,
                    languesParlees: userWithDetails.medecin.languesParlees,
                    tarifConsultationBase: userWithDetails.medecin.tarifConsultationBase,
                    accepteDomicile: userWithDetails.medecin.accepteDomicile,
                    accepteTeleconsultation: userWithDetails.medecin.accepteTeleconsultation,
                    accepteclinique: userWithDetails.medecin.accepteclinique,
                    noteMoyenne: userWithDetails.medecin.noteMoyenne,
                    nombreEvaluations: userWithDetails.medecin.nombreEvaluations,
                    clinique: userWithDetails.medecin.clinique
                };

                // Ajouter des informations de validation
                responseData.validationInfo = {
                    isValidated: userWithDetails.medecin.statutValidation === 'VALIDE',
                    canPractice: userWithDetails.medecin.statutValidation === 'VALIDE',
                    validationStatus: userWithDetails.medecin.statutValidation
                };
            }

            // Informations de profil
            const profileCompletion = calculateProfileCompletion(userWithDetails, userRole);
            responseData.profileInfo = {
                completion: profileCompletion,
                isComplete: profileCompletion >= 80,
                lastUpdate: userWithDetails.updatedAt
            };

            console.log(`✅ Infos récupérées pour: ${userWithDetails.prenom} ${userWithDetails.nom} (${userRole})`);

            return ApiResponse.success(res, 'Informations utilisateur récupérées', responseData);

        } catch (error) {
            console.error('❌ Erreur récupération infos utilisateur:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la récupération des informations');
        }
    }
);

/**
 * Calculer le pourcentage de completion du profil
 */
function calculateProfileCompletion(user, role) {
    let totalFields = 0;
    let completedFields = 0;

    // Champs de base (User)
    const baseFields = ['nom', 'prenom', 'email', 'telephone'];
    totalFields += baseFields.length;
    completedFields += baseFields.filter(field => user[field] && user[field].trim() !== '').length;

    if (role === 'PATIENT' && user.patient) {
        const patientFields = ['dateNaissance', 'sexe', 'ville', 'groupeSanguin'];
        totalFields += patientFields.length;
        completedFields += patientFields.filter(field => user.patient[field]).length;

        // Champs médicaux optionnels mais importants
        const medicalFields = ['allergies', 'antecedentsMedicaux'];
        totalFields += medicalFields.length;
        completedFields += medicalFields.filter(field =>
            user.patient[field] && user.patient[field].trim() !== ''
        ).length;
    }

    if (role === 'MEDECIN' && user.medecin) {
        const medecinFields = ['numeroOrdre', 'specialites', 'bio', 'experienceAnnees'];
        totalFields += medecinFields.length;
        completedFields += medecinFields.filter(field => {
            if (field === 'specialites') {
                return user.medecin[field] && Array.isArray(user.medecin[field]) && user.medecin[field].length > 0;
            }
            return user.medecin[field];
        }).length;
    }

    return Math.round((completedFields / totalFields) * 100);
}

module.exports = router;