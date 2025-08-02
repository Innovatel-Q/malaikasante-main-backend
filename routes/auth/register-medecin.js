const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');
const Consts = require('../../config/const');

// Schéma de validation
const registerMedecinSchema = {
    fields: {
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
        telephone: {
            type: 'phone'
        },
        email: {
            type: 'email'
        },
        password: {
            type: 'string',
            minLength: 8,
            maxLength: 100
        },
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
        }
    },
    required: ['nom', 'prenom', 'telephone', 'email', 'password', 'numeroOrdre', 'specialites'],
    strict: true
};

/**
 * POST /auth/register/medecin - Inscription d'un nouveau médecin
 */
router.post('/',
    BodyFilter.validate(registerMedecinSchema),
    async (req, res) => {
        try {
            const {
                nom,
                prenom,
                telephone,
                email,
                password,
                numeroOrdre,
                specialites,
                bio,
                experienceAnnees
            } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`👨‍⚕️ Inscription médecin: Dr ${prenom} ${nom} - Tel: ${telephone} - IP: ${clientIp}`);

            // Nettoyage du numéro
            const cleanPhone = telephone.replace(/[^0-9]/g, '');

            // Vérifier que le numéro a été validé par OTP récemment (dans les 10 dernières minutes)
            const recentValidatedOtp = await prisma.otp.findFirst({
                where: {
                    telephone: cleanPhone,
                    utilise: true,
                    createdAt: {
                        gte: new Date(Date.now() - (10 * 60 * 1000)) // 10 minutes
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (!recentValidatedOtp) {
                console.log(`❌ Numéro non vérifié pour ${cleanPhone}`);
                return ApiResponse.badRequest(res, 'Numéro de téléphone non vérifié', {
                    code: 'PHONE_NOT_VERIFIED',
                    message: 'Vous devez d\'abord vérifier votre numéro de téléphone avec un code OTP.',
                    action: 'Demandez un code OTP pour ce numéro'
                });
            }

            // Vérifier l'unicité de l'email
            const existingUserByEmail = await prisma.user.findUnique({
                where: { email },
                select: { id: true, email: true, role: true }
            });

            if (existingUserByEmail) {
                console.log(`❌ Email déjà utilisé: ${email} (${existingUserByEmail.role})`);
                return ApiResponse.badRequest(res, 'Adresse email déjà utilisée', {
                    code: 'EMAIL_ALREADY_EXISTS',
                    message: `Cette adresse email est déjà associée à un compte ${existingUserByEmail.role.toLowerCase()}.`,
                    field: 'email'
                });
            }

            // Vérifier l'unicité du téléphone
            const existingUserByPhone = await prisma.user.findUnique({
                where: { telephone: cleanPhone },
                select: { id: true, telephone: true, role: true }
            });

            if (existingUserByPhone) {
                console.log(`❌ Téléphone déjà utilisé: ${cleanPhone} (${existingUserByPhone.role})`);
                return ApiResponse.badRequest(res, 'Numéro de téléphone déjà utilisé', {
                    code: 'PHONE_ALREADY_EXISTS',
                    message: `Ce numéro est déjà associé à un compte ${existingUserByPhone.role.toLowerCase()}.`,
                    field: 'telephone'
                });
            }

            // Vérifier l'unicité du numéro d'ordre
            const existingMedecinByOrdre = await prisma.medecin.findUnique({
                where: { numeroOrdre },
                select: { id: true, numeroOrdre: true }
            });

            if (existingMedecinByOrdre) {
                console.log(`❌ Numéro d'ordre déjà utilisé: ${numeroOrdre}`);
                return ApiResponse.badRequest(res, 'Numéro d\'ordre déjà utilisé', {
                    code: 'ORDRE_NUMBER_EXISTS',
                    message: 'Ce numéro d\'ordre est déjà enregistré dans le système.',
                    field: 'numeroOrdre'
                });
            }

            // Validation des spécialités
            if (!Array.isArray(specialites) || specialites.length === 0) {
                return ApiResponse.badRequest(res, 'Au moins une spécialité est requise', {
                    code: 'SPECIALITES_REQUIRED',
                    message: 'Vous devez spécifier au moins une spécialité médicale.',
                    field: 'specialites'
                });
            }

            // Spécialités autorisées (liste exhaustive)
            const specialitesAutorisees = [
                'MEDECINE_GENERALE',
                'CARDIOLOGIE',
                'DERMATOLOGIE',
                'PEDIATRIE',
                'GYNECOLOGIE',
                'NEUROLOGIE',
                'PSYCHIATRIE',
                'CHIRURGIE_GENERALE',
                'OPHTALMOLOGIE',
                'ORL',
                'RADIOLOGIE',
                'ANESTHESIE',
                'URGENCES',
                'MEDECINE_INTERNE',
                'ENDOCRINOLOGIE',
                'RHUMATOLOGIE',
                'GASTROENTEROLOGIE',
                'PNEUMOLOGIE',
                'NEPHROLOGIE',
                'ONCOLOGIE'
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

            // Validation expérience
            if (experienceAnnees !== undefined && (experienceAnnees < 0 || experienceAnnees > 60)) {
                return ApiResponse.badRequest(res, 'Années d\'expérience invalides', {
                    code: 'INVALID_EXPERIENCE',
                    message: 'L\'expérience doit être comprise entre 0 et 60 ans.',
                    field: 'experienceAnnees'
                });
            }

            // Hashage du mot de passe
            const hashedPassword = await bcrypt.hash(password, 12);

            // Création de l'utilisateur et du médecin en transaction
            const result = await prisma.$transaction(async (tx) => {
                // Créer l'utilisateur avec mot de passe
                const newUser = await tx.user.create({
                    data: {
                        nom: nom.trim(),
                        prenom: prenom.trim(),
                        telephone: cleanPhone,
                        email: email.toLowerCase().trim(),
                        password: hashedPassword,
                        role: 'MEDECIN',
                        statut: 'ACTIF',
                        canalCommunicationPrefere: 'EMAIL'
                    }
                });

                // Créer le profil médecin (EN_ATTENTE de validation)
                const newMedecin = await tx.medecin.create({
                    data: {
                        userId: newUser.id,
                        numeroOrdre: numeroOrdre.toUpperCase().trim(),
                        specialites: specialites, // Stocké en JSON
                        statutValidation: 'EN_ATTENTE',
                        bio: bio ? bio.trim() : null,
                        experienceAnnees: experienceAnnees || null,
                        languesParlees: ['FRANCAIS'], // Par défaut en Côte d'Ivoire
                        accepteDomicile: false, // Par défaut
                        accepteTeleconsultation: false, // Par défaut
                        accepteclinique: true, // Par défaut
                        noteMoyenne: 0,
                        nombreEvaluations: 0
                    }
                });

                return { user: newUser, medecin: newMedecin };
            });

            // Préparer les informations utilisateur (SANS tokens car EN_ATTENTE)
            const userInfo = {
                id: result.user.id,
                telephone: result.user.telephone,
                email: result.user.email,
                nom: result.user.nom,
                prenom: result.user.prenom,
                role: result.user.role,
                statut: result.user.statut,
                hasPassword: true,
                authMethod: 'EMAIL_PASSWORD',
                medecin: {
                    id: result.medecin.id,
                    numeroOrdre: result.medecin.numeroOrdre,
                    specialites: result.medecin.specialites,
                    statutValidation: result.medecin.statutValidation,
                    bio: result.medecin.bio,
                    experienceAnnees: result.medecin.experienceAnnees,
                    accepteDomicile: result.medecin.accepteDomicile,
                    accepteTeleconsultation: result.medecin.accepteTeleconsultation,
                    accepteclinique: result.medecin.accepteclinique
                }
            };

            console.log(`✅ Médecin créé en attente de validation: Dr ${result.user.prenom} ${result.user.nom} (ID: ${result.user.id})`);

            // TODO: Envoyer notification email à l'administration pour validation
            // await NotificationService.sendMedecinValidationRequest(result.medecin);

            // Réponse de succès (SANS tokens car compte en attente)
            return ApiResponse.created(res, 'Compte médecin créé en attente de validation', {
                user: userInfo,
                validationInfo: {
                    status: 'EN_ATTENTE',
                    message: 'Votre compte médecin a été créé avec succès et est en attente de validation par notre équipe.',
                    estimatedValidationTime: '24-48 heures',
                    documentsRequired: [
                        'Copie du diplôme de médecine',
                        'Certificat d\'inscription à l\'Ordre des Médecins',
                        'Pièce d\'identité valide'
                    ],
                    contactInfo: {
                        email: 'validation@medecins-patients.ci',
                        telephone: '+225 XX XX XX XX'
                    }
                },
                accountInfo: {
                    createdAt: result.user.createdAt,
                    ip: clientIp,
                    isEmailVerified: false,
                    isPhoneVerified: true,
                    accountType: 'MEDECIN',
                    needsValidation: true
                },
                nextSteps: [
                    'Votre compte médecin est créé mais pas encore actif',
                    'Un administrateur va vérifier vos informations sous 24-48h',
                    'Vous recevrez un email de confirmation une fois validé',
                    'En attendant, préparez vos documents de validation',
                    'Vous pourrez vous connecter une fois votre compte validé avec: email + mot de passe'
                ]
            });

        } catch (error) {
            console.error('❌ Erreur inscription médecin:', error);

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

            return ApiResponse.serverError(res, 'Erreur interne lors de la création du compte médecin');
        }
    }
);

module.exports = router;