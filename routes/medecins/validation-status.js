const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /medecins/validation-status - Consultation du statut de validation médecin
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`📋 Consultation statut validation: Dr ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Récupération des informations détaillées du médecin
            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: {
                    id: true,
                    numeroOrdre: true,
                    specialites: true,
                    statutValidation: true,
                    dateValidation: true,
                    motifRejet: true,
                    bio: true,
                    experienceAnnees: true,
                    valideParAdmin: {
                        select: {
                            nom: true,
                            prenom: true,
                            email: true
                        }
                    }
                },
                include: {
                    user: {
                        select: {
                            createdAt: true
                        }
                    }
                }
            });

            if (!medecin) {
                console.log(`❌ Profil médecin non trouvé pour: ${user.id}`);
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            // Calcul du temps écoulé depuis la demande
            const createdAt = medecin.user.createdAt;
            const timeElapsed = Math.floor((new Date() - createdAt) / (1000 * 60 * 60)); // en heures

            // Préparation des informations contextuelles selon le statut
            let statusInfo = {};
            let nextSteps = [];
            let estimatedTime = null;

            switch (medecin.statutValidation) {
                case 'EN_ATTENTE':
                    statusInfo = {
                        message: 'Votre compte médecin est en cours de validation par notre équipe administrative.',
                        description: 'Nous vérifions actuellement vos documents et informations professionnelles.',
                        priority: 'NORMALE',
                        canPractice: false
                    };
                    nextSteps = [
                        'Patientez pendant la validation de votre dossier',
                        'Vérifiez que tous vos documents sont bien lisibles',
                        'Vous recevrez un email de confirmation une fois validé',
                        'En cas de problème, nous vous contacterons directement'
                    ];
                    estimatedTime = timeElapsed < 24 ? `${24 - timeElapsed}h restantes (estimation)` : 'Validation en cours, sous 48h';
                    break;

                case 'VALIDE':
                    statusInfo = {
                        message: 'Félicitations ! Votre compte médecin est validé et actif.',
                        description: 'Vous pouvez maintenant exercer pleinement sur la plateforme.',
                        priority: 'VALIDÉ',
                        canPractice: true
                    };
                    nextSteps = [
                        'Complétez votre profil si nécessaire',
                        'Configurez vos disponibilités',
                        'Commencez à recevoir des demandes de rendez-vous',
                        'Gérez votre agenda médical'
                    ];
                    break;

                case 'REJETE':
                    statusInfo = {
                        message: 'Votre demande de validation a été rejetée.',
                        description: 'Des éléments de votre dossier nécessitent des corrections ou compléments.',
                        priority: 'URGENT',
                        canPractice: false
                    };
                    nextSteps = [
                        'Consultez le motif de rejet ci-dessous',
                        'Corrigez les éléments mentionnés',
                        'Contactez notre équipe pour resoumission',
                        'Préparez les documents complémentaires si nécessaire'
                    ];
                    break;
            }

            // Informations de contact
            const contactInfo = {
                email: 'validation@medecins-patients.ci',
                telephone: '+225 XX XX XX XX',
                horaires: 'Lundi-Vendredi 8h-17h'
            };

            // Documents requis pour validation
            const documentsRequired = [
                {
                    type: 'Diplôme de médecine',
                    description: 'Copie certifiée conforme du diplôme',
                    required: true
                },
                {
                    type: 'Certificat d\'inscription à l\'Ordre',
                    description: 'Certificat d\'inscription à l\'Ordre des Médecins de Côte d\'Ivoire',
                    required: true
                },
                {
                    type: 'Pièce d\'identité',
                    description: 'Copie de la carte nationale d\'identité ou passeport',
                    required: true
                },
                {
                    type: 'Certificats de spécialisation',
                    description: 'Si applicable, certificats de spécialités médicales',
                    required: false
                }
            ];

            // Préparation de la réponse
            const responseData = {
                validationStatus: {
                    current: medecin.statutValidation,
                    dateValidation: medecin.dateValidation,
                    motifRejet: medecin.motifRejet,
                    timeElapsed: `${timeElapsed}h`,
                    estimatedTime,
                    statusInfo
                },
                medecinInfo: {
                    id: medecin.id,
                    numeroOrdre: medecin.numeroOrdre,
                    specialites: medecin.specialites,
                    bio: medecin.bio,
                    experienceAnnees: medecin.experienceAnnees
                },
                validationDetails: {
                    nextSteps,
                    documentsRequired,
                    contactInfo
                }
            };

            // Ajouter informations de validation si disponibles
            if (medecin.statutValidation === 'VALIDE' && medecin.valideParAdmin) {
                responseData.validationDetails.validatedBy = {
                    nom: medecin.valideParAdmin.nom,
                    prenom: medecin.valideParAdmin.prenom,
                    email: medecin.valideParAdmin.email
                };
            }

            // Informations additionnelles selon le statut
            if (medecin.statutValidation === 'REJETE') {
                responseData.rejectionDetails = {
                    motif: medecin.motifRejet || 'Motif non spécifié',
                    actions: [
                        'Corriger les documents mentionnés',
                        'Contacter l\'équipe de validation',
                        'Resoummettre le dossier complet'
                    ],
                    urgency: 'HAUTE'
                };
            }

            if (medecin.statutValidation === 'EN_ATTENTE') {
                responseData.waitingDetails = {
                    queuePosition: 'Information non disponible',
                    averageProcessingTime: '24-48 heures',
                    workingDays: 'Lundi-Vendredi',
                    holidays: 'Traitement suspendu les weekends et jours fériés'
                };
            }

            console.log(`✅ Statut consulté: Dr ${user.prenom} ${user.nom} - Statut: ${medecin.statutValidation}`);

            return ApiResponse.success(res, 'Statut de validation récupéré', responseData);

        } catch (error) {
            console.error('❌ Erreur consultation statut validation:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la consultation du statut');
        }
    }
);

module.exports = router;