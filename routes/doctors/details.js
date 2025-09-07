const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /doctors/:id/details - Profil détaillé d'un médecin
 */
router.get('/:id',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            const medecinId = req.params.id;

            // Vérification de l'existence du médecin
            const medecin = await prisma.medecin.findUnique({
                where: {
                    id: medecinId,
                    statutValidation: 'VALIDE',
                    statut: 'ACTIF',
                    user: {
                        statut: 'ACTIF'
                    }
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            nom: true,
                            prenom: true,
                            email: true,
                            telephone: true,
                            createdAt: true
                        }
                    },
                    diplomes: {
                        select: {
                            institution: true,
                            diplome: true,
                            specialite: true,
                            anneeObtention: true,
                            pays: true,
                            documentPath: true,
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
                            documentPath: true,
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
                    evaluations: {
                        where: {
                            typeEvaluation: 'PATIENT_EVALUE_MEDECIN'
                        },
                        select: {
                            note: true,
                            commentaire: true,
                            recommande: true,
                            createdAt: true,
                            patient: {
                                select: {
                                    user: {
                                        select: {
                                            prenom: true
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: {
                            createdAt: 'desc'
                        },
                        take: 10 // Dernières 10 évaluations
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
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Médecin non trouvé ou non disponible');
            }

            // Calcul des statistiques
            const evaluations = medecin.evaluations || [];
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

            const nombreRecommandations = evaluations.filter(e => e.recommande === true).length;
            const tauxRecommandation = evaluations.length > 0
                ? Math.round((nombreRecommandations / evaluations.length) * 100)
                : null;

            // Calcul de l'expérience
            const experienceAnnees = medecin.diplomes.length > 0
                ? new Date().getFullYear() - Math.min(...medecin.diplomes.map(d => d.anneeObtention))
                : null;

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
                recommande: evaluation.recommande,
                date: evaluation.createdAt,
                patientPrenom: evaluation.patient?.user?.prenom ? `${evaluation.patient.user.prenom.charAt(0)}***` : 'Anonyme'
            }));

            // Organisation des horaires par jour
            const horairesParsemaine = {};
            const joursSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
            joursSemaine.forEach(jour => {
                horairesParsemaine[jour] = medecin.horairesConsultation
                    .filter(h => h.jourSemaine === jour)
                    .map(h => ({
                        heureDebut: h.heureDebut,
                        heureFin: h.heureFin,
                        typeConsultation: h.typeConsultation
                    }));
            });

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
                    specialitePrincipale: medecin.specialitePrincipale,
                    specialitesSecondaires: medecin.specialites.map(s => ({
                        nom: s.nom,
                        certifie: s.certification,
                        experienceAnnees: s.experienceAnnees
                    })),
                    biographie: medecin.biographie,
                    experienceAnnees,
                    inscriptionPlateforme: inscriptionAnnees,
                    languesParlees: medecin.languesParlees ? medecin.languesParlees.split(',').map(l => l.trim()) : []
                },
                formation: {
                    diplomes: medecin.diplomes.map(d => ({
                        institution: d.institution,
                        diplome: d.diplome,
                        specialite: d.specialite,
                        anneeObtention: d.anneeObtention,
                        pays: d.pays
                    })),
                    certifications: medecin.certifications.map(c => ({
                        nom: c.nom,
                        organisme: c.organisme,
                        dateObtention: c.dateObtention,
                        dateExpiration: c.dateExpiration
                    }))
                },
                consultations: {
                    clinique: {
                        disponible: true,
                        tarif: medecin.tarifConsultationClinique,
                        adresse: medecin.adresseConsultation,
                        ville: medecin.villeConsultation,
                        codePostal: medecin.codePostalConsultation,
                        informationsAcces: medecin.informationsAcces
                    },
                    domicile: {
                        disponible: medecin.consultationDomicile,
                        tarif: medecin.tarifConsultationDomicile,
                        rayonKm: medecin.rayonDeplacementKm,
                        fraisDeplacementParKm: medecin.fraisDeplacementParKm
                    },
                    teleconsultation: {
                        disponible: medecin.teleconsultation,
                        tarif: medecin.tarifTeleconsultation,
                        plateformesUtilisees: medecin.plateformesUtilisees ? medecin.plateformesUtilisees.split(',').map(p => p.trim()) : []
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
                    accepteNouveauxPatients: medecin.accepteNouveauxPatients,
                    delaiMoyenReponse: medecin.delaiMoyenReponse ? `${medecin.delaiMoyenReponse}h` : null
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
                    statut: medecin.accepteNouveauxPatients ? 'DISPONIBLE' : 'COMPLET',
                    message: medecin.messageIndisponibilite,
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