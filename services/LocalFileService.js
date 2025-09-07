const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

class LocalFileService {
    constructor() {
        this.uploadsDir = path.join(__dirname, '../uploads');
        this.medecinsDir = path.join(this.uploadsDir, 'medecins');
        this.photosDir = path.join(this.uploadsDir, 'photos');
        this.allowedMimeTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/webp'
        ];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB

        // S'assurer que les dossiers existent
        this.ensureDirectoriesExist();
    }

    async ensureDirectoriesExist() {
        try {
            const dirs = [
                this.uploadsDir,
                this.medecinsDir,
                path.join(this.medecinsDir, 'diplomes'),
                path.join(this.medecinsDir, 'certifications'),
                path.join(this.medecinsDir, 'autres'),
                this.photosDir,
                path.join(this.photosDir, 'profil'),
                path.join(this.photosDir, 'cabinet')
            ];

            for (const dir of dirs) {
                try {
                    await stat(dir);
                } catch (error) {
                    if (error.code === 'ENOENT') {
                        await mkdir(dir, { recursive: true });
                        console.log(`📁 Dossier créé: ${dir}`);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Erreur création dossiers:', error);
            throw error;
        }
    }

    generateUniqueFilename(originalName, mimetype) {
        // Générer un ID unique
        const fileId = crypto.randomBytes(16).toString('hex');
        
        // Extraire l'extension du fichier
        const extension = this.getFileExtension(originalName, mimetype);
        
        return {
            fileId,
            filename: `${fileId}${extension}`,
            originalName
        };
    }

    getFileExtension(originalName, mimetype) {
        // Priorité à l'extension du nom de fichier
        const nameExtension = path.extname(originalName).toLowerCase();
        if (nameExtension) {
            return nameExtension;
        }

        // Fallback basé sur le MIME type
        const mimeExtensions = {
            'application/pdf': '.pdf',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp'
        };

        return mimeExtensions[mimetype] || '.bin';
    }

    getSubdirectory(type) {
        const typeMap = {
            'DIPLOME': 'diplomes',
            'CERTIFICATION': 'certifications',
            'PHOTO_PROFIL': 'profil',
            'PHOTO_CABINET': 'cabinet',
            'AUTRE': 'autres'
        };
        return typeMap[type] || 'autres';
    }

    getBaseDirectory(type) {
        if (type === 'PHOTO_PROFIL' || type === 'PHOTO_CABINET') {
            return this.photosDir;
        }
        return this.medecinsDir;
    }

    validateFile(fileBuffer, originalName, mimetype) {
        // Vérifier la taille
        if (fileBuffer.length > this.maxFileSize) {
            throw new Error('FILE_TOO_LARGE');
        }

        // Vérifier le type MIME
        if (!this.allowedMimeTypes.includes(mimetype)) {
            throw new Error('INVALID_MIME_TYPE');
        }

        // Vérifier que le nom n'est pas vide
        if (!originalName || originalName.trim() === '') {
            throw new Error('INVALID_FILENAME');
        }

        return true;
    }

    async uploadFile(fileBuffer, originalName, mimetype, type = 'AUTRE', libelle = null) {
        try {
            // Validation du fichier
            this.validateFile(fileBuffer, originalName, mimetype);

            // Générer le nom de fichier unique
            const { fileId, filename } = this.generateUniqueFilename(originalName, mimetype);

            // Déterminer le répertoire de base et sous-dossier
            const baseDirectory = this.getBaseDirectory(type);
            const subdirectory = this.getSubdirectory(type);
            const targetDir = path.join(baseDirectory, subdirectory);
            const filePath = path.join(targetDir, filename);

            // S'assurer que le dossier cible existe
            await mkdir(targetDir, { recursive: true });

            // Écrire le fichier
            await writeFile(filePath, fileBuffer);

            console.log(`✅ Fichier sauvegardé: ${filePath}`);

            // Retourner les métadonnées dans le même format que l'ancien service
            return {
                fileId,
                originalName,
                filename,
                size: fileBuffer.length,
                mimeType: mimetype,
                type,
                libelle,
                filePath: filePath, // Chemin absolu pour usage interne
                relativePath: path.join('uploads', baseDirectory === this.photosDir ? 'photos' : 'medecins', subdirectory, filename), // Chemin relatif pour URLs
                uploadDate: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Erreur upload fichier:', error);
            
            if (error.message === 'FILE_TOO_LARGE') {
                throw new Error('Fichier trop volumineux. Maximum: 10MB');
            }
            if (error.message === 'INVALID_MIME_TYPE') {
                throw new Error('Format de fichier non autorisé. Formats acceptés: PDF, JPG, PNG');
            }
            if (error.message === 'INVALID_FILENAME') {
                throw new Error('Nom de fichier invalide');
            }
            
            throw error;
        }
    }

    async deleteFile(fileId, type = 'AUTRE') {
        try {
            // Déterminer les répertoires à rechercher
            let baseDirectories = [];
            let subdirectories = [];

            if (type === 'PHOTO_PROFIL' || type === 'PHOTO_CABINET') {
                baseDirectories = [this.photosDir];
                subdirectories = [this.getSubdirectory(type)];
            } else if (type === 'AUTRE') {
                // Rechercher dans tous les dossiers
                baseDirectories = [this.medecinsDir, this.photosDir];
                subdirectories = ['diplomes', 'certifications', 'autres', 'profil', 'cabinet'];
            } else {
                baseDirectories = [this.medecinsDir];
                subdirectories = [this.getSubdirectory(type)];
            }

            for (const baseDir of baseDirectories) {
                for (const subdir of subdirectories) {
                    const targetDir = path.join(baseDir, subdir);
                    
                    if (!fs.existsSync(targetDir)) continue;
                    
                    const files = fs.readdirSync(targetDir);
                    
                    for (const file of files) {
                        if (file.startsWith(fileId)) {
                            const filePath = path.join(targetDir, file);
                            await unlink(filePath);
                            console.log(`🗑️ Fichier supprimé: ${filePath}`);
                            return { success: true, fileId, deletedPath: filePath };
                        }
                    }
                }
            }

            throw new Error('FILE_NOT_FOUND');
        } catch (error) {
            console.error('❌ Erreur suppression fichier:', error);
            if (error.message === 'FILE_NOT_FOUND') {
                throw new Error('Fichier non trouvé');
            }
            throw error;
        }
    }

    async getFileInfo(fileId, type = 'AUTRE') {
        try {
            const subdirectories = type === 'AUTRE' ? 
                ['diplomes', 'certifications', 'autres'] : 
                [this.getSubdirectory(type)];

            for (const subdir of subdirectories) {
                const targetDir = path.join(this.medecinsDir, subdir);
                const files = fs.readdirSync(targetDir);
                
                for (const file of files) {
                    if (file.startsWith(fileId)) {
                        const filePath = path.join(targetDir, file);
                        const stats = await stat(filePath);
                        
                        return {
                            fileId,
                            filename: file,
                            size: stats.size,
                            filePath,
                            relativePath: path.join('uploads', 'medecins', subdir, file),
                            createdAt: stats.birthtime,
                            modifiedAt: stats.mtime
                        };
                    }
                }
            }

            throw new Error('FILE_NOT_FOUND');
        } catch (error) {
            if (error.message === 'FILE_NOT_FOUND') {
                throw new Error('Fichier non trouvé');
            }
            throw error;
        }
    }

    // Méthode pour générer une URL d'accès au fichier
    generateFileUrl(relativePath, baseUrl = '') {
        // Pour l'instant, retourne le chemin relatif
        // En production, on pourrait ajouter une authentification par token
        return `${baseUrl}/files/${relativePath}`;
    }

    // Méthode utilitaire pour nettoyer les anciens fichiers (optionnel)
    async cleanupOldFiles(olderThanDays = 30) {
        try {
            const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
            const subdirectories = ['diplomes', 'certifications', 'autres'];
            let deletedCount = 0;

            for (const subdir of subdirectories) {
                const targetDir = path.join(this.medecinsDir, subdir);
                const files = fs.readdirSync(targetDir);
                
                for (const file of files) {
                    const filePath = path.join(targetDir, file);
                    const stats = await stat(filePath);
                    
                    if (stats.birthtime < cutoffDate) {
                        await unlink(filePath);
                        deletedCount++;
                        console.log(`🧹 Fichier ancien supprimé: ${filePath}`);
                    }
                }
            }

            console.log(`🧹 Nettoyage terminé: ${deletedCount} fichiers supprimés`);
            return { deletedCount, cutoffDate };
        } catch (error) {
            console.error('❌ Erreur nettoyage fichiers:', error);
            throw error;
        }
    }
}

module.exports = new LocalFileService();