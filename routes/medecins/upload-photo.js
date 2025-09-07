const express = require('express');
const multer = require('multer');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const LocalFileService = require('../../services/LocalFileService');

// Configuration Multer pour le stockage en mémoire
const storage = multer.memoryStorage();

// Configuration des filtres de fichiers
const fileFilter = (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Format de fichier non supporté. Utilisez JPEG, PNG ou WebP.'), false);
    }
};

// Configuration de l'upload
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB max
        files: 1 // Un seul fichier à la fois
    }
});

/**
 * POST /medecins/upload-photo - Upload de photo de profil pour médecins validés
 */
router.post('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    AuthMiddleware.authorizeValidatedMedecin(),
    upload.single('photo'),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.socket.remoteAddress;

            console.log(`📸 Upload photo profil médecin: Dr ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            // Vérification de la présence du fichier
            if (!req.file) {
                return ApiResponse.badRequest(res, 'Aucun fichier fourni. Veuillez sélectionner une photo.');
            }

            const { buffer, originalname, mimetype, size } = req.file;

            // Validation de la taille du fichier
            if (size > 5 * 1024 * 1024) {
                return ApiResponse.badRequest(res, 'Fichier trop volumineux. Taille maximale: 5MB');
            }

            // Validation des dimensions de l'image (optionnel - nécessite sharp)
            try {
                const sharp = require('sharp');
                const metadata = await sharp(buffer).metadata();
                
                if (metadata.width < 200 || metadata.height < 200) {
                    return ApiResponse.badRequest(res, 'Image trop petite. Dimensions minimales: 200x200 pixels');
                }
                
                if (metadata.width > 2000 || metadata.height > 2000) {
                    return ApiResponse.badRequest(res, 'Image trop grande. Dimensions maximales: 2000x2000 pixels');
                }
            } catch (sharpError) {
                console.log('⚠️ Sharp non disponible pour validation dimensions:', sharpError.message);
            }

            // Récupération des informations médecin actuelles
            const medecinActuel = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { 
                    id: true,
                    statutValidation: true
                }
            });

            if (!medecinActuel) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            // Double vérification du statut de validation
            if (medecinActuel.statutValidation !== 'VALIDE') {
                return ApiResponse.forbidden(res, 'Upload de photo réservé aux médecins validés');
            }

            // Upload du fichier
            console.log(`📤 Upload en cours: ${originalname} (${(size / 1024).toFixed(1)} KB)`);
            
            const uploadResult = await LocalFileService.uploadFile(
                buffer,
                `photo-profil-${user.id}-${Date.now()}-${originalname}`,
                mimetype,
                'PHOTO_PROFIL',
                `Photo de profil - Dr ${user.prenom} ${user.nom}`
            );

            // Suppression de l'ancienne photo si elle existe
            const ancienneMedecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { photoProfile: true }
            });

            let anciennePhotoSupprimee = false;
            if (ancienneMedecin?.photoProfile) {
                try {
                    // Extraire l'ID du fichier de l'ancienne photo
                    const anciennePhotoData = JSON.parse(ancienneMedecin.photoProfile);
                    if (anciennePhotoData.fileId) {
                        await LocalFileService.deleteFile(anciennePhotoData.fileId, 'PHOTO_PROFIL');
                        anciennePhotoSupprimee = true;
                        console.log(`🗑️ Ancienne photo supprimée: ${anciennePhotoData.nom_fichier}`);
                    }
                } catch (deleteError) {
                    console.error('⚠️ Erreur suppression ancienne photo:', deleteError.message);
                }
            }

            // Mise à jour du profil médecin avec la nouvelle photo
            const photoData = {
                fileId: uploadResult.fileId,
                nom_fichier: uploadResult.filename,
                original_name: uploadResult.originalName,
                taille: size,
                mime_type: mimetype,
                upload_date: new Date().toISOString(),
                file_path: uploadResult.filePath,
                relative_path: uploadResult.relativePath
            };

            await prisma.medecin.update({
                where: { userId: user.id },
                data: {
                    photoProfile: JSON.stringify(photoData)
                }
            });

            // Génération de l'URL d'accès
            const photoUrl = LocalFileService.generateFileUrl(uploadResult.relativePath, process.env.BASE_URL || 'http://localhost:3000');

            console.log(`✅ Photo profil uploadée: Dr ${user.prenom} ${user.nom} - Fichier: ${uploadResult.filename}`);

            return ApiResponse.success(res, 'Photo de profil uploadée avec succès', {
                photo: {
                    id: uploadResult.fileId,
                    nom_fichier: uploadResult.filename,
                    taille: size,
                    tailleLisible: `${(size / 1024).toFixed(1)} KB`,
                    mime_type: mimetype,
                    upload_date: new Date().toISOString(),
                    url: photoUrl
                },
                actions_effectuees: {
                    nouvelle_photo_uploadee: true,
                    ancienne_photo_supprimee: anciennePhotoSupprimee,
                    profil_mis_a_jour: true
                },
                informations: {
                    message: 'Votre photo de profil a été mise à jour avec succès',
                    visibilite: 'Visible immédiatement par les patients',
                    recommandations: [
                        'Utilisez une photo professionnelle et souriante',
                        'Assurez-vous que votre visage est clairement visible',
                        'Évitez les photos floues ou mal éclairées'
                    ]
                }
            });

        } catch (error) {
            console.error('❌ Erreur upload photo médecin:', error);

            // Gestion des erreurs spécifiques
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return ApiResponse.badRequest(res, 'Fichier trop volumineux. Taille maximale: 5MB');
                }
                if (error.code === 'LIMIT_FILE_COUNT') {
                    return ApiResponse.badRequest(res, 'Trop de fichiers. Envoyez une seule photo à la fois');
                }
                return ApiResponse.badRequest(res, `Erreur de fichier: ${error.message}`);
            }

            if (error.message.includes('Format de fichier non supporté')) {
                return ApiResponse.badRequest(res, 'Format de fichier non supporté. Utilisez JPEG, PNG ou WebP');
            }

            return ApiResponse.serverError(res, 'Erreur interne lors de l\'upload de la photo');
        }
    }
);

/**
 * GET /medecins/photo - Récupérer les informations de la photo de profil actuelle
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    async (req, res) => {
        try {
            const user = req.user;

            console.log(`👁️ Consultation photo profil: Dr ${user.prenom} ${user.nom}`);

            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { 
                    photoProfile: true,
                    statutValidation: true
                }
            });

            if (!medecin) {
                return ApiResponse.notFound(res, 'Profil médecin non trouvé');
            }

            let photoInfo = null;
            let photoUrl = null;

            if (medecin.photoProfile) {
                try {
                    photoInfo = JSON.parse(medecin.photoProfile);
                    
                    // Génération de l'URL d'accès
                    if (photoInfo.relative_path) {
                        photoUrl = LocalFileService.generateFileUrl(photoInfo.relative_path, process.env.BASE_URL || 'http://localhost:3000');
                    }
                } catch (parseError) {
                    console.error('⚠️ Erreur parsing photo info:', parseError.message);
                }
            }

            return ApiResponse.success(res, 'Informations photo récupérées', {
                photo_actuelle: photoInfo ? {
                    id: photoInfo.fileId,
                    nom_fichier: photoInfo.nom_fichier,
                    taille: photoInfo.taille,
                    tailleLisible: photoInfo.taille ? `${(photoInfo.taille / 1024).toFixed(1)} KB` : null,
                    mime_type: photoInfo.mime_type,
                    upload_date: photoInfo.upload_date,
                    url: photoUrl
                } : null,
                peut_uploader: medecin.statutValidation === 'VALIDE',
                statut_validation: medecin.statutValidation,
                limites: {
                    taille_max: '5 MB',
                    formats_acceptes: ['JPEG', 'JPG', 'PNG', 'WebP'],
                    dimensions_min: '200x200 pixels',
                    dimensions_max: '2000x2000 pixels'
                }
            });

        } catch (error) {
            console.error('❌ Erreur consultation photo médecin:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la consultation de la photo');
        }
    }
);

/**
 * DELETE /medecins/photo - Supprimer la photo de profil
 */
router.delete('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['MEDECIN']),
    AuthMiddleware.authorizeValidatedMedecin(),
    async (req, res) => {
        try {
            const user = req.user;
            const clientIp = req.ip || req.socket.remoteAddress;

            console.log(`🗑️ Suppression photo profil: Dr ${user.prenom} ${user.nom} - IP: ${clientIp}`);

            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { photoProfile: true }
            });

            if (!medecin?.photoProfile) {
                return ApiResponse.notFound(res, 'Aucune photo de profil à supprimer');
            }

            let photoSupprimee = false;
            let nomFichier = 'fichier inconnu';

            try {
                const photoData = JSON.parse(medecin.photoProfile);
                nomFichier = photoData.nom_fichier || 'fichier inconnu';
                
                if (photoData.fileId) {
                    await LocalFileService.deleteFile(photoData.fileId, 'PHOTO_PROFIL');
                    photoSupprimee = true;
                }
            } catch (deleteError) {
                console.error('⚠️ Erreur suppression fichier:', deleteError.message);
            }

            // Mise à jour du profil (suppression de la référence)
            await prisma.medecin.update({
                where: { userId: user.id },
                data: { photoProfile: null }
            });

            console.log(`✅ Photo profil supprimée: Dr ${user.prenom} ${user.nom} - Fichier: ${nomFichier}`);

            return ApiResponse.success(res, 'Photo de profil supprimée avec succès', {
                photo_supprimee: {
                    nom_fichier: nomFichier,
                    fichier_supprime_du_stockage: photoSupprimee
                },
                informations: {
                    message: 'Votre photo de profil a été supprimée',
                    impact: 'Les patients ne verront plus votre photo',
                    recommandation: 'Considérez uploader une nouvelle photo professionnelle'
                }
            });

        } catch (error) {
            console.error('❌ Erreur suppression photo médecin:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de la suppression de la photo');
        }
    }
);

module.exports = router;