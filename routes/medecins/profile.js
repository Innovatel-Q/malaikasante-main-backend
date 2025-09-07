const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');

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
                            bio: true,
                            experienceAnnees: true,
                            languesParlees: true,
                            specialites: true,
                            
                            // Informations de consultation
                            tarifConsultationBase: true,
                            accepteDomicile: true,
                            accepteTeleconsultation: true,
                            accepteclinique: true,
                            cliniqueId: true,
                            
                            // Statuts et paramètres
                            statutValidation: true,
                            dateValidation: true,
                            noteMoyenne: true,
                            nombreEvaluations: true,
                            
                            // Média
                            photoProfile: true,
                            photoCabinet: true,
                            videoPresentation: true,
                            
                            // Champs JSON
                            diplomes: true,
                            certifications: true,
                            
                            // Clinique
                            clinique: {
                                select: {
                                    id: true,
                                    nom: true,
                                    adresse: true,
                                    ville: true,
                                    telephone: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });

            if (!profilComplet || !profilComplet.medecin) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            // Préparation de la réponse simple
            const responseData = {
                id: profilComplet.medecin.id,
                nom: profilComplet.nom,
                prenom: profilComplet.prenom,
                email: profilComplet.email,
                telephone: profilComplet.telephone,
                numeroOrdre: profilComplet.medecin.numeroOrdre,
                bio: profilComplet.medecin.bio,
                specialites: profilComplet.medecin.specialites,
                experienceAnnees: profilComplet.medecin.experienceAnnees,
                languesParlees: profilComplet.medecin.languesParlees,
                tarifConsultationBase: profilComplet.medecin.tarifConsultationBase,
                accepteDomicile: profilComplet.medecin.accepteDomicile,
                accepteTeleconsultation: profilComplet.medecin.accepteTeleconsultation,
                accepteclinique: profilComplet.medecin.accepteclinique,
                statutValidation: profilComplet.medecin.statutValidation,
                noteMoyenne: profilComplet.medecin.noteMoyenne,
                nombreEvaluations: profilComplet.medecin.nombreEvaluations,
                photoProfile: profilComplet.medecin.photoProfile ? (() => {
                    try {
                        const photoData = typeof profilComplet.medecin.photoProfile === 'string' 
                            ? JSON.parse(profilComplet.medecin.photoProfile) 
                            : profilComplet.medecin.photoProfile;
                        return photoData.nom_fichier 
                            ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/photos/profil/${photoData.nom_fichier}`
                            : null;
                    } catch (e) {
                        return null;
                    }
                })() : null,
                photoCabinet: profilComplet.medecin.photoCabinet ? (() => {
                    try {
                        const photoData = typeof profilComplet.medecin.photoCabinet === 'string' 
                            ? JSON.parse(profilComplet.medecin.photoCabinet) 
                            : profilComplet.medecin.photoCabinet;
                        return photoData.nom_fichier 
                            ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/photos/cabinet/${photoData.nom_fichier}`
                            : null;
                    } catch (e) {
                        return null;
                    }
                })() : null,
                diplomes: profilComplet.medecin.diplomes ? (() => {
                    try {
                        const diplomesData = Array.isArray(profilComplet.medecin.diplomes) 
                            ? profilComplet.medecin.diplomes 
                            : [profilComplet.medecin.diplomes];
                        return diplomesData.map(diplome => ({
                            nom: diplome.nom || diplome.libelle || 'Diplôme',
                            url: (diplome.nom_fichier || diplome.filename)
                                ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/medecins/diplomes/${diplome.nom_fichier || diplome.filename}`
                                : null
                        }));
                    } catch (e) {
                        return [];
                    }
                })() : [],
                certifications: profilComplet.medecin.certifications ? (() => {
                    try {
                        const certifsData = Array.isArray(profilComplet.medecin.certifications) 
                            ? profilComplet.medecin.certifications 
                            : [profilComplet.medecin.certifications];
                        return certifsData.map(certif => ({
                            nom: certif.nom || certif.libelle || 'Certification',
                            url: (certif.nom_fichier || certif.filename)
                                ? `${process.env.BASE_URL || 'http://localhost:3000'}/files/uploads/medecins/certifications/${certif.nom_fichier || certif.filename}`
                                : null
                        }));
                    } catch (e) {
                        return [];
                    }
                })() : [],
                clinique: profilComplet.medecin.clinique ? {
                    id: profilComplet.medecin.clinique.id,
                    nom: profilComplet.medecin.clinique.nom,
                    adresse: profilComplet.medecin.clinique.adresse,
                    ville: profilComplet.medecin.clinique.ville,
                    telephone: profilComplet.medecin.clinique.telephone,
                    email: profilComplet.medecin.clinique.email
                } : null
            };

            console.log(`✅ Profil médecin consulté: Dr ${profilComplet.prenom} ${profilComplet.nom}`);

            return ApiResponse.success(res, 'Profil médecin récupéré avec succès', responseData);

        } catch (error) {
            console.error('❌ Erreur consultation profil médecin:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la consultation du profil');
        }
    }
);

module.exports = router;
