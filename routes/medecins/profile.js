const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

/**
 * GET /medecins/profile - Récupérer le profil complet du médecin
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`👨‍⚕️ Consultation profil médecin: Dr ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Récupération du profil médecin complet
            const profilComplet = await prisma.user.findUnique({
                where: { id: user.id },
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
                            specialitePrincipale: true,
                            biographie: true,
                            experienceAnnees: true,
                            languesParlees: true,
                            
                            // Informations de consultation
                            tarifConsultationClinique: true,
                            tarifConsultationDomicile: true,
                            tarifTeleconsultation: true,
                            consultationDomicile: true,
                            teleconsultation: true,
                            rayonDeplacementKm: true,
                            fraisDeplacementParKm: true,
                            
                            // Adresse du cabinet
                            adresseConsultation: true,
                            villeConsultation: true,
                            codePostalConsultation: true,
                            informationsAcces: true,
                            
                            // Statuts et paramètres
                            statutValidation: true,
                            statut: true,
                            accepteNouveauxPatients: true,
                            delaiMoyenReponse: true,
                            messageIndisponibilite: true,
                            
                            // Média
                            photoProfile: true,
                            photoCabinet: true,
                            videoPresentation: true,
                            
                            // Paramètres techniques
                            plateformesUtilisees: true,
                            zonesGeographiques: true,
                            
                            // Relations
                            diplomes: {
                                select: {
                                    institution: true,
                                    diplome: true,
                                    specialite: true,
                                    anneeObtention: true,
                                    pays: true,
                                    statut: true
                                },
                                where: {
                                    statut: 'VALIDE'
                                },
                                orderBy: {
                                    anneeObtention: 'desc'
                                }
                            },
                            
                            certifications: {
                                select: {
                                    nom: true,
                                    organisme: true,
                                    dateObtention: true,
                                    dateExpiration: true,
                                    statut: true
                                },
                                where: {
                                    statut: 'VALIDE',
                                    OR: [
                                        { dateExpiration: null },
                                        { dateExpiration: { gt: new Date() } }
                                    ]
                                },
                                orderBy: {
                                    dateObtention: 'desc'
                                }
                            },
                            
                            specialites: {
                                select: {
                                    nom: true,
                                    certification: true,
                                    experienceAnnees: true
                                }
                            },
                            
                            horairesConsultation: {
                                select: {
                                    jourSemaine: true,
                                    heureDebut: true,
                                    heureFin: true,
                                    typeConsultation: true,
                                    actif: true
                                },
                                where: {
                                    actif: true
                                },
                                orderBy: [
                                    { jourSemaine: 'asc' },
                                    { heureDebut: 'asc' }
                                ]
                            }
                        }
                    }
                }
            });

            if (!profilComplet || !profilComplet.medecin) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            // Statistiques d'activité
            const [
                nombreRendezVous,
                rendezVousEnCours,
                rendezVousTermines,
                nombrePatients,
                evaluations
            ] = await Promise.all([
                // Total des rendez-vous
                prisma.rendezVous.count({
                    where: { medecinId: profilComplet.medecin.id }
                }),
                
                // Rendez-vous en cours ou confirmés
                prisma.rendezVous.count({
                    where: {
                        medecinId: profilComplet.medecin.id,
                        statut: { in: ['CONFIRME', 'EN_COURS'] }
                    }
                }),
                
                // Rendez-vous terminés
                prisma.rendezVous.count({
                    where: {
                        medecinId: profilComplet.medecin.id,
                        statut: 'TERMINE'
                    }
                }),
                
                // Nombre de patients uniques
                prisma.rendezVous.findMany({
                    where: { 
                        medecinId: profilComplet.medecin.id,
                        statut: 'TERMINE'
                    },
                    select: { patientId: true },
                    distinct: ['patientId']
                }),
                
                // Évaluations reçues
                prisma.evaluation.findMany({
                    where: {
                        evalueId: user.id,
                        typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                    },
                    select: {
                        note: true,
                        commentaire: true,
                        recommande: true,
                        createdAt: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 20
                })
            ]);

            // Calculs statistiques
            const noteMoyenne = evaluations.length > 0
                ? evaluations.reduce((sum, eval) => sum + eval.note, 0) / evaluations.length
                : null;

            const tauxRecommandation = evaluations.length > 0
                ? Math.round((evaluations.filter(e => e.recommande).length / evaluations.length) * 100)
                : null;

            // Répartition des notes
            const repartitionNotes = {
                5: evaluations.filter(e => e.note === 5).length,
                4: evaluations.filter(e => e.note === 4).length,
                3: evaluations.filter(e => e.note === 3).length,
                2: evaluations.filter(e => e.note === 2).length,
                1: evaluations.filter(e => e.note === 1).length
            };

            // Calcul de l'ancienneté
            const ancienneteCompte = Math.floor((new Date() - new Date(profilComplet.createdAt)) / (1000 * 60 * 60 * 24));
            const anciennetePlateforme = `${Math.floor(ancienneteCompte / 365)} an(s) et ${Math.floor((ancienneteCompte % 365) / 30)} mois`;

            // Organisation des horaires par jour
            const horairesParsemaine = {};
            const joursSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
            joursSemaine.forEach(jour => {
                horairesParsemaine[jour] = profilComplet.medecin.horairesConsultation
                    .filter(h => h.jourSemaine === jour)
                    .map(h => ({
                        heureDebut: h.heureDebut,
                        heureFin: h.heureFin,
                        typeConsultation: h.typeConsultation,
                        actif: h.actif
                    }));
            });

            // Vérifications et alertes du profil
            const alertesProfil = [];
            let scoreCompletude = 100;

            if (!profilComplet.medecin.biographie) {
                alertesProfil.push('Biographie manquante - importante pour rassurer les patients');
                scoreCompletude -= 15;
            }
            if (!profilComplet.medecin.photoProfile) {
                alertesProfil.push('Photo de profil manquante - améliore la confiance');
                scoreCompletude -= 10;
            }
            if (profilComplet.medecin.horairesConsultation.length === 0) {
                alertesProfil.push('Aucun horaire de consultation défini');
                scoreCompletude -= 20;
            }
            if (!profilComplet.medecin.accepteNouveauxPatients) {
                alertesProfil.push('Nouvelles demandes de patients fermées');
            }
            if (profilComplet.medecin.statutValidation !== 'VALIDE') {
                alertesProfil.push('Compte en attente de validation');
                scoreCompletude -= 30;
            }

            // Préparation de la réponse complète
            const responseData = {
                // Informations utilisateur de base
                utilisateur: {
                    id: profilComplet.id,
                    email: profilComplet.email,
                    telephone: profilComplet.telephone,
                    nom: profilComplet.nom,
                    prenom: profilComplet.prenom,
                    role: profilComplet.role,
                    statut: profilComplet.statut,
                    canalCommunicationPrefere: profilComplet.canalCommunicationPrefere,
                    dateInscription: profilComplet.createdAt,
                    derniereMiseAJour: profilComplet.updatedAt,
                    anciennetePlateforme
                },

                // Informations médecin spécifiques
                medecin: {
                    id: profilComplet.medecin.id,
                    
                    // Informations professionnelles
                    identiteProfessionnelle: {
                        numeroOrdre: profilComplet.medecin.numeroOrdre,
                        specialitePrincipale: profilComplet.medecin.specialitePrincipale,
                        specialitesSecondaires: profilComplet.medecin.specialites,
                        experienceAnnees: profilComplet.medecin.experienceAnnees,
                        languesParlees: profilComplet.medecin.languesParlees ? 
                            profilComplet.medecin.languesParlees.split(',').map(l => l.trim()) : [],
                        biographie: profilComplet.medecin.biographie
                    },

                    // Formation et certifications
                    formation: {
                        diplomes: profilComplet.medecin.diplomes,
                        certifications: profilComplet.medecin.certifications,
                        nombreDiplomesValides: profilComplet.medecin.diplomes.length,
                        nombreCertifications: profilComplet.medecin.certifications.length
                    },

                    // Informations de consultation
                    consultations: {
                        tarifs: {
                            clinique: profilComplet.medecin.tarifConsultationClinique,
                            domicile: profilComplet.medecin.tarifConsultationDomicile,
                            teleconsultation: profilComplet.medecin.tarifTeleconsultation
                        },
                        services: {
                            consultationDomicile: profilComplet.medecin.consultationDomicile,
                            teleconsultation: profilComplet.medecin.teleconsultation,
                            rayonDeplacementKm: profilComplet.medecin.rayonDeplacementKm,
                            fraisDeplacementParKm: profilComplet.medecin.fraisDeplacementParKm
                        },
                        cabinet: {
                            adresse: profilComplet.medecin.adresseConsultation,
                            ville: profilComplet.medecin.villeConsultation,
                            codePostal: profilComplet.medecin.codePostalConsultation,
                            informationsAcces: profilComplet.medecin.informationsAcces
                        },
                        horaires: horairesParsemaine
                    },

                    // Statuts et paramètres
                    statuts: {
                        validation: profilComplet.medecin.statutValidation,
                        activite: profilComplet.medecin.statut,
                        accepteNouveauxPatients: profilComplet.medecin.accepteNouveauxPatients,
                        delaiMoyenReponse: profilComplet.medecin.delaiMoyenReponse,
                        messageIndisponibilite: profilComplet.medecin.messageIndisponibilite
                    },

                    // Média et présentation
                    media: {
                        photoProfile: profilComplet.medecin.photoProfile,
                        photoCabinet: profilComplet.medecin.photoCabinet,
                        videoPresentation: profilComplet.medecin.videoPresentation
                    },

                    // Paramètres techniques
                    parametres: {
                        plateformesUtilisees: profilComplet.medecin.plateformesUtilisees ?
                            profilComplet.medecin.plateformesUtilisees.split(',').map(p => p.trim()) : [],
                        zonesGeographiques: profilComplet.medecin.zonesGeographiques ?
                            profilComplet.medecin.zonesGeographiques.split(',').map(z => z.trim()) : []
                    }
                },

                // Statistiques d'activité
                statistiques: {
                    activite: {
                        nombreRendezVous,
                        rendezVousEnCours,
                        rendezVousTermines,
                        nombrePatients: nombrePatients.length,
                        tauxCompletionRdv: nombreRendezVous > 0 ? 
                            Math.round((rendezVousTermines / nombreRendezVous) * 100) : 0
                    },
                    evaluations: {
                        nombreEvaluations: evaluations.length,
                        noteMoyenne: noteMoyenne ? Math.round(noteMoyenne * 10) / 10 : null,
                        tauxRecommandation,
                        repartitionNotes,
                        dernieresEvaluations: evaluations.slice(0, 5).map(eval => ({
                            note: eval.note,
                            commentaire: eval.commentaire ? eval.commentaire.substring(0, 100) + '...' : null,
                            recommande: eval.recommande,
                            date: eval.createdAt
                        }))
                    }
                },

                // Analyse du profil
                analyseProfil: {
                    scoreCompletude,
                    alertes: alertesProfil,
                    recommandations: [
                        scoreCompletude < 80 ? 'Complétez votre profil pour attirer plus de patients' : null,
                        !profilComplet.medecin.accepteNouveauxPatients ? 'Ouvrez votre agenda pour recevoir de nouveaux patients' : null,
                        evaluations.length < 5 ? 'Encouragez vos patients à laisser des évaluations' : null,
                        !profilComplet.medecin.teleconsultation ? 'Activez les téléconsultations pour plus de flexibilité' : null
                    ].filter(Boolean)
                }
            };

            console.log(`✅ Profil médecin consulté: Dr ${profilComplet.prenom} ${profilComplet.nom} - Complétude: ${scoreCompletude}% - Patients: ${nombrePatients.length}`);

            return ApiResponse.success(res, 'Profil médecin récupéré avec succès', responseData);

        } catch (error) {
            console.error('❌ Erreur consultation profil médecin:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la consultation du profil');
        }
    }
);

// Schéma de validation pour la mise à jour du profil médecin
const updateMedecinProfileSchema = {
    fields: {
        // Informations de base
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

        // Informations professionnelles médecin
        biographie: {
            type: 'string',
            maxLength: 2000
        },
        experienceAnnees: {
            type: 'number',
            min: 0,
            max: 60
        },
        languesParlees: {
            type: 'string',
            maxLength: 200
        },

        // Informations de consultation
        tarifConsultationClinique: {
            type: 'number',
            min: 1000,
            max: 500000
        },
        tarifConsultationDomicile: {
            type: 'number',
            min: 1000,
            max: 500000
        },
        tarifTeleconsultation: {
            type: 'number',
            min: 1000,
            max: 500000
        },
        consultationDomicile: {
            type: 'boolean'
        },
        teleconsultation: {
            type: 'boolean'
        },
        rayonDeplacementKm: {
            type: 'number',
            min: 1,
            max: 100
        },
        fraisDeplacementParKm: {
            type: 'number',
            min: 0,
            max: 10000
        },

        // Cabinet
        adresseConsultation: {
            type: 'string',
            maxLength: 500
        },
        villeConsultation: {
            type: 'string',
            maxLength: 100
        },
        codePostalConsultation: {
            type: 'string',
            maxLength: 10
        },
        informationsAcces: {
            type: 'string',
            maxLength: 1000
        },

        // Paramètres
        accepteNouveauxPatients: {
            type: 'boolean'
        },
        delaiMoyenReponse: {
            type: 'number',
            min: 1,
            max: 168 // 1 semaine max
        },
        messageIndisponibilite: {
            type: 'string',
            maxLength: 500
        },

        // Techniques
        plateformesUtilisees: {
            type: 'string',
            maxLength: 200
        },
        zonesGeographiques: {
            type: 'string',
            maxLength: 500
        }
    },
    required: [],
    strict: true
};

/**
 * PUT /medecins/profile - Mettre à jour le profil médecin
 */
router.put('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    BodyFilter.validate(updateMedecinProfileSchema),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;
            const updateData = req.body;

            console.log(`✏️ Mise à jour profil médecin: Dr ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Validation de l'unicité email et téléphone
            if (updateData.email && updateData.email !== user.email) {
                const existingUser = await prisma.user.findUnique({
                    where: { email: updateData.email.toLowerCase().trim() },
                    select: { id: true }
                });

                if (existingUser) {
                    return ApiResponse.badRequest(res, 'Adresse email déjà utilisée');
                }
            }

            if (updateData.telephone) {
                const cleanPhone = updateData.telephone.replace(/[^0-9]/g, '');
                if (cleanPhone !== user.telephone) {
                    const existingUser = await prisma.user.findUnique({
                        where: { telephone: cleanPhone },
                        select: { id: true }
                    });

                    if (existingUser) {
                        return ApiResponse.badRequest(res, 'Numéro de téléphone déjà utilisé');
                    }
                }
                updateData.telephone = cleanPhone;
            }

            // Séparation des champs User et Medecin
            const userFields = ['nom', 'prenom', 'email', 'telephone', 'canalCommunicationPrefere'];
            const medecinFields = [
                'biographie', 'experienceAnnees', 'languesParlees',
                'tarifConsultationClinique', 'tarifConsultationDomicile', 'tarifTeleconsultation',
                'consultationDomicile', 'teleconsultation', 'rayonDeplacementKm', 'fraisDeplacementParKm',
                'adresseConsultation', 'villeConsultation', 'codePostalConsultation', 'informationsAcces',
                'accepteNouveauxPatients', 'delaiMoyenReponse', 'messageIndisponibilite',
                'plateformesUtilisees', 'zonesGeographiques'
            ];

            const userUpdateData = {};
            const medecinUpdateData = {};

            Object.keys(updateData).forEach(field => {
                if (userFields.includes(field)) {
                    userUpdateData[field] = updateData[field];
                } else if (medecinFields.includes(field)) {
                    medecinUpdateData[field] = updateData[field];
                }
            });

            // Nettoyage des données
            if (userUpdateData.email) {
                userUpdateData.email = userUpdateData.email.toLowerCase().trim();
            }
            if (userUpdateData.nom) {
                userUpdateData.nom = userUpdateData.nom.trim();
            }
            if (userUpdateData.prenom) {
                userUpdateData.prenom = userUpdateData.prenom.trim();
            }

            // Mise à jour en transaction
            const result = await prisma.$transaction(async (tx) => {
                let updatedUser = user;
                let updatedMedecin = null;

                // Mise à jour User
                if (Object.keys(userUpdateData).length > 0) {
                    updatedUser = await tx.user.update({
                        where: { id: user.id },
                        data: userUpdateData
                    });
                }

                // Mise à jour Medecin
                if (Object.keys(medecinUpdateData).length > 0) {
                    updatedMedecin = await tx.medecin.update({
                        where: { userId: user.id },
                        data: medecinUpdateData
                    });
                }

                return { updatedUser, updatedMedecin };
            });

            const champsModifies = Object.keys(updateData);
            const nombreChamps = champsModifies.length;

            console.log(`✅ Profil médecin mis à jour: Dr ${result.updatedUser.prenom} ${result.updatedUser.nom} - ${nombreChamps} champs modifiés`);

            return ApiResponse.success(res, 'Profil médecin mis à jour avec succès', {
                champsModifies,
                nombreChamps,
                updateTimestamp: new Date().toISOString(),
                prochaines_etapes: [
                    'Votre profil a été mis à jour avec succès',
                    'Les modifications sont immédiatement visibles par les patients',
                    nombreChamps > 5 ? 'Profil enrichi - cela devrait améliorer votre visibilité' : null,
                    result.updatedMedecin?.accepteNouveauxPatients === false ? 
                        'Vous ne recevrez plus de nouvelles demandes de patients' : null
                ].filter(Boolean)
            });

        } catch (error) {
            console.error('❌ Erreur mise à jour profil médecin:', error);

            if (error.code === 'P2002') {
                const target = error.meta?.target;
                if (target?.includes('email')) {
                    return ApiResponse.badRequest(res, 'Adresse email déjà utilisée');
                }
                if (target?.includes('telephone')) {
                    return ApiResponse.badRequest(res, 'Numéro de téléphone déjà utilisé');
                }
            }

            return ApiResponse.serverError(res, 'Erreur interne lors de la mise à jour du profil');
        }
    }
);

module.exports = router;