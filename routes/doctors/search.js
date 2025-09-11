const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

/**
 * Calcule la distance entre deux points géographiques (formule Haversine)
 */
function calculerDistanceHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * POST /doctors/recommend - Recommandation intelligente de médecins
 */
router.post('/recommend',
    AuthMiddleware.authenticate(),
    BodyFilter.validate({
        fields: {
            latitude: { type: 'number', min: -90, max: 90 },
            longitude: { type: 'number', min: -180, max: 180 },
            adresse: { type: 'string', maxLength: 500 },
            specialite: { type: 'string', maxLength: 100 },
            typeConsultation: { 
                type: 'string', 
                enum: ['DOMICILE', 'CLINIQUE', 'TELECONSULTATION'] 
            },
            budget: { type: 'number', min: 0, max: 1000000 }
        },
        required: ['latitude', 'longitude', 'typeConsultation'],
        strict: true
    }),
    async (req, res) => {
        try {
            const { latitude, longitude, adresse, specialite, typeConsultation, budget } = req.body;

            // Construction des filtres de base
            const whereConditions = {
                statutValidation: 'VALIDE',
                user: { statut: 'ACTIF' }
            };

            // Filtres spécifiques par type de consultation
            if (typeConsultation === 'DOMICILE') {
                whereConditions.accepteDomicile = true;
            } else if (typeConsultation === 'TELECONSULTATION') {
                whereConditions.accepteTeleconsultation = true;
            } else if (typeConsultation === 'CLINIQUE') {
                whereConditions.accepteclinique = true;
                whereConditions.clinique = {
                    active: true,
                    latitude: { not: null },
                    longitude: { not: null }
                };
            }

            // Filtre par spécialité si spécifiée
            if (specialite) {
                whereConditions.specialites = {
                    path: '$',
                    array_contains: specialite.toUpperCase()
                };
            }

            // Récupération des médecins avec toutes les données nécessaires
            const medecins = await prisma.medecin.findMany({
                where: whereConditions,
                include: {
                    user: {
                        select: {
                            id: true,
                            nom: true,
                            prenom: true,
                            email: true,
                            telephone: true
                        }
                    },
                    clinique: {
                        select: {
                            nom: true,
                            adresse: true,
                            ville: true,
                            latitude: true,
                            longitude: true
                        }
                    },
                    rendezVous: {
                        where: {
                            statut: { in: ['CONFIRME', 'TERMINE'] },
                            dateRendezVous: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
                        },
                        select: { id: true }
                    },
                    disponibilites: {
                        where: {
                            bloque: false,
                            typeConsultation: typeConsultation,
                            OR: [
                                { recurrent: true },
                                { dateSpecifique: { gte: new Date() } }
                            ]
                        },
                        select: { id: true, jourSemaine: true, heureDebut: true, heureFin: true }
                    }
                }
            });

            // Récupération des évaluations pour chaque médecin
            const medecinIds = medecins.map(m => m.id);
            const evaluations = await prisma.evaluation.findMany({
                where: {
                    evalueUserId: { in: medecins.map(m => m.userId) },
                    typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                },
                select: {
                    evalueUserId: true,
                    note: true
                }
            });

            // Calcul des scores et recommandations
            const recommendations = medecins.map(medecin => {
                // Calcul de la distance
                let distance = null;
                let distanceScore = 0;
                
                if (typeConsultation === 'CLINIQUE' && medecin.clinique?.latitude && medecin.clinique?.longitude) {
                    distance = calculerDistanceHaversine(
                        latitude, longitude,
                        parseFloat(medecin.clinique.latitude),
                        parseFloat(medecin.clinique.longitude)
                    );
                    // Score distance (plus proche = meilleur) - max 10 points
                    distanceScore = Math.max(0, 10 - (distance / 2));
                } else if (typeConsultation === 'TELECONSULTATION') {
                    distanceScore = 10; // Distance n'importe pas pour téléconsultation
                } else if (typeConsultation === 'DOMICILE') {
                    // Pour domicile, on considère une distance moyenne de 5km
                    distance = 5;
                    distanceScore = 8;
                }

                // Calcul de la note moyenne
                const medecinEvaluations = evaluations.filter(e => e.evalueUserId === medecin.userId);
                const noteMoyenne = medecinEvaluations.length > 0
                    ? medecinEvaluations.reduce((sum, e) => sum + e.note, 0) / medecinEvaluations.length
                    : 0;
                const noteScore = (noteMoyenne / 5) * 10; // Conversion sur 10

                // Score d'expérience
                const experienceScore = Math.min(10, (medecin.experienceAnnees || 0) / 2);

                // Score de disponibilité
                const disponibiliteScore = medecin.disponibilites.length > 0 ? 10 : 0;

                // Score budget (si spécifié)
                let budgetScore = 10;
                const tarif = typeConsultation === 'DOMICILE' ? medecin.tarifConsultationBase * 1.5 :
                             typeConsultation === 'TELECONSULTATION' ? medecin.tarifConsultationBase * 0.8 :
                             medecin.tarifConsultationBase;
                
                if (budget && tarif) {
                    if (tarif <= budget) {
                        budgetScore = 10;
                    } else if (tarif <= budget * 1.2) {
                        budgetScore = 7;
                    } else {
                        budgetScore = 3;
                    }
                }

                // Score spécialité
                let specialiteScore = 5; // Score neutre
                if (specialite && medecin.specialites) {
                    const specialitesMedecin = Array.isArray(medecin.specialites) 
                        ? medecin.specialites 
                        : JSON.parse(medecin.specialites || '[]');
                    
                    if (specialitesMedecin.includes(specialite.toUpperCase())) {
                        specialiteScore = 10;
                    }
                }

                // Calcul du score final pondéré
                const scoreTotal = (
                    distanceScore * 0.25 +      // 25% pour la distance
                    noteScore * 0.25 +          // 25% pour la note
                    experienceScore * 0.20 +    // 20% pour l'expérience
                    disponibiliteScore * 0.15 + // 15% pour la disponibilité
                    budgetScore * 0.10 +        // 10% pour le budget
                    specialiteScore * 0.05      // 5% pour la spécialité
                );

                // Calcul du tarif estimé
                const tarifEstime = tarif || medecin.tarifConsultationBase || 0;

                return {
                    id: medecin.id,
                    nom: medecin.user.nom,
                    prenom: medecin.user.prenom,
                    specialites: Array.isArray(medecin.specialites) 
                        ? medecin.specialites 
                        : JSON.parse(medecin.specialites || '[]'),
                    experienceAnnees: medecin.experienceAnnees,
                    noteMoyenne: Math.round(noteMoyenne * 10) / 10,
                    nombreEvaluations: medecinEvaluations.length,
                    photoProfile: medecin.photoProfile ? (() => {
                        try {
                            const photoData = typeof medecin.photoProfile === 'string' 
                                ? JSON.parse(medecin.photoProfile) 
                                : medecin.photoProfile;
                            return photoData.nom_fichier 
                                ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/photos/profil/${photoData.nom_fichier}`
                                : null;
                        } catch (e) {
                            return null;
                        }
                    })() : null,
                    bio: medecin.bio,
                    score: Math.round(scoreTotal * 10) / 10,
                    tarifEstime,
                    disponible: medecin.disponibilites.length > 0,
                    clinique: typeConsultation === 'CLINIQUE' ? medecin.clinique : null
                };
            });

            // Tri par score décroissant et sélection du top 3
            const topRecommendations = recommendations
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            // Détermination des raisons de mise en avant pour chaque recommandation
            const recommendationsFinales = topRecommendations.map((rec, index) => {
                const raisons = [];

                // Critères spécifiques pour chaque médecin
                if (rec.noteMoyenne >= 4.5) {
                    raisons.push("Excellentes évaluations patients");
                }
                if (rec.experienceAnnees >= 10) {
                    raisons.push("Grande expérience");
                }
                if (budget && rec.tarifEstime <= budget * 0.8) {
                    raisons.push("Tarif très abordable");
                }
                if (specialite && rec.specialites.includes(specialite.toUpperCase())) {
                    raisons.push("Spécialiste exact recherché");
                }
                if (rec.disponible) {
                    raisons.push("Disponible rapidement");
                }

                // Raisons par position si pas de critères spécifiques
                let raisonMiseEnAvant = "Médecin qualifié";
                if (raisons.length > 0) {
                    raisonMiseEnAvant = raisons.join(" • ");
                } else {
                    // Raisons de fallback selon la position
                    if (index === 0) {
                        raisonMiseEnAvant = "Meilleur score global";
                    } else if (index === 1) {
                        raisonMiseEnAvant = "Excellent choix alternatif";
                    } else if (index === 2) {
                        raisonMiseEnAvant = "Option complémentaire recommandée";
                    }
                }

                return {
                    ...rec,
                    highlighted: index === 0,
                    raisonMiseEnAvant
                };
            });

            return ApiResponse.success(res, 'Recommandations générées avec succès', {
                recommendations: recommendationsFinales
            });

        } catch (error) {
            console.error('❌ Erreur recommandation médecins:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la génération des recommandations');
        }
    }
);

/**
 * GET /doctors/search - Recherche multicritères de médecins validés (ancienne version)
 */
router.get('/search',
    AuthMiddleware.authenticate(),
    async (req, res) => {
        try {
            const {
                specialite,
                ville,
                disponible,
                tarifMin,
                tarifMax,
                noteMin,
                domicile,
                teleconsultation,
                page = 1,
                limit = 20,
                sortBy = 'note',
                sortOrder = 'desc'
            } = req.query;

            const pageInt = parseInt(page);
            const limitInt = Math.min(parseInt(limit), 50); // Max 50 résultats par page
            const offset = (pageInt - 1) * limitInt;

            // Construction des filtres Prisma
            const where = {
                statut: 'ACTIF',
                statutValidation: 'VALIDE',
                user: {
                    statut: 'ACTIF'
                }
            };

            // Filtres par spécialité
            if (specialite) {
                where.specialitePrincipale = {
                    contains: specialite,
                    mode: 'insensitive'
                };
            }

            // Filtres par ville
            if (ville) {
                where.OR = [
                    {
                        villeConsultation: {
                            contains: ville,
                            mode: 'insensitive'
                        }
                    },
                    {
                        user: {
                            patient: {
                                ville: {
                                    contains: ville,
                                    mode: 'insensitive'
                                }
                            }
                        }
                    }
                ];
            }

            // Filtres par tarifs
            if (tarifMin || tarifMax) {
                where.tarifConsultationClinique = {};
                if (tarifMin) {
                    where.tarifConsultationClinique.gte = parseFloat(tarifMin);
                }
                if (tarifMax) {
                    where.tarifConsultationClinique.lte = parseFloat(tarifMax);
                }
            }

            // Filtres par services
            if (domicile === 'true') {
                where.consultationDomicile = true;
            }
            if (teleconsultation === 'true') {
                where.teleconsultation = true;
            }

            // Requête principale avec comptage
            const [medecins, totalCount] = await Promise.all([
                prisma.medecin.findMany({
                    where,
                    include: {
                        user: {
                            select: {
                                id: true,
                                nom: true,
                                prenom: true,
                                email: true,
                                telephone: true
                            }
                        },
                        diplomes: {
                            select: {
                                institution: true,
                                anneeObtention: true,
                                specialite: true
                            }
                        },
                        specialites: {
                            select: {
                                nom: true,
                                certification: true
                            }
                        },
                        evaluations: {
                            where: {
                                typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                            },
                            select: {
                                note: true
                            }
                        }
                    },
                    skip: offset,
                    take: limitInt,
                    orderBy: sortBy === 'note' ? undefined : { [sortBy]: sortOrder }
                }),
                prisma.medecin.count({ where })
            ]);

            // Calcul des statistiques pour chaque médecin
            const medecinEnriches = medecins.map(medecin => {
                // Calcul de la note moyenne
                const evaluations = medecin.evaluations || [];
                const noteMoyenne = evaluations.length > 0
                    ? evaluations.reduce((sum, evaluation) => sum + evaluation.note, 0) / evaluations.length
                    : null;

                // Filtrage par note si spécifié
                if (noteMin && noteMoyenne && noteMoyenne < parseFloat(noteMin)) {
                    return null;
                }

                // Calcul de l'expérience
                const experienceAnnees = medecin.diplomes.length > 0
                    ? new Date().getFullYear() - Math.min(...medecin.diplomes.map(d => d.anneeObtention))
                    : null;

                return {
                    id: medecin.id,
                    user: medecin.user,
                    specialitePrincipale: medecin.specialitePrincipale,
                    specialitesSecondaires: medecin.specialites.map(s => s.nom),
                    experienceAnnees,
                    noteMoyenne: noteMoyenne ? Math.round(noteMoyenne * 10) / 10 : null,
                    nombreEvaluations: evaluations.length,
                    // Informations sur les consultations
                    consultations: {
                        clinique: {
                            disponible: true,
                            tarif: medecin.tarifConsultationClinique,
                            adresse: medecin.adresseConsultation,
                            ville: medecin.villeConsultation
                        },
                        domicile: {
                            disponible: medecin.consultationDomicile,
                            tarif: medecin.tarifConsultationDomicile,
                            rayonKm: medecin.rayonDeplacementKm
                        },
                        teleconsultation: {
                            disponible: medecin.teleconsultation,
                            tarif: medecin.tarifTeleconsultation
                        }
                    },
                    // Disponibilité
                    disponible: medecin.accepteNouveauxPatients && medecin.statut === 'ACTIF',
                    prochainCreneauDisponible: null, // À calculer si nécessaire
                    // Informations professionnelles
                    numeroOrdre: medecin.numeroOrdre,
                    biographie: medecin.biographie,
                    languessParlees: medecin.languesParlees ? medecin.languesParlees.split(',') : [],
                    // Certifications
                    certifie: medecin.diplomes.some(d => d.certification === true),
                    // Photos/images
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
                    })() : null
                };
            }).filter(Boolean); // Supprime les médecins filtrés par note

            // Tri par note si demandé
            if (sortBy === 'note') {
                medecinEnriches.sort((a, b) => {
                    const noteA = a.noteMoyenne || 0;
                    const noteB = b.noteMoyenne || 0;
                    return sortOrder === 'desc' ? noteB - noteA : noteA - noteB;
                });
            }

            // Métadonnées de pagination
            const totalPages = Math.ceil(totalCount / limitInt);
            const hasNext = pageInt < totalPages;
            const hasPrevious = pageInt > 1;

            return ApiResponse.success(res, 'Recherche effectuée avec succès', {
                medecins: medecinEnriches,
                pagination: {
                    page: pageInt,
                    limit: limitInt,
                    totalResults: totalCount,
                    totalPages,
                    hasNext,
                    hasPrevious,
                    nextPage: hasNext ? pageInt + 1 : null,
                    previousPage: hasPrevious ? pageInt - 1 : null
                },
                filters: {
                    specialite: specialite || null,
                    ville: ville || null,
                    tarifMin: tarifMin ? parseFloat(tarifMin) : null,
                    tarifMax: tarifMax ? parseFloat(tarifMax) : null,
                    noteMin: noteMin ? parseFloat(noteMin) : null,
                    domicile: domicile === 'true',
                    teleconsultation: teleconsultation === 'true',
                    sortBy,
                    sortOrder
                },
                statistics: {
                    totalMedecinsDisponibles: totalCount,
                    medecinAvecDomicile: medecinEnriches.filter(m => m.consultations.domicile.disponible).length,
                    medecinAvecTeleconsultation: medecinEnriches.filter(m => m.consultations.teleconsultation.disponible).length,
                    noteMoyenneMoyenne: medecinEnriches.length > 0
                        ? Math.round((medecinEnriches.reduce((sum, m) => sum + (m.noteMoyenne || 0), 0) / medecinEnriches.length) * 10) / 10
                        : null
                }
            });

        } catch (error) {
            console.error('❌ Erreur recherche médecins:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la recherche des médecins');
        }
    }
);

module.exports = router;