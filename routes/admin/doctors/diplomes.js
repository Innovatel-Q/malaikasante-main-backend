// routes/admin/doctors/diplomes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const FileService = require('../../../services/FileService');
const AuthMiddleware = require('../../../middleware/authMiddleware');

// Configuration multer pour upload en mémoire
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Types MIME autorisés pour les diplômes
        const allowedMimeTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png'
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format de fichier non autorisé. Formats acceptés: PDF, JPG, PNG'), false);
        }
    }
});

// POST /v1/admin/doctors/{medecinId}/diplomes/upload
router.post('/:medecinId/diplomes/upload',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    upload.single('diplome'),
    async (req, res) => {
        try {
            const { medecinId } = req.params;
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            // Vérifier qu'un fichier a été envoyé
            if (!req.file) {
                return ApiResponse.badRequest(res, 'Aucun fichier diplôme fourni', {
                    code: 'NO_FILE',
                    field: 'diplome'
                });
            }

            console.log(`📤 Admin ${adminUser.prenom} ${adminUser.nom} upload diplôme pour médecin: ${medecinId}`);

            // Vérifier que le médecin existe et est en attente
            const medecin = await prisma.medecin.findUnique({
                where: { id: medecinId },
                include: {
                    user: {
                        select: {
                            nom: true,
                            prenom: true,
                            email: true
                        }
                    }
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Médecin non trouvé', {
                    code: 'MEDECIN_NOT_FOUND',
                    medecinId
                });
            }

            if (medecin.statutValidation !== 'EN_ATTENTE') {
                return ApiResponse.badRequest(res, 'Seuls les médecins en attente peuvent recevoir des documents', {
                    code: 'INVALID_STATUS',
                    currentStatus: medecin.statutValidation
                });
            }

            // 1. Upload du fichier vers le service externe
            console.log(`🔄 Upload du diplôme vers le service fichiers...`);
            const uploadResult = await FileService.uploadFile(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype
            );

            // 2. Préparer les métadonnées du document
            const nouveauDiplome = {
                fileId: uploadResult.fileId,
                nom_fichier: uploadResult.originalName,
                taille: uploadResult.size,
                mime_type: uploadResult.mimeType,
                upload_date: new Date().toISOString(),
                uploaded_by_admin_id: adminUser.id,
                uploaded_by_admin_name: `${adminUser.prenom} ${adminUser.nom}`,
                description: req.body.description || null // Description optionnelle
            };

            // 3. Récupérer les diplômes existants et gérer la structure
            let diplomesExistants = medecin.diplomes;

            // Initialiser comme tableau si nécessaire
            if (!diplomesExistants) {
                diplomesExistants = [];
            } else if (!Array.isArray(diplomesExistants)) {
                // Convertir l'ancien format (objet unique) en tableau
                diplomesExistants = [diplomesExistants];
            }

            // 4. Ajouter le nouveau diplôme
            diplomesExistants.push(nouveauDiplome);

            // 5. Sauvegarder en base de données
            const medecinUpdated = await prisma.medecin.update({
                where: { id: medecinId },
                data: {
                    diplomes: diplomesExistants
                },
                include: {
                    user: {
                        select: {
                            nom: true,
                            prenom: true,
                            email: true
                        }
                    }
                }
            });

            console.log(`✅ Diplôme ajouté avec succès pour Dr ${medecin.user.prenom} ${medecin.user.nom} par admin ${adminUser.prenom} ${adminUser.nom}`);

            // 6. Réponse de succès
            return ApiResponse.success(res, 'Diplôme uploadé avec succès', {
                medecin: {
                    id: medecinUpdated.id,
                    nom: medecinUpdated.user.nom,
                    prenom: medecinUpdated.user.prenom,
                    email: medecinUpdated.user.email
                },
                diplome: {
                    fileId: nouveauDiplome.fileId,
                    nom_fichier: nouveauDiplome.nom_fichier,
                    taille: nouveauDiplome.taille,
                    mime_type: nouveauDiplome.mime_type,
                    description: nouveauDiplome.description
                },
                statistiques: {
                    totalDiplomes: diplomesExistants.length,
                    nouveauDiplome: true
                },
                upload: {
                    uploadedBy: `${adminUser.prenom} ${adminUser.nom}`,
                    uploadedAt: nouveauDiplome.upload_date,
                    ip: clientIp
                }
            });

        } catch (error) {
            console.error('❌ Erreur upload diplôme:', error);

            // Gestion des erreurs spécifiques de multer
            if (error.code === 'LIMIT_FILE_SIZE') {
                return ApiResponse.badRequest(res, 'Fichier trop volumineux. Maximum: 10MB', {
                    code: 'FILE_TOO_LARGE',
                    maxSize: '10MB'
                });
            }

            // Gestion des erreurs de service fichiers
            if (error.message && error.message.includes('upload')) {
                return ApiResponse.serverError(res, 'Erreur lors de l\'upload du fichier', {
                    code: 'UPLOAD_SERVICE_ERROR'
                });
            }

            // Erreur générale
            return ApiResponse.serverError(res, 'Erreur interne lors de l\'upload du diplôme');
        }
    }
);

module.exports = router;