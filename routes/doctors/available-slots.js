const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * GET /doctors/:id/available-slots - Créneaux disponibles d'un médecin pour la semaine suivante
 */
router.get('/:id',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            const medecinId = req.params.id;
            
            if (!medecinId) {
                return ApiResponse.badRequest(res, 'ID du médecin requis');
            }
            
            const { typeConsultation = 'CLINIQUE' } = req.query;

            // Calculer automatiquement les dates (à partir de demain pour une semaine)
            const maintenant = new Date();
            const demain = new Date(maintenant);
            demain.setDate(maintenant.getDate() + 1);
            demain.setHours(0, 0, 0, 0); // Début de journée
            
            const finSemaine = new Date(demain);
            finSemaine.setDate(demain.getDate() + 7); // 7 jours à partir de demain
            
            const debut = demain;
            const fin = finSemaine;

            // Vérification de l'existence du médecin
            const medecin = await prisma.medecin.findFirst({
                where: {
                    id: medecinId,
                    statutValidation: 'VALIDE',
                    user: {
                        statut: 'ACTIF'
                    }
                },
                include: {
                    user: {
                        select: {
                            nom: true,
                            prenom: true
                        }
                    },
                    disponibilites: {
                        where: {
                            typeConsultation: typeConsultation,
                            bloque: false
                        },
                        select: {
                            jourSemaine: true,
                            heureDebut: true,
                            heureFin: true,
                            dureeCreneauMinutes: true,
                            recurrent: true,
                            dateSpecifique: true
                        }
                    }
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Médecin non trouvé ou non disponible pour de nouveaux patients');
            }

            // Vérification que le médecin propose le type de consultation demandé
            const consultationAutorisee = {
                'CLINIQUE': medecin.accepteclinique,
                'DOMICILE': medecin.accepteDomicile,
                'TELECONSULTATION': medecin.accepteTeleconsultation
            };

            if (!consultationAutorisee[typeConsultation]) {
                return ApiResponse.badRequest(res, `Le médecin ne propose pas de consultation de type ${typeConsultation}`);
            }

            // Récupérer tous les rendez-vous existants dans la période
            const rendezVousExistants = await prisma.rendezVous.findMany({
                where: {
                    medecinId: medecinId,
                    dateRendezVous: {
                        gte: debut,
                        lt: fin
                    },
                    statut: {
                        in: ['CONFIRME', 'EN_ATTENTE', 'DEMANDE']
                    }
                },
                select: {
                    dateRendezVous: true,
                    heureDebut: true,
                    heureFin: true,
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

            // Générer les créneaux disponibles (durée fixe de 30 minutes)
            const creneauxDisponibles = [];
            const dureeConsultation = 30; // Durée fixe
            const dureeMs = dureeConsultation * 60 * 1000;

            for (let currentDate = new Date(debut); currentDate < fin; currentDate.setDate(currentDate.getDate() + 1)) {
                const jourSemaine = joursMap[currentDate.getDay()];
                
                // Vérifier si le médecin travaille ce jour-là
                const horairesJour = medecin.disponibilites.filter(d => 
                    d.jourSemaine === jourSemaine && 
                    (d.recurrent || (d.dateSpecifique && new Date(d.dateSpecifique).toDateString() === currentDate.toDateString()))
                );
                if (horairesJour.length === 0) continue;

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
                            const [heureDebutRdv, minuteDebutRdv] = rdv.heureDebut.split(':').map(Number);
                            const [heureFinRdv, minuteFinRdv] = rdv.heureFin.split(':').map(Number);
                            
                            const debutRdv = new Date(rdv.dateRendezVous);
                            debutRdv.setHours(heureDebutRdv, minuteDebutRdv, 0, 0);
                            
                            const finRdv = new Date(rdv.dateRendezVous);
                            finRdv.setHours(heureFinRdv, minuteFinRdv, 0, 0);
                            
                            return (creneau < finRdv && finCreneau > debutRdv);
                        });

                        if (!conflit) {
                            // Calculer le tarif selon le type de consultation
                            let tarif = medecin.tarifConsultationBase || 0;

                            creneauxDisponibles.push({
                                dateHeureDebut: creneau.toISOString(),
                                dateHeureFin: finCreneau.toISOString(),
                                jour: jourSemaine,
                                date: creneau.toISOString().split('T')[0],
                                heure: creneau.toTimeString().substring(0, 5),
                                typeConsultation,
                                tarif,
                                disponible: true
                            });
                        }
                    }
                }
            }

            // Organiser par dates avec structure optimisée
            const creneauxParDate = {};
            creneauxDisponibles.forEach(creneau => {
                const date = creneau.date;
                if (!creneauxParDate[date]) {
                    creneauxParDate[date] = {
                        jour: creneau.jour,
                        date: creneau.date,
                        horaires: []
                    };
                }
                // Ne garder que les horaires essentiels dans le tableau
                creneauxParDate[date].horaires.push({
                    debut: creneau.heure,
                    fin: creneau.dateHeureFin.split('T')[1].substring(0, 5),
                    dateHeureDebut: creneau.dateHeureDebut,
                    dateHeureFin: creneau.dateHeureFin
                });
            });

            // Trier les horaires de chaque jour
            Object.keys(creneauxParDate).forEach(date => {
                creneauxParDate[date].horaires.sort((a, b) => a.debut.localeCompare(b.debut));
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
                const jourSemaine = creneauxParDate[date].jour;
                if (!statistiques.repartitionParJour[jourSemaine]) {
                    statistiques.repartitionParJour[jourSemaine] = 0;
                }
                statistiques.repartitionParJour[jourSemaine] += creneauxParDate[date].horaires.length;
            });

            // Informations sur le médecin et la consultation
            const informationsConsultation = {
                medecin: {
                    id: medecin.id,
                    nom: medecin.user.nom,
                    prenom: medecin.user.prenom,
                    specialites: medecin.specialites
                },
                typeConsultation,
                tarif: {
                    montant: medecin.tarifConsultationBase,
                    devise: 'XOF'
                }
            };

            return ApiResponse.success(res, 'Créneaux disponibles récupérés avec succès', {
                informationsConsultation,
                creneauxDisponibles: creneauxParDate,
                statistiques
            });

        } catch (error) {
            console.error('❌ Erreur récupération créneaux disponibles:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la récupération des créneaux disponibles');
        }
    }
);

module.exports = router;