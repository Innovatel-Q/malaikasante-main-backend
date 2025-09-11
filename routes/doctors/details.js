const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /doctors/:id/details - Profil détaillé d'un médecin
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            const medecinId = req.params.id;
            
            console.log('🔍 Route details - ID reçu:', medecinId);
            console.log('🔍 Route details - Params complets:', req.params);
            
            if (!medecinId) {
                return ApiResponse.badRequest(res, 'ID du médecin requis');
            }

            // Vérification de l'existence du médecin
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
                            nom: true,
                            adresse: true,
                            ville: true,
                            telephone: true,
                            latitude: true,
                            longitude: true
                        }
                    },
                    rendezVous: {
                        where: {
                            statut: 'TERMINE',
                            createdAt: {
                                gte: new Date(new Date().getFullYear() - 1, 0, 1) // 12 derniers mois
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

            // Récupération des évaluations séparément
            const evaluations = await prisma.evaluation.findMany({
                where: {
                    evalueUserId: medecin.userId,
                    typeEvaluation: 'PATIENT_EVALUE_MEDECIN',
                    visible: true
                },
                select: {
                    note: true,
                    commentaire: true,
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
                take: 10
            });

            // Calcul des statistiques d'évaluation
            const noteMoyenne = evaluations.length > 0
                ? evaluations.reduce((sum, evaluation) => sum + evaluation.note, 0) / evaluations.length
                : null;

            const repartitionNotes = {
                5: evaluations.filter(e => e.note === 5).length,
                4: evaluations.filter(e => e.note === 4).length,
                3: evaluations.filter(e => e.note === 3).length,
                2: evaluations.filter(e => e.note === 2).length,
                1: evaluations.filter(e => e.note === 1).length
            };

            const inscriptionAnnees = Math.floor((new Date() - new Date(medecin.user.createdAt)) / (1000 * 60 * 60 * 24 * 365.25));

            // Statistiques d'activité
            const consultationsRealisees = medecin.rendezVous.length;
            const consultationsParType = {
                DOMICILE: medecin.rendezVous.filter(rdv => rdv.typeConsultation === 'DOMICILE').length,
                CLINIQUE: medecin.rendezVous.filter(rdv => rdv.typeConsultation === 'CLINIQUE').length,
                TELECONSULTATION: medecin.rendezVous.filter(rdv => rdv.typeConsultation === 'TELECONSULTATION').length
            };

            // Formatage des évaluations publiques (anonymisées)
            const evaluationsPubliques = evaluations.map(evaluation => ({
                note: evaluation.note,
                commentaire: evaluation.commentaire,
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

            // Parse des données JSON
            const specialites = medecin.specialites ? 
                (Array.isArray(medecin.specialites) ? medecin.specialites : JSON.parse(medecin.specialites || '[]'))
                : [];
            
            const diplomes = medecin.diplomes ? 
                (Array.isArray(medecin.diplomes) ? medecin.diplomes : JSON.parse(medecin.diplomes || '[]'))
                : [];
            
            const certifications = medecin.certifications ? 
                (Array.isArray(medecin.certifications) ? medecin.certifications : JSON.parse(medecin.certifications || '[]'))
                : [];

            const languesParlees = medecin.languesParlees ? 
                (Array.isArray(medecin.languesParlees) ? medecin.languesParlees : JSON.parse(medecin.languesParlees || '[]'))
                : [];

            // Réponse complète
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
                    specialites: specialites,
                    bio: medecin.bio,
                    experienceAnnees: medecin.experienceAnnees,
                    inscriptionPlateforme: inscriptionAnnees,
                    languesParlees: languesParlees,
                    noteMoyenne: parseFloat(medecin.noteMoyenne) || 0,
                    nombreEvaluations: medecin.nombreEvaluations
                },
                formation: {
                    diplomes: diplomes,
                    certifications: certifications
                },
                consultations: {
                    clinique: {
                        disponible: medecin.accepteclinique,
                        tarif: medecin.tarifConsultationBase,
                        clinique: medecin.clinique
                    },
                    domicile: {
                        disponible: medecin.accepteDomicile,
                        tarif: medecin.tarifConsultationBase ? medecin.tarifConsultationBase * 1.5 : null
                    },
                    teleconsultation: {
                        disponible: medecin.accepteTeleconsultation,
                        tarif: medecin.tarifConsultationBase ? medecin.tarifConsultationBase * 0.8 : null
                    }
                },
                horaires: horairesParsemaine,
                evaluations: {
                    noteMoyenne: noteMoyenne ? Math.round(noteMoyenne * 10) / 10 : null,
                    nombreTotal: evaluations.length,
                    repartitionNotes,
                    dernières: evaluationsPubliques.slice(0, 5)
                },
                statistiques: {
                    consultationsRealisees,
                    consultationsParType
                },
                media: {
                    photoProfile: medecin.photoProfile ? (() => {
                        try {
                            const photoData = typeof medecin.photoProfile === 'string' 
                                ? JSON.parse(medecin.photoProfile) 
                                : medecin.photoProfile;
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
                            const photoData = typeof medecin.photoCabinet === 'string' 
                                ? JSON.parse(medecin.photoCabinet) 
                                : medecin.photoCabinet;
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
                    prochainCreneauLibre: null // À calculer séparément si besoin
                }
            };

            return ApiResponse.success(res, 'Profil médecin récupéré avec succès', profilComplet);

        } catch (error) {
            console.error('❌ Erreur récupération profil médecin:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la récupération du profil médecin');
        }
    }
);

module.exports = router;