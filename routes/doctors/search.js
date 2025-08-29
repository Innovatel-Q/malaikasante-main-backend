const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /doctors/search - Recherche multicritères de médecins validés
 */
router.get('/',
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
                    ? evaluations.reduce((sum, eval) => sum + eval.note, 0) / evaluations.length
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
                    photoProfile: medecin.photoProfile,
                    photoCabinet: medecin.photoCabinet
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