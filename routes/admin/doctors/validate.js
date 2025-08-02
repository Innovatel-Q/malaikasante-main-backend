// routes/admin/doctors/validate.js
const express = require('express');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');
const EmailService = require('../../../services/EmailService'); // Service d'email existant

// Schéma de validation
const validateMedecinSchema = {
    fields: {
        action: {
            type: 'string',
            enum: ['VALIDE', 'REJETE']
        },
        motifRejet: {
            type: 'string',
            minLength: 10,
            maxLength: 500
        }
    },
    required: ['action'],
    strict: true
};

// PUT /v1/admin/doctors/{medecinId}/validate
router.put('/:medecinId/validate',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    BodyFilter.validate(validateMedecinSchema),
    async (req, res) => {
        try {
            const { medecinId } = req.params;
            const { action, motifRejet } = req.body;
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            // Validation conditionnelle du motif
            if (action === 'REJETE' && !motifRejet) {
                return ApiResponse.badRequest(res, 'Motif de rejet obligatoire', {
                    code: 'MOTIF_REQUIRED',
                    field: 'motifRejet'
                });
            }

            console.log(`🔍 Admin ${adminUser.prenom} ${adminUser.nom} ${action === 'VALIDE' ? 'valide' : 'rejette'} le médecin: ${medecinId}`);

            // Vérifier que le médecin existe et est en attente
            const medecin = await prisma.medecin.findUnique({
                where: { id: medecinId },
                include: {
                    user: {
                        select: {
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

            if (medecin.statutValidation !== 'EN_ATTENTE') {
                return ApiResponse.badRequest(res, 'Seuls les médecins en attente peuvent être validés', {
                    code: 'INVALID_STATUS',
                    currentStatus: medecin.statutValidation
                });
            }

            // Mettre à jour le statut du médecin
            const medecinUpdated = await prisma.medecin.update({
                where: { id: medecinId },
                data: {
                    statutValidation: action,
                    dateValidation: new Date(),
                    valideParAdminId: adminUser.id,
                    motifRejet: action === 'REJETE' ? motifRejet : null
                }
            });

            // Envoyer notification email selon l'action
            try {
                if (action === 'VALIDE') {
                    // Email de validation
                    const subject = '✅ Votre compte médecin a été validé';
                    const content = `
                        Bonjour Dr ${medecin.user.prenom} ${medecin.user.nom},
                        
                        Excellente nouvelle ! Votre compte sur notre plateforme a été validé par ${adminUser.prenom} ${adminUser.nom}.
                        
                        Vous pouvez maintenant vous connecter avec :
                        • Email : ${medecin.user.email}
                        • Mot de passe : celui que vous avez défini lors de l'inscription
                        
                        Prochaines étapes :
                        • Complétez votre profil si nécessaire
                        • Configurez vos disponibilités
                        • Commencez à recevoir des demandes de rendez-vous
                        
                        Bienvenue sur la plateforme !
                        
                        L'équipe LYCORIS GROUP
                    `;

                    await EmailService.sendEmail({
                        to: medecin.user.email,
                        subject,
                        content,
                        type: 'VALIDATION_MEDECIN'
                    });

                } else {
                    // Email de rejet
                    const subject = '❌ Votre demande de validation nécessite des corrections';
                    const content = `
                        Bonjour Dr ${medecin.user.prenom} ${medecin.user.nom},
                        
                        Nous vous informons que votre demande de validation a été examinée par ${adminUser.prenom} ${adminUser.nom}.
                        
                        Motif nécessitant correction :
                        ${motifRejet}
                        
                        Que faire maintenant ?
                        • Corrigez les éléments mentionnés ci-dessus
                        • Contactez notre équipe pour assistance : support@medecins-patients.ci
                        • Votre compte reste actif pour les corrections
                        
                        Nous restons à votre disposition pour vous accompagner.
                        
                        L'équipe LYCORIS GROUP
                    `;

                    await EmailService.sendEmail({
                        to: medecin.user.email,
                        subject,
                        content,
                        type: 'REJET_MEDECIN'
                    });
                }

                console.log(`📧 Email de ${action === 'VALIDE' ? 'validation' : 'rejet'} envoyé à ${medecin.user.email}`);

            } catch (emailError) {
                console.error('⚠️ Erreur envoi email:', emailError);
                // On continue quand même car la validation DB est réussie
            }

            console.log(`✅ Médecin ${action === 'VALIDE' ? 'validé' : 'rejeté'} avec succès: Dr ${medecin.user.prenom} ${medecin.user.nom} par admin ${adminUser.prenom} ${adminUser.nom}`);

            // Réponse selon l'action
            if (action === 'VALIDE') {
                return ApiResponse.success(res, 'Médecin validé avec succès', {
                    status: 'VALIDE',
                    message: `Dr ${medecin.user.prenom} ${medecin.user.nom} a été validé et peut maintenant se connecter à la plateforme.`,
                    nextSteps: [
                        'Le médecin a reçu un email de confirmation',
                        'Il peut maintenant se connecter avec son email et mot de passe',
                        'Son profil est visible pour les patients',
                        'Il peut commencer à recevoir des demandes de rendez-vous'
                    ]
                });
            } else {
                return ApiResponse.success(res, 'Médecin rejeté avec motif', {
                    status: 'REJETE',
                    message: `Dr ${medecin.user.prenom} ${medecin.user.nom} a été rejeté. Un email avec le motif lui a été envoyé.`,
                    motifRejet,
                    nextSteps: [
                        'Le médecin a reçu un email avec le motif du rejet',
                        'Il peut corriger les problèmes mentionnés',
                        'Il doit contacter l\'administration pour resoumission',
                        'Son statut reste EN_ATTENTE pour révision future'
                    ]
                });
            }

        } catch (error) {
            console.error('❌ Erreur validation médecin:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la validation du médecin');
        }
    }
);

module.exports = router;