const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation pour la gestion des disponibilités
const updateAvailabilitySchema = {
    fields: {
        action: {
            type: 'string',
            enum: ['UPDATE_HORAIRES', 'AJOUTER_CONGE', 'SUPPRIMER_CONGE', 'MODIFIER_STATUT']
        },
        
        // Pour UPDATE_HORAIRES
        horaires: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' }, // Pour mise à jour
                    jourSemaine: { 
                        type: 'string', 
                        enum: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'] 
                    },
                    heureDebut: { type: 'string' },
                    heureFin: { type: 'string' },
                    typeConsultation: { 
                        type: 'string', 
                        enum: ['CLINIQUE', 'DOMICILE', 'TELECONSULTATION'] 
                    },
                    actif: { type: 'boolean' }
                }
            }
        },

        // Pour AJOUTER_CONGE
        conge: {
            type: 'object',
            properties: {
                dateDebut: { type: 'string' },
                dateFin: { type: 'string' },
                motif: { type: 'string', maxLength: 500 },
                typeConge: { 
                    type: 'string', 
                    enum: ['VACANCES', 'MALADIE', 'FORMATION', 'PERSONNEL', 'AUTRE'] 
                },
                recurrent: { type: 'boolean' },
                annulationRdvAutorise: { type: 'boolean' }
            }
        },

        // Pour SUPPRIMER_CONGE
        congeId: {
            type: 'string'
        },

        // Pour MODIFIER_STATUT
        statutModifications: {
            type: 'object',
            properties: {
                accepteNouveauxPatients: { type: 'boolean' },
                messageIndisponibilite: { type: 'string', maxLength: 500 },
                delaiMoyenReponse: { type: 'number', min: 1, max: 168 }
            }
        }
    },
    required: ['action'],
    strict: true
};

/**
 * PUT /medecins/availability - Gérer les disponibilités et congés
 */
router.put('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    BodyFilter.validate(updateAvailabilitySchema),
    async (req, res) => {
        try {
            const user = req.user;
            const { action } = req.body;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`📅 Gestion disponibilité médecin: Dr ${user.prenom} ${user.nom} - Action: ${action}`);

            // Vérification du médecin
            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { 
                    id: true, 
                    accepteNouveauxPatients: true,
                    delaiMoyenReponse: true,
                    messageIndisponibilite: true
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            let resultat;

            switch (action) {
                case 'UPDATE_HORAIRES':
                    resultat = await updateHoraires(req.body.horaires, medecin.id, user);
                    break;

                case 'AJOUTER_CONGE':
                    resultat = await ajouterConge(req.body.conge, medecin.id, user);
                    break;

                case 'SUPPRIMER_CONGE':
                    resultat = await supprimerConge(req.body.congeId, medecin.id, user);
                    break;

                case 'MODIFIER_STATUT':
                    resultat = await modifierStatut(req.body.statutModifications, medecin.id, user);
                    break;

                default:
                    return ApiResponse.badRequest(res, 'Action non reconnue');
            }

            return ApiResponse.success(res, resultat.message, resultat.data);

        } catch (error) {
            console.error('❌ Erreur gestion disponibilité:', error);
            return ApiResponse.serverError(res, 'Erreur lors de la gestion des disponibilités');
        }
    }
);

// === FONCTIONS AUXILIAIRES ===

async function updateHoraires(horaires, medecinId, user) {
    if (!horaires || !Array.isArray(horaires)) {
        throw new Error('Horaires requis');
    }

    const result = await prisma.$transaction(async (tx) => {
        const horairesUpdated = [];

        for (const horaire of horaires) {
            // Validation de l'heure
            const heureDebut = new Date(`1970-01-01T${horaire.heureDebut}:00`);
            const heureFin = new Date(`1970-01-01T${horaire.heureFin}:00`);

            if (heureDebut >= heureFin) {
                throw new Error(`Heure de fin doit être après heure de début pour ${horaire.jourSemaine}`);
            }

            if (horaire.id) {
                // Mise à jour
                const updated = await tx.horaireConsultation.update({
                    where: { 
                        id: horaire.id,
                        medecinId: medecinId 
                    },
                    data: {
                        heureDebut: horaire.heureDebut,
                        heureFin: horaire.heureFin,
                        typeConsultation: horaire.typeConsultation,
                        actif: horaire.actif
                    }
                });
                horairesUpdated.push({ action: 'updated', horaire: updated });
            } else {
                // Création
                const created = await tx.horaireConsultation.create({
                    data: {
                        medecinId,
                        jourSemaine: horaire.jourSemaine,
                        heureDebut: horaire.heureDebut,
                        heureFin: horaire.heureFin,
                        typeConsultation: horaire.typeConsultation,
                        actif: horaire.actif !== false
                    }
                });
                horairesUpdated.push({ action: 'created', horaire: created });
            }
        }

        return horairesUpdated;
    });

    return {
        message: 'Horaires mis à jour avec succès',
        data: {
            horairesModifies: result.length,
            details: result,
            recommendations: [
                'Vos nouveaux horaires sont immédiatement visibles par les patients',
                'Vérifiez que vos créneaux correspondent à votre planning réel',
                'Les patients peuvent maintenant prendre RDV sur ces créneaux'
            ]
        }
    };
}

async function ajouterConge(congeData, medecinId, user) {
    if (!congeData) {
        throw new Error('Informations de congé requises');
    }

    const dateDebut = new Date(congeData.dateDebut);
    const dateFin = new Date(congeData.dateFin);
    const maintenant = new Date();

    // Validations
    if (dateDebut < maintenant) {
        throw new Error('La date de début ne peut pas être dans le passé');
    }

    if (dateFin <= dateDebut) {
        throw new Error('La date de fin doit être postérieure à la date de début');
    }

    const dureeJours = Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24));
    if (dureeJours > 365) {
        throw new Error('La durée du congé ne peut pas dépasser 365 jours');
    }

    // Vérification des conflits
    const congeExistant = await prisma.conge.findFirst({
        where: {
            medecinId,
            OR: [
                {
                    dateDebut: { lte: dateFin },
                    dateFin: { gte: dateDebut }
                }
            ]
        }
    });

    if (congeExistant) {
        throw new Error('Ce congé entre en conflit avec un congé existant');
    }

    const result = await prisma.$transaction(async (tx) => {
        // Créer le congé
        const nouveauConge = await tx.conge.create({
            data: {
                medecinId,
                dateDebut,
                dateFin,
                motif: congeData.motif || 'Congé',
                typeConge: congeData.typeConge || 'VACANCES',
                recurrent: congeData.recurrent || false,
                createdBy: user.id
            }
        });

        // Si autorisé, annuler les RDV existants dans la période
        if (congeData.annulationRdvAutorise) {
            const rdvAnnules = await tx.rendezVous.updateMany({
                where: {
                    medecinId,
                    statut: { in: ['CONFIRME', 'EN_ATTENTE'] },
                    dateHeureDebut: {
                        gte: dateDebut,
                        lte: dateFin
                    }
                },
                data: {
                    statut: 'ANNULE',
                    motifAnnulation: `Congé médecin: ${congeData.motif}`,
                    dateAnnulation: new Date()
                }
            });

            // Créer des notifications pour les patients concernés
            const rdvConcernes = await tx.rendezVous.findMany({
                where: {
                    medecinId,
                    statut: 'ANNULE',
                    dateAnnulation: { gte: maintenant }
                },
                include: {
                    patient: {
                        include: {
                            user: { select: { id: true } }
                        }
                    }
                },
                take: 50 // Limiter pour éviter trop de notifications
            });

            for (const rdv of rdvConcernes) {
                await tx.notification.create({
                    data: {
                        userId: rdv.patient.user.id,
                        type: 'RENDEZ_VOUS',
                        titre: '⚠️ Rendez-vous annulé',
                        contenu: `Votre rendez-vous du ${rdv.dateHeureDebut.toLocaleDateString()} avec Dr ${user.nom} a été annulé en raison d'un congé médical. Veuillez reprendre rendez-vous.`,
                        statutNotification: 'EN_ATTENTE',
                        priorite: 'HAUTE',
                        canal: 'EMAIL'
                    }
                });
            }

            return { nouveauConge, rdvAnnules: rdvAnnules.count };
        }

        return { nouveauConge, rdvAnnules: 0 };
    });

    return {
        message: 'Congé ajouté avec succès',
        data: {
            conge: {
                id: result.nouveauConge.id,
                dateDebut: result.nouveauConge.dateDebut,
                dateFin: result.nouveauConge.dateFin,
                dureeJours,
                motif: result.nouveauConge.motif,
                typeConge: result.nouveauConge.typeConge
            },
            impact: {
                rdvAnnules: result.rdvAnnules,
                nouvelleDemandeBloques: true,
                notificationsEnvoyees: result.rdvAnnules > 0
            },
            prochaines_etapes: [
                'Votre congé est enregistré et visible dans votre planning',
                result.rdvAnnules > 0 ? `${result.rdvAnnules} rendez-vous ont été annulés automatiquement` : null,
                'Les patients ne peuvent plus prendre RDV sur cette période',
                'Vous pouvez modifier ou supprimer ce congé si nécessaire'
            ].filter(Boolean)
        }
    };
}

async function supprimerConge(congeId, medecinId, user) {
    if (!congeId) {
        throw new Error('ID du congé requis');
    }

    const conge = await prisma.conge.findUnique({
        where: { 
            id: congeId,
            medecinId 
        }
    });

    if (!conge) {
        throw new Error('Congé non trouvé');
    }

    // Vérification que le congé n'a pas commencé
    if (new Date(conge.dateDebut) <= new Date()) {
        throw new Error('Impossible de supprimer un congé déjà commencé');
    }

    await prisma.conge.delete({
        where: { id: congeId }
    });

    const dureeJours = Math.ceil((new Date(conge.dateFin) - new Date(conge.dateDebut)) / (1000 * 60 * 60 * 24));

    return {
        message: 'Congé supprimé avec succès',
        data: {
            congeSupprime: {
                id: conge.id,
                dateDebut: conge.dateDebut,
                dateFin: conge.dateFin,
                dureeJours,
                motif: conge.motif
            },
            impact: {
                creneauxLiberes: true,
                nouvellesDemdesAutorisees: true
            },
            prochaines_etapes: [
                'Les créneaux de cette période sont maintenant disponibles',
                'Les patients peuvent prendre RDV sur ces dates',
                'Assurez-vous d\'être disponible sur cette période'
            ]
        }
    };
}

async function modifierStatut(modifications, medecinId, user) {
    if (!modifications || Object.keys(modifications).length === 0) {
        throw new Error('Aucune modification spécifiée');
    }

    const updateData = {};
    if (modifications.accepteNouveauxPatients !== undefined) {
        updateData.accepteNouveauxPatients = modifications.accepteNouveauxPatients;
    }
    if (modifications.messageIndisponibilite !== undefined) {
        updateData.messageIndisponibilite = modifications.messageIndisponibilite;
    }
    if (modifications.delaiMoyenReponse !== undefined) {
        updateData.delaiMoyenReponse = modifications.delaiMoyenReponse;
    }

    const medecinUpdated = await prisma.medecin.update({
        where: { id: medecinId },
        data: updateData,
        select: {
            accepteNouveauxPatients: true,
            messageIndisponibilite: true,
            delaiMoyenReponse: true
        }
    });

    const changementsEffectues = Object.keys(updateData);

    return {
        message: 'Statut de disponibilité mis à jour',
        data: {
            nouveauxParametres: medecinUpdated,
            changementsEffectues,
            impact: {
                visibilitePatients: modifications.accepteNouveauxPatients !== undefined,
                nouvellesDemandes: medecinUpdated.accepteNouveauxPatients,
                messageTousPatients: !!modifications.messageIndisponibilite
            },
            prochaines_etapes: [
                modifications.accepteNouveauxPatients === false ? 
                    'Vous ne recevrez plus de nouvelles demandes de patients' : null,
                modifications.accepteNouveauxPatients === true ?
                    'Votre agenda est ouvert aux nouveaux patients' : null,
                modifications.delaiMoyenReponse ?
                    `Nouveau délai de réponse affiché: ${modifications.delaiMoyenReponse}h` : null,
                'Les changements sont immédiatement visibles par les patients'
            ].filter(Boolean)
        }
    };
}

module.exports = router;