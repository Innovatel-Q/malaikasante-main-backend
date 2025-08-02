/**
 * Service de gestion des réponses API standardisées
 * Uniformise toutes les réponses HTTP de l'application
 */
class ApiResponse {
    /**
     * Réponse réussie avec données (200)
     */
    static success(res, message, data = null) {
        return res.status(200).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Réponse en cas de création réussie (201)
     */
    static created(res, message, data = null) {
        return res.status(201).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Réponse en cas de requête incorrecte (400)
     */
    static badRequest(res, message, data = null) {
        return res.status(400).json({
            success: false,
            error: 'BAD_REQUEST',
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Réponse en cas d'accès non autorisé (401)
     */
    static unauthorized(res, message, data = null) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Réponse en cas d'accès interdit (403)
     */
    static forbidden(res, message, data = null) {
        return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Réponse en cas de ressource non trouvée (404)
     */
    static notFound(res, message, data = null) {
        return res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Réponse en cas d'erreur serveur (500)
     */
    static serverError(res, message, data = null) {
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = ApiResponse;