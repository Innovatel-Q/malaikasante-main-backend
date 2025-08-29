const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /doctors/:id/available-slots - Créneaux disponibles d'un médecin
 */
router.get('/:id',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            const medecinId = req.params.id;
            const {
                dateDebut,
                dateFin,
                typeConsultation = 'CLINIQUE',
                dureeConsultation = 30
            } = req.query;

            // Validation des paramètres
            if (!dateDebut) {
                return ApiResponse.badRequest(res, 'Date de début requise');
            }

            const debut = new Date(dateDebut);
            const fin = dateFin ? new Date(dateFin) : new Date(debut.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 jours par défaut

            if (debut < new Date()) {
                return ApiResponse.badRequest(res, 'La date de début ne peut pas être dans le passé');
            }

            if (fin <= debut) {
                return ApiResponse.badRequest(res, 'La date de fin doit être postérieure à la date de début');
            }

            // Limiter la plage à 30 jours maximum
            const maxDate = new Date(debut.getTime() + (30 * 24 * 60 * 60 * 1000));
            if (fin > maxDate) {
                return ApiResponse.badRequest(res, 'La plage de dates ne peut pas dépasser 30 jours');
            }

            // Vérification de l'existence du médecin
            const medecin = await prisma.medecin.findUnique({
                where: {
                    id: medecinId,
                    statutValidation: 'VALIDE',
                    statut: 'ACTIF',
                    accepteNouveauxPatients: true
                },
                include: {
                    user: {
                        select: {
                            nom: true,
                            prenom: true
                        }
                    },
                    horairesConsultation: {
                        where: {
                            actif: true,
                            typeConsultation: typeConsultation
                        },
                        select: {
                            jourSemaine: true,
                            heureDebut: true,
                            heureFin: true,
                            dureeConsultation: true
                        }
                    },
                    conges: {
                        where: {
                            OR: [
                                {
                                    dateDebut: { lte: fin },
                                    dateFin: { gte: debut }
                                }
                            ]
                        },
                        select: {
                            dateDebut: true,
                            dateFin: true,
                            motif: true
                        }
                    }
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Médecin non trouvé ou non disponible pour de nouveaux patients');
            }

            // Vérification que le médecin propose le type de consultation demandé
            const consultationAutorisee = {
                'CLINIQUE': true,
                'DOMICILE': medecin.consultationDomicile,
                'TELECONSULTATION': medecin.teleconsultation
            };

            if (!consultationAutorisee[typeConsultation]) {
                return ApiResponse.badRequest(res, `Le médecin ne propose pas de consultation de type ${typeConsultation}`);
            }

            // Récupérer tous les rendez-vous existants dans la période
            const rendezVousExistants = await prisma.rendezVous.findMany({
                where: {
                    medecinId: medecinId,
                    dateHeureDebut: {
                        gte: debut,
                        lt: fin
                    },
                    statut: {
                        in: ['CONFIRME', 'EN_ATTENTE', 'DEMANDE']
                    }
                },
                select: {
                    dateHeureDebut: true,
                    dateHeureFin: true,
                    typeConsultation: true
                }
            });

            // Créer une map des jours de la semaine
            const joursMap = {
                0: 'DIMANCHE',
                1: 'LUNDI',
                2: 'MARDI',
                3: 'MERCREDI',
                4: 'JEUDI',
                5: 'VENDREDI',
                6: 'SAMEDI'
            };

            // Générer les créneaux disponibles
            const creneauxDisponibles = [];
            const dureeMs = parseInt(dureeConsultation) * 60 * 1000;

            for (let currentDate = new Date(debut); currentDate < fin; currentDate.setDate(currentDate.getDate() + 1)) {
                const jourSemaine = joursMap[currentDate.getDay()];
                
                // Vérifier si le médecin travaille ce jour-là
                const horairesJour = medecin.horairesConsultation.filter(h => h.jourSemaine === jourSemaine);
                if (horairesJour.length === 0) continue;

                // Vérifier les congés
                const estEnConge = medecin.conges.some(conge => {
                    const dateCongeDebut = new Date(conge.dateDebut);
                    const dateCongeFin = new Date(conge.dateFin);
                    return currentDate >= dateCongeDebut && currentDate <= dateCongeFin;
                });

                if (estEnConge) continue;

                // Pour chaque plage horaire du jour
                for (const horaire of horairesJour) {
                    const [heureDebut, minuteDebut] = horaire.heureDebut.split(':').map(Number);
                    const [heureFin, minuteFin] = horaire.heureFin.split(':').map(Number);

                    const debutPlage = new Date(currentDate);
                    debutPlage.setHours(heureDebut, minuteDebut, 0, 0);

                    const finPlage = new Date(currentDate);
                    finPlage.setHours(heureFin, minuteFin, 0, 0);

                    // Générer les créneaux dans cette plage
                    for (let creneau = new Date(debutPlage); creneau < finPlage; creneau = new Date(creneau.getTime() + dureeMs)) {
                        const finCreneau = new Date(creneau.getTime() + dureeMs);
                        
                        // Ne pas dépasser la fin de la plage horaire
                        if (finCreneau > finPlage) break;

                        // Ne pas proposer de créneau dans le passé (avec marge de 2h)
                        const maintenant = new Date();
                        const margeMinimale = new Date(maintenant.getTime() + (2 * 60 * 60 * 1000));
                        if (creneau < margeMinimale) continue;

                        // Vérifier qu'il n'y a pas de conflit avec un RDV existant
                        const conflit = rendezVousExistants.some(rdv => {
                            const debutRdv = new Date(rdv.dateHeureDebut);
                            const finRdv = new Date(rdv.dateHeureFin);
                            return (creneau < finRdv && finCreneau > debutRdv);
                        });

                        if (!conflit) {
                            // Calculer le tarif selon le type de consultation
                            let tarif = 0;
                            switch (typeConsultation) {
                                case 'CLINIQUE':
                                    tarif = medecin.tarifConsultationClinique;
                                    break;
                                case 'DOMICILE':
                                    tarif = medecin.tarifConsultationDomicile;
                                    break;
                                case 'TELECONSULTATION':
                                    tarif = medecin.tarifTeleconsultation;
                                    break;
                            }

                            creneauxDisponibles.push({
                                dateHeureDebut: creneau.toISOString(),
                                dateHeureFin: finCreneau.toISOString(),
                                jour: jourSemaine,
                                date: creneau.toISOString().split('T')[0],
                                heure: creneau.toTimeString().substr(0, 5),
                                dureeMinutes: parseInt(dureeConsultation),
                                typeConsultation,
                                tarif,
                                disponible: true,
                                urgence: false // Pourrait être calculé selon la proximité
                            });
                        }
                    }
                }
            }

            // Organiser par dates
            const creneauxParDate = {};
            creneauxDisponibles.forEach(creneau => {
                const date = creneau.date;
                if (!creneauxParDate[date]) {
                    creneauxParDate[date] = [];
                }
                creneauxParDate[date].push(creneau);
            });

            // Trier les créneaux
            Object.keys(creneauxParDate).forEach(date => {
                creneauxParDate[date].sort((a, b) => new Date(a.dateHeureDebut) - new Date(b.dateHeureDebut));
            });

            // Statistiques
            const statistiques = {
                totalCreneaux: creneauxDisponibles.length,
                periodeAnalysee: {
                    debut: debut.toISOString(),
                    fin: fin.toISOString(),
                    nombreJours: Math.ceil((fin - debut) / (24 * 60 * 60 * 1000))
                },
                repartitionParJour: {},
                prochainCreneauDisponible: creneauxDisponibles.length > 0 ? creneauxDisponibles[0] : null,
                moyenneCreneauxParJour: Math.round(creneauxDisponibles.length / Math.ceil((fin - debut) / (24 * 60 * 60 * 1000)) * 10) / 10
            };

            // Calcul de la répartition par jour
            Object.keys(creneauxParDate).forEach(date => {
                const jourSemaine = joursMap[new Date(date).getDay()];
                if (!statistiques.repartitionParJour[jourSemaine]) {
                    statistiques.repartitionParJour[jourSemaine] = 0;
                }
                statistiques.repartitionParJour[jourSemaine] += creneauxParDate[date].length;
            });

            // Informations sur le médecin et la consultation
            const informationsConsultation = {
                medecin: {
                    id: medecin.id,
                    nom: medecin.user.nom,
                    prenom: medecin.user.prenom,
                    specialite: medecin.specialitePrincipale
                },
                typeConsultation,
                tarif: {
                    montant: typeConsultation === 'CLINIQUE' ? medecin.tarifConsultationClinique :
                            typeConsultation === 'DOMICILE' ? medecin.tarifConsultationDomicile :
                            medecin.tarifTeleconsultation,
                    devise: 'XOF',
                    inclut: typeConsultation === 'DOMICILE' ? 'Frais de déplacement non inclus' : 'Consultation complète'
                },
                dureeConsultation: parseInt(dureeConsultation),
                conditions: {
                    annulationGratuite: '24h avant le RDV',
                    confirmationRequise: true,
                    delaiReponseMax: `${medecin.delaiMoyenReponse || 24}h`
                }
            };

            return ApiResponse.success(res, 'Créneaux disponibles récupérés avec succès', {
                informationsConsultation,
                creneauxDisponibles: creneauxParDate,
                statistiques,
                filtres: {
                    dateDebut: debut.toISOString(),
                    dateFin: fin.toISOString(),
                    typeConsultation,
                    dureeConsultation: parseInt(dureeConsultation)
                }
            });

        } catch (error) {
            console.error('❌ Erreur récupération créneaux disponibles:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la récupération des créneaux disponibles');
        }
    }
);

module.exports = router;