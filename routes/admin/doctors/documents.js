// routes/admin/doctors/documents.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const prisma = require('../../../prisma/client');
const ApiResponse = require('../../../services/ApiResponse');
const LocalFileService = require('../../../services/LocalFileService');
const AuthMiddleware = require('../../../middleware/authMiddleware');
const BodyFilter = require('../../../middleware/bodyFilterMiddleware');

// Configuration multer pour upload en mémoire
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Types MIME autorisés pour les documents médicaux
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

// Schéma de validation pour les actions sur les documents
const documentActionSchema = {
    fields: {
        action: {
            type: 'string',
            enum: ['ADD', 'UPDATE', 'DELETE', 'LIST']
        },
        documentId: {
            type: 'string'
        },
        libelle: {
            type: 'string',
            minLength: 3,
            maxLength: 200
        },
        type: {
            type: 'string',
            enum: ['DIPLOME', 'CERTIFICATION', 'AUTRE']
        },
        description: {
            type: 'string',
            maxLength: 500
        }
    },
    required: ['action'],
    strict: false // Permettre d'autres champs comme file
};

// PUT /v1/admin/doctors/:medecinId/documents
router.put('/:medecinId/documents',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['ADMIN']),
    upload.single('document'), // Optionnel selon l'action
    BodyFilter.validate(documentActionSchema),
    async (req, res) => {
        try {
            const { medecinId } = req.params;
            const { action, documentId, libelle, type = 'AUTRE', description } = req.body;
            const adminUser = req.user;
            const clientIp = req.ip || req.connection.remoteAddress;

            console.log(`📄 Admin ${adminUser.prenom} ${adminUser.nom} - Action: ${action} sur document médecin: ${medecinId}`);

            // Vérifier que le médecin existe
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

            // Récupérer les documents existants selon le type
            const getExistingDocuments = (type) => {
                if (type === 'DIPLOME') {
                    return Array.isArray(medecin.diplomes) ? medecin.diplomes : (medecin.diplomes ? [medecin.diplomes] : []);
                } else if (type === 'CERTIFICATION') {
                    return Array.isArray(medecin.certifications) ? medecin.certifications : (medecin.certifications ? [medecin.certifications] : []);
                } else {
                    // Pour AUTRE, on cherche dans les deux
                    const diplomes = Array.isArray(medecin.diplomes) ? medecin.diplomes : (medecin.diplomes ? [medecin.diplomes] : []);
                    const certifications = Array.isArray(medecin.certifications) ? medecin.certifications : (medecin.certifications ? [medecin.certifications] : []);
                    return [...diplomes, ...certifications];
                }
            };

            // === TRAITEMENT SELON L'ACTION ===
            switch (action) {
                case 'LIST':
                    // Lister tous les documents
                    const allDiplomes = Array.isArray(medecin.diplomes) ? medecin.diplomes : (medecin.diplomes ? [medecin.diplomes] : []);
                    const allCertifications = Array.isArray(medecin.certifications) ? medecin.certifications : (medecin.certifications ? [medecin.certifications] : []);

                    return ApiResponse.success(res, 'Documents récupérés avec succès', {
                        medecin: {
                            id: medecin.id,
                            nom: medecin.user.nom,
                            prenom: medecin.user.prenom
                        },
                        documents: {
                            diplomes: allDiplomes.map(doc => ({
                                ...doc,
                                type: 'DIPLOME',
                                documentId: doc.fileId || doc.id
                            })),
                            certifications: allCertifications.map(doc => ({
                                ...doc,
                                type: 'CERTIFICATION',
                                documentId: doc.fileId || doc.id
                            }))
                        },
                        statistiques: {
                            totalDiplomes: allDiplomes.length,
                            totalCertifications: allCertifications.length,
                            total: allDiplomes.length + allCertifications.length
                        }
                    });

                case 'ADD':
                    // Ajouter un nouveau document
                    if (!req.file) {
                        return ApiResponse.badRequest(res, 'Fichier requis pour ajouter un document', {
                            code: 'FILE_REQUIRED',
                            action: 'ADD'
                        });
                    }

                    if (!libelle) {
                        return ApiResponse.badRequest(res, 'Libellé requis pour ajouter un document', {
                            code: 'LIBELLE_REQUIRED',
                            field: 'libelle'
                        });
                    }

                    // Upload du fichier
                    const uploadResult = await LocalFileService.uploadFile(
                        req.file.buffer,
                        req.file.originalname,
                        req.file.mimetype,
                        type,
                        libelle
                    );

                    // Préparer le document
                    const nouveauDocument = {
                        fileId: uploadResult.fileId,
                        filename: uploadResult.filename,
                        originalName: uploadResult.originalName,
                        libelle: libelle.trim(),
                        type,
                        description: description ? description.trim() : null,
                        size: uploadResult.size,
                        mimeType: uploadResult.mimeType,
                        filePath: uploadResult.filePath, // Pour stockage local
                        relativePath: uploadResult.relativePath, // Pour URLs
                        uploadDate: uploadResult.uploadDate,
                        uploadedByAdminId: adminUser.id,
                        uploadedByAdminName: `${adminUser.prenom} ${adminUser.nom}`
                    };

                    // Ajouter aux documents existants
                    const documentsExistants = getExistingDocuments(type);
                    documentsExistants.push(nouveauDocument);

                    // Mise à jour en base
                    const updateData = {};
                    if (type === 'DIPLOME') {
                        updateData.diplomes = documentsExistants;
                    } else {
                        updateData.certifications = documentsExistants;
                    }

                    await prisma.medecin.update({
                        where: { id: medecinId },
                        data: updateData
                    });

                    console.log(`✅ Document ajouté: ${libelle} pour Dr ${medecin.user.prenom} ${medecin.user.nom}`);

                    return ApiResponse.created(res, 'Document ajouté avec succès', {
                        document: {
                            documentId: nouveauDocument.fileId,
                            libelle: nouveauDocument.libelle,
                            type: nouveauDocument.type,
                            description: nouveauDocument.description,
                            filename: nouveauDocument.filename,
                            size: nouveauDocument.size,
                            mimeType: nouveauDocument.mimeType
                        },
                        medecin: {
                            id: medecin.id,
                            nom: medecin.user.nom,
                            prenom: medecin.user.prenom
                        },
                        upload: {
                            uploadedBy: nouveauDocument.uploadedByAdminName,
                            uploadedAt: nouveauDocument.uploadDate,
                            storageMode: 'local'
                        }
                    });

                case 'UPDATE':
                    // Modifier un document existant
                    if (!documentId) {
                        return ApiResponse.badRequest(res, 'ID du document requis pour la mise à jour', {
                            code: 'DOCUMENT_ID_REQUIRED',
                            action: 'UPDATE'
                        });
                    }

                    // Trouver le document dans tous les types
                    let documentTrouve = null;
                    let typeDocument = null;
                    let indexDocument = -1;

                    // Chercher dans les diplômes
                    const diplomes = Array.isArray(medecin.diplomes) ? medecin.diplomes : (medecin.diplomes ? [medecin.diplomes] : []);
                    indexDocument = diplomes.findIndex(doc => doc.fileId === documentId || doc.id === documentId);
                    if (indexDocument !== -1) {
                        documentTrouve = diplomes[indexDocument];
                        typeDocument = 'DIPLOME';
                    }

                    // Chercher dans les certifications si pas trouvé
                    if (!documentTrouve) {
                        const certifications = Array.isArray(medecin.certifications) ? medecin.certifications : (medecin.certifications ? [medecin.certifications] : []);
                        indexDocument = certifications.findIndex(doc => doc.fileId === documentId || doc.id === documentId);
                        if (indexDocument !== -1) {
                            documentTrouve = certifications[indexDocument];
                            typeDocument = 'CERTIFICATION';
                        }
                    }

                    if (!documentTrouve) {
                        return ApiResponse.notFound(res, 'Document non trouvé', {
                            code: 'DOCUMENT_NOT_FOUND',
                            documentId
                        });
                    }

                    // Mise à jour des métadonnées
                    const documentMisAJour = { ...documentTrouve };
                    if (libelle) documentMisAJour.libelle = libelle.trim();
                    if (description !== undefined) documentMisAJour.description = description ? description.trim() : null;
                    if (type && type !== typeDocument) {
                        // Changement de type nécessite déplacement
                        documentMisAJour.type = type;
                    }
                    documentMisAJour.lastUpdatedBy = `${adminUser.prenom} ${adminUser.nom}`;
                    documentMisAJour.lastUpdatedAt = new Date().toISOString();

                    // Gestion du changement de fichier si fourni
                    if (req.file) {
                        // Supprimer l'ancien fichier
                        try {
                            await LocalFileService.deleteFile(documentTrouve.fileId, typeDocument);
                        } catch (deleteError) {
                            console.warn('⚠️ Impossible de supprimer l\'ancien fichier:', deleteError.message);
                        }

                        // Upload du nouveau fichier
                        const newUploadResult = await LocalFileService.uploadFile(
                            req.file.buffer,
                            req.file.originalname,
                            req.file.mimetype,
                            type || typeDocument,
                            libelle || documentTrouve.libelle
                        );

                        // Mettre à jour les infos de fichier
                        documentMisAJour.fileId = newUploadResult.fileId;
                        documentMisAJour.filename = newUploadResult.filename;
                        documentMisAJour.originalName = newUploadResult.originalName;
                        documentMisAJour.size = newUploadResult.size;
                        documentMisAJour.mimeType = newUploadResult.mimeType;
                        documentMisAJour.filePath = newUploadResult.filePath;
                        documentMisAJour.relativePath = newUploadResult.relativePath;
                    }

                    // Mise à jour en base
                    const updateDocuments = typeDocument === 'DIPLOME' ? diplomes : 
                                           Array.isArray(medecin.certifications) ? medecin.certifications : (medecin.certifications ? [medecin.certifications] : []);
                    updateDocuments[indexDocument] = documentMisAJour;

                    const updateDataForUpdate = {};
                    if (typeDocument === 'DIPLOME') {
                        updateDataForUpdate.diplomes = updateDocuments;
                    } else {
                        updateDataForUpdate.certifications = updateDocuments;
                    }

                    await prisma.medecin.update({
                        where: { id: medecinId },
                        data: updateDataForUpdate
                    });

                    console.log(`✅ Document mis à jour: ${documentMisAJour.libelle} pour Dr ${medecin.user.prenom} ${medecin.user.nom}`);

                    return ApiResponse.success(res, 'Document mis à jour avec succès', {
                        document: {
                            documentId: documentMisAJour.fileId,
                            libelle: documentMisAJour.libelle,
                            type: documentMisAJour.type,
                            description: documentMisAJour.description,
                            filename: documentMisAJour.filename,
                            size: documentMisAJour.size,
                            mimeType: documentMisAJour.mimeType,
                            fileChanged: !!req.file
                        },
                        updateInfo: {
                            updatedBy: documentMisAJour.lastUpdatedBy,
                            updatedAt: documentMisAJour.lastUpdatedAt
                        }
                    });

                case 'DELETE':
                    // Supprimer un document
                    if (!documentId) {
                        return ApiResponse.badRequest(res, 'ID du document requis pour la suppression', {
                            code: 'DOCUMENT_ID_REQUIRED',
                            action: 'DELETE'
                        });
                    }

                    // Trouver et supprimer le document
                    let documentSupprime = null;
                    let typeSupprime = null;

                    // Chercher dans les diplômes
                    let diplomesForDelete = Array.isArray(medecin.diplomes) ? [...medecin.diplomes] : (medecin.diplomes ? [medecin.diplomes] : []);
                    const indexDiplome = diplomesForDelete.findIndex(doc => doc.fileId === documentId || doc.id === documentId);
                    if (indexDiplome !== -1) {
                        documentSupprime = diplomesForDelete[indexDiplome];
                        diplomesForDelete.splice(indexDiplome, 1);
                        typeSupprime = 'DIPLOME';
                    }

                    // Chercher dans les certifications si pas trouvé
                    let certificationsForDelete = Array.isArray(medecin.certifications) ? [...medecin.certifications] : (medecin.certifications ? [medecin.certifications] : []);
                    if (!documentSupprime) {
                        const indexCertification = certificationsForDelete.findIndex(doc => doc.fileId === documentId || doc.id === documentId);
                        if (indexCertification !== -1) {
                            documentSupprime = certificationsForDelete[indexCertification];
                            certificationsForDelete.splice(indexCertification, 1);
                            typeSupprime = 'CERTIFICATION';
                        }
                    }

                    if (!documentSupprime) {
                        return ApiResponse.notFound(res, 'Document non trouvé', {
                            code: 'DOCUMENT_NOT_FOUND',
                            documentId
                        });
                    }

                    // Supprimer le fichier physique
                    try {
                        await LocalFileService.deleteFile(documentSupprime.fileId, typeSupprime);
                    } catch (deleteError) {
                        console.warn('⚠️ Impossible de supprimer le fichier physique:', deleteError.message);
                        // Continue quand même car on supprime les métadonnées
                    }

                    // Mise à jour en base
                    const updateDataForDelete = {};
                    if (typeSupprime === 'DIPLOME') {
                        updateDataForDelete.diplomes = diplomesForDelete;
                    } else {
                        updateDataForDelete.certifications = certificationsForDelete;
                    }

                    await prisma.medecin.update({
                        where: { id: medecinId },
                        data: updateDataForDelete
                    });

                    console.log(`🗑️ Document supprimé: ${documentSupprime.libelle} pour Dr ${medecin.user.prenom} ${medecin.user.nom}`);

                    return ApiResponse.success(res, 'Document supprimé avec succès', {
                        deletedDocument: {
                            documentId: documentSupprime.fileId,
                            libelle: documentSupprime.libelle,
                            type: typeSupprime,
                            filename: documentSupprime.filename
                        },
                        deleteInfo: {
                            deletedBy: `${adminUser.prenom} ${adminUser.nom}`,
                            deletedAt: new Date().toISOString(),
                            physicalFileDeleted: true
                        }
                    });

                default:
                    return ApiResponse.badRequest(res, 'Action non reconnue', {
                        code: 'INVALID_ACTION',
                        allowedActions: ['ADD', 'UPDATE', 'DELETE', 'LIST']
                    });
            }

        } catch (error) {
            console.error('❌ Erreur gestion documents médecin:', error);

            // Gestion des erreurs spécifiques de multer
            if (error.code === 'LIMIT_FILE_SIZE') {
                return ApiResponse.badRequest(res, 'Fichier trop volumineux. Maximum: 10MB', {
                    code: 'FILE_TOO_LARGE',
                    maxSize: '10MB'
                });
            }

            // Gestion des erreurs de service fichiers
            if (error.message && (error.message.includes('upload') || error.message.includes('fichier'))) {
                return ApiResponse.serverError(res, 'Erreur lors de la gestion du fichier', {
                    code: 'FILE_SERVICE_ERROR'
                });
            }

            // Erreur générale
            return ApiResponse.serverError(res, 'Erreur interne lors de la gestion des documents');
        }
    }
);

module.exports = router;