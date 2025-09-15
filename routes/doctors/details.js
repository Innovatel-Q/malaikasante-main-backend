const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const { body, param, validationResult } = require('express-validator');

// Configuration des multipliers de tarifs
const TARIF_MULTIPLIERS = {
    DOMICILE: 1.4,
    TELECONSULTATION: 0.75
};

/**
 * GET /doctors/:id/details - Profil détaillé d'un médecin
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    param('id').isUUID().withMessage('ID médecin invalide'),
    async (req, res) => {
        // Validation des paramètres
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return ApiResponse.badRequest(res, 'Paramètres invalides', errors.array());
        }
        try {
            const medecinId = req.params.id;

            // Vérification de l'existence du médecin avec toutes les données nécessaires
            const medecin = await prisma.medecin.findUnique({
                where: {
                    id: medecinId,
                    statutValidation: 'VALIDE'
                },
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
                    },
                    clinique: {
                        select: {
                            id: true,
                            nom: true,
                            adresse: true,
                            ville: true,
                            codePostal: true,
                            telephone: true,
                            latitude: true,
                            longitude: true,
                            informationsAcces: true
                        }
                    },
                    rendezVous: {
                        where: {
                            statut: 'TERMINE',
                            createdAt: {
                                gte: new Date(new Date().getFullYear() - 1, 0, 1)
                            }
                        },
                        select: {
                            id: true,
                            typeConsultation: true,
                            createdAt: true
                        }
                    },
                    disponibilites: {
                        where: {
                            bloque: false
                        },
                        select: {
                            jourSemaine: true,
                            heureDebut: true,
                            heureFin: true,
                            typeConsultation: true,
                            recurrent: true,
                            dateSpecifique: true
                        },
                        orderBy: [
                            { jourSemaine: 'asc' },
                            { heureDebut: 'asc' }
                        ]
                    }
                }
            });

            if (!medecin || medecin.user.statut !== 'ACTIF') {
                return ApiResponse.notFound(res, 'Médecin non trouvé ou non disponible');
            }

            // Récupération des évaluations avec recommandations
            const evaluations = await prisma.evaluation.findMany({
                where: {
                    evalueUserId: medecin.userId,
                    typeEvaluation: 'PATIENT_EVALUE_MEDECIN',
                    visible: true
                },
                select: {
                    note: true,
                    commentaire: true,
                    recommande: true,
                    dateEvaluation: true,
                    evaluateur: {
                        select: {
                            prenom: true
                        }
                    }
                },
                orderBy: {
                    dateEvaluation: 'desc'
                },
                take: 50 // Plus d'évaluations pour calculs précis
            });

            // Calcul des statistiques d'évaluation détaillées
            const noteMoyenne = evaluations.length > 0
                ? evaluations.reduce((sum, evaluation) => sum + evaluation.note, 0) / evaluations.length
                : null;

            const repartitionNotes = {
                "5": evaluations.filter(e => e.note === 5).length,
                "4": evaluations.filter(e => e.note === 4).length,
                "3": evaluations.filter(e => e.note === 3).length,
                "2": evaluations.filter(e => e.note === 2).length,
                "1": evaluations.filter(e => e.note === 1).length
            };

            // Calcul du taux de recommandation
            const evaluationsAvecRecommandation = evaluations.filter(e => e.recommande !== null);
            const tauxRecommandation = evaluationsAvecRecommandation.length > 0
                ? Math.round((evaluationsAvecRecommandation.filter(e => e.recommande).length / evaluationsAvecRecommandation.length) * 100)
                : 0;

            const inscriptionAnnees = Math.floor((new Date() - new Date(medecin.user.createdAt)) / (1000 * 60 * 60 * 24 * 365.25));

            // Statistiques d'activité
            const consultationsRealisees = medecin.rendezVous.length;
            const consultationsParType = {
                DOMICILE: medecin.rendezVous.filter(rdv => rdv.typeConsultation === 'DOMICILE').length,
                CLINIQUE: medecin.rendezVous.filter(rdv => rdv.typeConsultation === 'CLINIQUE').length,
                TELECONSULTATION: medecin.rendezVous.filter(rdv => rdv.typeConsultation === 'TELECONSULTATION').length
            };

            // Formatage des évaluations publiques (anonymisées)
            const evaluationsPubliques = evaluations.slice(0, 10).map(evaluation => ({
                note: evaluation.note,
                commentaire: evaluation.commentaire,
                recommande: evaluation.recommande || false,
                date: evaluation.dateEvaluation,
                patientPrenom: evaluation.evaluateur?.prenom ? `${evaluation.evaluateur.prenom.charAt(0)}***` : 'Anonyme'
            }));

            // Organisation des disponibilités par jour
            const horairesParsemaine = {};
            const joursSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
            joursSemaine.forEach(jour => {
                horairesParsemaine[jour] = medecin.disponibilites
                    .filter(d => d.jourSemaine === jour && d.recurrent)
                    .map(d => ({
                        heureDebut: d.heureDebut,
                        heureFin: d.heureFin,
                        typeConsultation: d.typeConsultation
                    }));
            });

            // Parse sécurisé des données JSON
            const parseJsonField = (field, defaultValue = []) => {
                if (!field) return defaultValue;
                if (Array.isArray(field)) return field;
                try {
                    return JSON.parse(field);
                } catch (error) {
                    console.warn(`Erreur parsing JSON pour le champ:`, error);
                    return defaultValue;
                }
            };

            const specialites = parseJsonField(medecin.specialites);
            const diplomes = parseJsonField(medecin.diplomes);
            const certifications = parseJsonField(medecin.certifications);
            const languesParlees = parseJsonField(medecin.languesParlees);

            // Extraction de la spécialité principale
            const specialitePrincipale = specialites.length > 0 ? specialites[0] : null;
            const specialitesSecondaires = specialites.slice(1).map(spec => ({
                nom: spec,
                certifie: true, // À améliorer selon la logique métier
                experienceAnnees: medecin.experienceAnnees || 0
            }));

            // Calcul du prochain créneau disponible (simple)
            const maintenant = new Date();
            const prochainCreneauLibre = medecin.disponibilites.length > 0 ?
                new Date(maintenant.getTime() + 24 * 60 * 60 * 1000) : null; // Demain par défaut

            // Construction de la réponse complète selon le schéma Swagger
            const profilComplet = {
                id: medecin.id,
                informationsPersonnelles: {
                    nom: medecin.user.nom,
                    prenom: medecin.user.prenom,
                    email: medecin.user.email,
                    telephone: medecin.user.telephone
                },
                informationsProfessionnelles: {
                    numeroOrdre: medecin.numeroOrdre,
                    specialitePrincipale: specialitePrincipale,
                    specialitesSecondaires: specialitesSecondaires,
                    biographie: medecin.bio,
                    experienceAnnees: medecin.experienceAnnees || 0,
                    inscriptionPlateforme: inscriptionAnnees,
                    languesParlees: languesParlees
                },
                formation: {
                    diplomes: diplomes,
                    certifications: certifications
                },
                consultations: {
                    clinique: {
                        disponible: medecin.accepteclinique,
                        tarif: medecin.tarifConsultationBase,
                        adresse: medecin.clinique?.adresse,
                        ville: medecin.clinique?.ville,
                        codePostal: medecin.clinique?.codePostal,
                        informationsAcces: medecin.clinique?.informationsAcces
                    },
                    domicile: {
                        disponible: medecin.accepteDomicile,
                        tarif: medecin.tarifConsultationBase ?
                            Math.round(medecin.tarifConsultationBase * TARIF_MULTIPLIERS.DOMICILE) : null,
                        rayonKm: 15, // À configurer selon les préférences médecin
                        fraisDeplacementParKm: 500
                    },
                    teleconsultation: {
                        disponible: medecin.accepteTeleconsultation,
                        tarif: medecin.tarifConsultationBase ?
                            Math.round(medecin.tarifConsultationBase * TARIF_MULTIPLIERS.TELECONSULTATION) : null,
                        plateformesUtilisees: ["Zoom", "Google Meet"] // À récupérer des préférences médecin
                    }
                },
                horaires: horairesParsemaine,
                evaluations: {
                    noteMoyenne: noteMoyenne ? Math.round(noteMoyenne * 10) / 10 : null,
                    nombreTotal: evaluations.length,
                    repartitionNotes,
                    tauxRecommandation,
                    dernières: evaluationsPubliques.slice(0, 5)
                },
                statistiques: {
                    consultationsRealisees,
                    consultationsParType,
                    accepteNouveauxPatients: true, // À déterminer selon la logique métier
                    delaiMoyenReponse: "12h" // À calculer selon les données réelles
                },
                media: {
                    photoProfile: medecin.photoProfile ? (() => {
                        try {
                            const photoData = parseJsonField(medecin.photoProfile, {});
                            return {
                                ...photoData,
                                url: photoData.nom_fichier
                                    ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/photos/profil/${photoData.nom_fichier}`
                                    : null
                            };
                        } catch (e) {
                            console.warn('Erreur parsing photoProfile:', e);
                            return null;
                        }
                    })() : null,
                    photoCabinet: medecin.photoCabinet ? (() => {
                        try {
                            const photoData = parseJsonField(medecin.photoCabinet, {});
                            return {
                                ...photoData,
                                url: photoData.nom_fichier
                                    ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/photos/cabinet/${photoData.nom_fichier}`
                                    : null
                            };
                        } catch (e) {
                            console.warn('Erreur parsing photoCabinet:', e);
                            return null;
                        }
                    })() : null,
                    videoPresentation: medecin.videoPresentation
                },
                disponibilite: {
                    statut: medecin.disponibilites.length > 0 ? 'DISPONIBLE' : 'COMPLET',
                    message: null,
                    prochainCreneauLibre: prochainCreneauLibre
                }
            };

            return ApiResponse.success(res, 'Profil médecin récupéré avec succès', profilComplet);

        } catch (error) {
            console.error('❌ Erreur récupération profil médecin:', error);

            // Gestion des erreurs spécifiques
            if (error.code === 'P2025') {
                return ApiResponse.notFound(res, 'Médecin non trouvé');
            }

            return ApiResponse.serverError(res, 'Erreur lors de la récupération du profil médecin');
        }
    }
);

module.exports = router;