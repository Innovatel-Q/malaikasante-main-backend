const TokenService = require('../services/TokenService');
const ApiResponse = require('../services/ApiResponse');
const prisma = require('../prisma/client');

/**
 * Middleware d'authentification et d'autorisation avec Prisma
 */
class AuthMiddleware {

    /**
     * Middleware d'authentification - vérifie la validité du token JWT
     */
    static authenticate() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                const clientIp = req.ip || req.connection.remoteAddress;

                // Vérification de la présence du token
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return ApiResponse.unauthorized(res, 'Token d\'authentification requis');
                }

                const token = authHeader.substring(7);

                // Vérification de la validité du token
                const tokenCheck = TokenService.checkToken(token);
                if (!tokenCheck.isValid) {
                    const message = tokenCheck.expired
                        ? 'Token expiré, veuillez vous reconnecter'
                        : 'Token invalide';
                    return ApiResponse.unauthorized(res, message);
                }

                // Récupération de l'utilisateur depuis la base de données
                const user = await prisma.user.findUnique({
                    where: {
                        id: tokenCheck.payload.userId,
                        statut: 'ACTIF'  // Seulement les utilisateurs actifs
                    },
                    include: {
                        patient: true,
                        medecin: {
                            include: {
                                clinique: true
                            }
                        }
                    }
                });

                if (!user) {
                    console.log(`❌ Utilisateur non trouvé ou inactif: ${tokenCheck.payload.userId}`);
                    return ApiResponse.unauthorized(res, 'Utilisateur non trouvé ou inactif');
                }

                // Vérification que le rôle correspond
                if (user.role !== tokenCheck.payload.role) {
                    console.log(`❌ Rôle utilisateur incohérent: DB=${user.role}, Token=${tokenCheck.payload.role}`);
                    return ApiResponse.unauthorized(res, 'Token invalide');
                }

                // Ajout des informations utilisateur dans req
                req.user = user;
                req.token = token;

                console.log(`🔐 Auth réussie pour ${user.prenom} ${user.nom} (${user.role}) - IP: ${clientIp}`);
                next();

            } catch (error) {
                console.error('Erreur dans authMiddleware.authenticate:', error);
                return ApiResponse.serverError(res, 'Erreur d\'authentification');
            }
        };
    }

    /**
     * Middleware d'autorisation - vérifie les rôles autorisés
     */
    static authorize(allowedRoles) {
        return async (req, res, next) => {
            try {
                // Vérification que l'authentification a eu lieu
                if (!req.user) {
                    return ApiResponse.unauthorized(res, 'Authentification requise');
                }

                // Normalisation des rôles autorisés
                const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
                const userRole = req.user.role;
                const clientIp = req.ip || req.connection.remoteAddress;

                // Vérification du rôle
                if (!roles.includes(userRole)) {
                    console.log(`❌ Accès refusé - User: ${req.user.prenom} ${req.user.nom} (${userRole}) - Rôles requis: [${roles.join(', ')}] - IP: ${clientIp}`);
                    return ApiResponse.forbidden(res, 'Accès refusé - Permissions insuffisantes');
                }

                console.log(`✅ Autorisation accordée - User: ${req.user.prenom} ${req.user.nom} (${userRole}) - Route: ${req.method} ${req.originalUrl}`);
                next();

            } catch (error) {
                console.error('Erreur dans authMiddleware.authorize:', error);
                return ApiResponse.serverError(res, 'Erreur d\'autorisation');
            }
        };
    }

    /**
     * Middleware spécialisé pour les médecins validés uniquement
     */
    static authorizeValidatedMedecin() {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return ApiResponse.unauthorized(res, 'Authentification requise');
                }

                if (req.user.role !== 'MEDECIN') {
                    return ApiResponse.forbidden(res, 'Accès réservé aux médecins');
                }

                if (!req.user.medecin || req.user.medecin.statutValidation !== 'VALIDE') {
                    return ApiResponse.forbidden(res, 'Compte médecin non validé par l\'administration');
                }

                console.log(`✅ Médecin validé autorisé: Dr ${req.user.prenom} ${req.user.nom}`);
                next();

            } catch (error) {
                console.error('Erreur dans authorizeValidatedMedecin:', error);
                return ApiResponse.serverError(res, 'Erreur d\'autorisation');
            }
        };
    }
}

module.exports = AuthMiddleware;