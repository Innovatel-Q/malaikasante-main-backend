const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /patients/medical-data - Consulter les données médicales sensibles
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`🏥 Consultation données médicales: ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Récupération des données médicales avec audit
            const patient = await prisma.patient.findUnique({
                where: { userId: user.id },
                select: {
                    id: true,
                    // Données médicales sensibles
                    allergies: true,
                    antecedentsMedicaux: true,
                    traitementsEnCours: true,
                    groupeSanguin: true,
                    poids: true,
                    taille: true,
                    dateNaissance: true,
                    sexe: true,

                    // Informations d'assurance
                    assuranceMedicale: true,
                    numeroAssurance: true,

                    // Contact d'urgence
                    contactUrgence: true,

                    // Relations pour historique médical
                    rendezVous: {
                        where: {
                            statut: 'TERMINE'
                        },
                        select: {
                            id: true,
                            dateHeureDebut: true,
                            typeConsultation: true,
                            motifConsultation: true,
                            medecin: {
                                select: {
                                    user: {
                                        select: {
                                            nom: true,
                                            prenom: true
                                        }
                                    },
                                    specialitePrincipale: true
                                }
                            }
                        },
                        orderBy: {
                            dateHeureDebut: 'desc'
                        },
                        take: 10 // 10 dernières consultations
                    },

                    // Consultations détaillées avec diagnostic
                    user: {
                        select: {
                            nom: true,
                            prenom: true,
                            telephone: true,
                            email: true
                        }
                    }
                }
            });

            if (!patient) {
                return ApiResponse.notFound(res, 'Profil patient non trouvé');
            }

            // Récupération des consultations détaillées
            const consultations = await prisma.consultation.findMany({
                where: {
                    rendezVous: {
                        patientId: patient.id,
                        statut: 'TERMINE'
                    }
                },
                select: {
                    id: true,
                    diagnostic: true,
                    traitementPrescrit: true,
                    recommandations: true,
                    prochainRendezVous: true,
                    documentsJoints: true,
                    notesPrivees: true, // Chiffrées côté base
                    createdAt: true,
                    rendezVous: {
                        select: {
                            dateHeureDebut: true,
                            medecin: {
                                select: {
                                    user: {
                                        select: {
                                            nom: true,
                                            prenom: true
                                        }
                                    },
                                    specialitePrincipale: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 20
            });

            // Récupération des prescriptions/ordonnances
            const prescriptions = await prisma.ordonnance.findMany({
                where: {
                    consultation: {
                        rendezVous: {
                            patientId: patient.id
                        }
                    }
                },
                select: {
                    id: true,
                    medicaments: true,
                    posologie: true,
                    dureeTraitement: true,
                    instructions: true,
                    dateEmission: true,
                    dateExpiration: true,
                    statut: true,
                    consultation: {
                        select: {
                            rendezVous: {
                                select: {
                                    dateHeureDebut: true,
                                    medecin: {
                                        select: {
                                            user: {
                                                select: {
                                                    nom: true,
                                                    prenom: true
                                                }
                                            },
                                            numeroOrdre: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    dateEmission: 'desc'
                },
                take: 15
            });

            // Calculs dérivés sur les données médicales
            let calculsMedicaux = {};

            // Calcul IMC et classification
            if (patient.poids && patient.taille) {
                const imc = patient.poids / Math.pow(patient.taille / 100, 2);
                calculsMedicaux.imc = Math.round(imc * 10) / 10;
                
                if (imc < 18.5) {
                    calculsMedicaux.classificationIMC = 'Insuffisance pondérale';
                    calculsMedicaux.risqueMedical = 'Faible à modéré';
                } else if (imc < 25) {
                    calculsMedicaux.classificationIMC = 'Poids normal';
                    calculsMedicaux.risqueMedical = 'Faible';
                } else if (imc < 30) {
                    calculsMedicaux.classificationIMC = 'Surpoids';
                    calculsMedicaux.risqueMedical = 'Modéré';
                } else if (imc < 35) {
                    calculsMedicaux.classificationIMC = 'Obésité classe I';
                    calculsMedicaux.risqueMedical = 'Élevé';
                } else if (imc < 40) {
                    calculsMedicaux.classificationIMC = 'Obésité classe II';
                    calculsMedicaux.risqueMedical = 'Très élevé';
                } else {
                    calculsMedicaux.classificationIMC = 'Obésité classe III';
                    calculsMedicaux.risqueMedical = 'Extrême';
                }
            }

            // Calcul de l'âge
            if (patient.dateNaissance) {
                const age = Math.floor((new Date() - new Date(patient.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000));
                calculsMedicaux.age = age;
                
                // Catégorie d'âge médicale
                if (age < 18) {
                    calculsMedicaux.categorieAge = 'Pédiatrique';
                } else if (age < 65) {
                    calculsMedicaux.categorieAge = 'Adulte';
                } else {
                    calculsMedicaux.categorieAge = 'Senior';
                }
            }

            // Analyse des tendances de santé
            const analysesTendances = {
                nombreConsultations: consultations.length,
                dernièreConsultation: consultations.length > 0 ? consultations[0].createdAt : null,
                frequenceConsultations: consultations.length > 0 ? 
                    Math.round((consultations.length / 12) * 10) / 10 : 0, // par mois sur les 12 derniers
                specialitesConsultees: [...new Set(patient.rendezVous.map(rdv => rdv.medecin.specialitePrincipale))],
                prescriptionsActives: prescriptions.filter(p => p.statut === 'ACTIVE' && new Date(p.dateExpiration) > new Date()).length
            };

            // Alertes médicales
            const alertesMedicales = [];
            
            if (patient.allergies && patient.allergies.toLowerCase().includes('pénicilline')) {
                alertesMedicales.push({
                    type: 'ALLERGIE_MAJEURE',
                    message: 'Allergie à la pénicilline détectée',
                    niveau: 'CRITIQUE'
                });
            }

            if (calculsMedicaux.imc && calculsMedicaux.imc > 30) {
                alertesMedicales.push({
                    type: 'FACTEUR_RISQUE',
                    message: 'IMC élevé - Risque cardiovasculaire accru',
                    niveau: 'ATTENTION'
                });
            }

            if (prescriptions.filter(p => p.statut === 'ACTIVE').length > 5) {
                alertesMedicales.push({
                    type: 'POLYMEDICATION',
                    message: 'Nombreux traitements actifs - Risque d\'interactions',
                    niveau: 'SURVEILLANCE'
                });
            }

            // Réponse structurée
            const donneesMediales = {
                patient: {
                    identite: {
                        nom: patient.user.nom,
                        prenom: patient.user.prenom,
                        age: calculsMedicaux.age,
                        sexe: patient.sexe,
                        groupeSanguin: patient.groupeSanguin
                    },
                    contact: {
                        telephone: patient.user.telephone,
                        email: patient.user.email,
                        contactUrgence: patient.contactUrgence
                    }
                },

                donneesAnthropometriques: {
                    poids: patient.poids,
                    taille: patient.taille,
                    imc: calculsMedicaux.imc,
                    classificationIMC: calculsMedicaux.classificationIMC,
                    risqueMedical: calculsMedicaux.risqueMedical
                },

                antecedentsMedicaux: {
                    allergies: patient.allergies || 'Aucune allergie connue',
                    antecedents: patient.antecedentsMedicaux || 'Aucun antécédent connu',
                    traitementsActuels: patient.traitementsEnCours || 'Aucun traitement en cours'
                },

                assurance: {
                    nom: patient.assuranceMedicale,
                    numero: patient.numeroAssurance,
                    statut: patient.assuranceMedicale ? 'ASSURE' : 'NON_ASSURE'
                },

                historiqueConsultations: patient.rendezVous.map(rdv => ({
                    date: rdv.dateHeureDebut,
                    medecin: `Dr ${rdv.medecin.user.prenom} ${rdv.medecin.user.nom}`,
                    specialite: rdv.medecin.specialitePrincipale,
                    type: rdv.typeConsultation,
                    motif: rdv.motifConsultation
                })),

                consultationsDetaillees: consultations.map(consultation => ({
                    id: consultation.id,
                    date: consultation.rendezVous.dateHeureDebut,
                    medecin: `Dr ${consultation.rendezVous.medecin.user.prenom} ${consultation.rendezVous.medecin.user.nom}`,
                    specialite: consultation.rendezVous.medecin.specialitePrincipale,
                    diagnostic: consultation.diagnostic,
                    traitement: consultation.traitementPrescrit,
                    recommandations: consultation.recommandations,
                    prochainRdv: consultation.prochainRendezVous,
                    documentsJoints: consultation.documentsJoints ? consultation.documentsJoints.split(',') : []
                })),

                prescriptions: prescriptions.map(prescription => ({
                    id: prescription.id,
                    dateEmission: prescription.dateEmission,
                    dateExpiration: prescription.dateExpiration,
                    medecin: `Dr ${prescription.consultation.rendezVous.medecin.user.prenom} ${prescription.consultation.rendezVous.medecin.user.nom}`,
                    numeroOrdreMedecin: prescription.consultation.rendezVous.medecin.numeroOrdre,
                    medicaments: prescription.medicaments,
                    posologie: prescription.posologie,
                    duree: prescription.dureeTraitement,
                    instructions: prescription.instructions,
                    statut: prescription.statut
                })),

                analyses: {
                    tendances: analysesTendances,
                    alertes: alertesMedicales,
                    calculsMedicaux
                },

                confidentialite: {
                    niveauAcces: 'PATIENT_COMPLET',
                    derniereConsultation: new Date().toISOString(),
                    audit: {
                        consultePar: user.id,
                        adresseIP: clientIp,
                        timestamp: new Date().toISOString()
                    }
                }
            };

            // Création d'un log d'audit pour l'accès aux données médicales sensibles
            await prisma.auditAccesDonnees.create({
                data: {
                    userId: user.id,
                    typeAcces: 'CONSULTATION_DONNEES_MEDICALES',
                    ressourceAccedee: 'medical-data',
                    adresseIP: clientIp,
                    userAgent: req.get('User-Agent') || 'Unknown',
                    timestamp: new Date()
                }
            }).catch(error => {
                // L'audit n'est pas critique, on log juste l'erreur
                console.warn('⚠️ Erreur création audit:', error.message);
            });

            console.log(`✅ Données médicales consultées: ${patient.user.prenom} ${patient.user.nom} - Consultations: ${consultations.length}, Prescriptions: ${prescriptions.length}`);

            return ApiResponse.success(res, 'Données médicales récupérées avec succès', donneesMediales);

        } catch (error) {
            console.error('❌ Erreur consultation données médicales:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la consultation des données médicales');
        }
    }
);

module.exports = router;