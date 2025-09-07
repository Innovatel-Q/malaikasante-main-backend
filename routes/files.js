// routes/files.js - Route sécurisée pour servir les fichiers uploadés
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const prisma = require('../prisma/client');
const AuthMiddleware = require('../middleware/authMiddleware');
const ApiResponse = require('../services/ApiResponse');

const stat = promisify(fs.stat);

// Middleware de sécurité pour vérifier l'accès aux fichiers
async function verifyFileAccess(req, res, next) {
    try {
        const { category, subcategory, filename } = req.params;
        const user = req.user;

        // Seuls les admins et médecins validés peuvent accéder aux fichiers
        if (!user || !['ADMIN', 'MEDECIN'].includes(user.role)) {
            return ApiResponse.forbidden(res, 'Accès non autorisé aux fichiers', {
                code: 'ACCESS_FORBIDDEN',
                requiredRole: ['ADMIN', 'MEDECIN']
            });
        }

        // Vérifications spécifiques selon le type d'utilisateur
        if (user.role === 'MEDECIN') {
            // Les médecins ne peuvent voir que leurs propres documents
            const medecin = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { 
                    id: true, 
                    diplomes: true, 
                    certifications: true,
                    statutValidation: true
                }
            });

            if (!medecin || medecin.statutValidation !== 'VALIDE') {
                return ApiResponse.forbidden(res, 'Accès non autorisé - médecin non validé', {
                    code: 'MEDECIN_NOT_VALIDATED'
                });
            }

            // Récupérer les données complètes du médecin pour vérification
            const medecinComplet = await prisma.medecin.findUnique({
                where: { userId: user.id },
                select: { 
                    id: true, 
                    diplomes: true, 
                    certifications: true,
                    photoProfile: true,
                    photoCabinet: true,
                    statutValidation: true
                }
            });

            // Vérifier que le fichier appartient à ce médecin
            const fileId = filename.split('.')[0]; // Extraire l'ID du nom de fichier
            let fileExists = false;

            // Vérifier dans les documents (diplômes, certifications)
            if (category === 'medecins') {
                const allDocuments = [
                    ...(Array.isArray(medecinComplet.diplomes) ? medecinComplet.diplomes : (medecinComplet.diplomes ? [medecinComplet.diplomes] : [])),
                    ...(Array.isArray(medecinComplet.certifications) ? medecinComplet.certifications : (medecinComplet.certifications ? [medecinComplet.certifications] : []))
                ];

                fileExists = allDocuments.some(doc => 
                    doc && (doc.fileId === fileId || doc.nom_fichier === filename)
                );
            }
            
            // Vérifier dans les photos
            else if (category === 'photos') {
                const photos = [];
                
                if (medecinComplet.photoProfile) {
                    try {
                        const photoData = typeof medecinComplet.photoProfile === 'string' 
                            ? JSON.parse(medecinComplet.photoProfile) 
                            : medecinComplet.photoProfile;
                        photos.push(photoData);
                    } catch (e) {
                        console.warn('Erreur parsing photoProfile:', e);
                    }
                }
                
                if (medecinComplet.photoCabinet) {
                    try {
                        const photoData = typeof medecinComplet.photoCabinet === 'string' 
                            ? JSON.parse(medecinComplet.photoCabinet) 
                            : medecinComplet.photoCabinet;
                        photos.push(photoData);
                    } catch (e) {
                        console.warn('Erreur parsing photoCabinet:', e);
                    }
                }

                fileExists = photos.some(photo => 
                    photo && (photo.fileId === fileId || photo.nom_fichier === filename)
                );
            }

            if (!fileExists) {
                return ApiResponse.forbidden(res, 'Accès non autorisé - fichier non associé', {
                    code: 'FILE_NOT_OWNED'
                });
            }
        }

        // Valider la catégorie et sous-catégorie
        if (!['medecins', 'photos'].includes(category) || 
            (category === 'medecins' && !['diplomes', 'certifications', 'autres'].includes(subcategory)) ||
            (category === 'photos' && !['profil', 'cabinet'].includes(subcategory))) {
            return ApiResponse.badRequest(res, 'Chemin de fichier invalide', {
                code: 'INVALID_FILE_PATH'
            });
        }

        // Construire le chemin de fichier sécurisé
        const filePath = path.join(__dirname, '../uploads', category, subcategory, filename);
        
        // Vérifier que le chemin ne sort pas du dossier uploads (sécurité)
        const uploadsDir = path.join(__dirname, '../uploads');
        const resolvedPath = path.resolve(filePath);
        const resolvedUploadsDir = path.resolve(uploadsDir);
        
        if (!resolvedPath.startsWith(resolvedUploadsDir)) {
            return ApiResponse.forbidden(res, 'Tentative d\'accès non autorisée', {
                code: 'PATH_TRAVERSAL_DENIED'
            });
        }

        req.filePath = filePath;
        req.resolvedPath = resolvedPath;
        next();

    } catch (error) {
        console.error('❌ Erreur vérification accès fichier:', error);
        return ApiResponse.serverError(res, 'Erreur interne lors de la vérification d\'accès');
    }
}

// GET /files/uploads/photos/profil/:filename - Photos de profil publiques (pour patients)
router.get('/uploads/photos/profil/:filename',
    async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(__dirname, '../uploads/photos/profil', filename);
            
            console.log(`📸 Accès public à la photo de profil: ${filename}`);

            // Vérifier que le fichier existe
            try {
                await stat(filePath);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return ApiResponse.notFound(res, 'Photo non trouvée', {
                        code: 'PHOTO_NOT_FOUND',
                        filename
                    });
                }
                throw error;
            }

            // Valider que c'est bien une image
            const ext = path.extname(filename).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                return ApiResponse.badRequest(res, 'Format de fichier non supporté');
            }

            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp'
            };
            const mimeType = mimeTypes[ext];

            // En-têtes optimisés pour les photos publiques
            res.set({
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=86400', // Cache 24 heures
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*', // Permettre accès depuis front-end
                'X-Robots-Tag': 'noindex, nofollow'
            });

            // Envoyer le fichier
            res.sendFile(path.resolve(filePath));
            
            console.log(`✅ Photo de profil servie: ${filename}`);

        } catch (error) {
            console.error('❌ Erreur service photo profil:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de l\'accès à la photo');
        }
    }
);

// GET /files/uploads/:category/:subcategory/:filename - Documents privés
router.get('/uploads/:category/:subcategory/:filename',
    AuthMiddleware.authenticate(),
    verifyFileAccess,
    async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = req.filePath;
            const user = req.user;

            console.log(`📁 ${user.role} ${user.prenom} ${user.nom} accède au fichier: ${filename}`);

            // Vérifier que le fichier existe
            try {
                await stat(filePath);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return ApiResponse.notFound(res, 'Fichier non trouvé', {
                        code: 'FILE_NOT_FOUND',
                        filename
                    });
                }
                throw error;
            }

            // Déterminer le type MIME basé sur l'extension
            const ext = path.extname(filename).toLowerCase();
            const mimeTypes = {
                '.pdf': 'application/pdf',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp'
            };
            const mimeType = mimeTypes[ext] || 'application/octet-stream';

            // En-têtes de sécurité et cache
            res.set({
                'Content-Type': mimeType,
                'Content-Disposition': 'inline', // Afficher dans le navigateur si possible
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, max-age=3600', // Cache 1 heure
                'X-Frame-Options': 'DENY', // Empêcher l'intégration dans des iframes
                'X-Robots-Tag': 'noindex, nofollow' // Ne pas indexer par les moteurs de recherche
            });

            // Envoyer le fichier
            res.sendFile(path.resolve(filePath));

            console.log(`✅ Fichier servi avec succès: ${filename} à ${user.prenom} ${user.nom}`);

        } catch (error) {
            console.error('❌ Erreur service fichier:', error);
            return ApiResponse.serverError(res, 'Erreur interne lors de l\'accès au fichier');
        }
    }
);

// GET /files/health - Point de santé du service de fichiers
router.get('/health',
    async (_req, res) => {
        try {
            const uploadsDir = path.join(__dirname, '../uploads');
            
            // Vérifier l'accès aux dossiers
            await stat(uploadsDir);
            await stat(path.join(uploadsDir, 'medecins'));

            return ApiResponse.success(res, 'Service de fichiers opérationnel', {
                status: 'healthy',
                uploadsDirectory: uploadsDir,
                timestamp: new Date().toISOString(),
                storage: 'local'
            });

        } catch (error) {
            console.error('❌ Health check fichiers échoué:', error);
            return ApiResponse.serverError(res, 'Service de fichiers non opérationnel', {
                status: 'unhealthy',
                error: error.message
            });
        }
    }
);

// Middleware d'erreur pour les fichiers
router.use((error, _req, res, _next) => {
    console.error('❌ Erreur middleware fichiers:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
        return ApiResponse.badRequest(res, 'Fichier trop volumineux');
    }
    
    if (error.message && error.message.includes('ENOENT')) {
        return ApiResponse.notFound(res, 'Fichier non trouvé');
    }
    
    return ApiResponse.serverError(res, 'Erreur interne du service de fichiers');
});

module.exports = router;