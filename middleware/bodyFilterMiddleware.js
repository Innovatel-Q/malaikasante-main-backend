const ApiResponse = require('../services/ApiResponse');

/**
 * Middleware de validation modulaire et flexible
 */
class BodyFilter {

    /**
     * Valide un champ selon ses critères
     * @param {string} fieldName - Nom du champ
     * @param {any} value - Valeur à valider
     * @param {Object} rules - Règles de validation
     */
    static _validateField(fieldName, value, rules) {
        const errors = [];

        // Vérification du type
        if (rules.type) {
            switch (rules.type) {
                case 'string':
                    if (typeof value !== 'string') {
                        errors.push(`${fieldName} doit être une chaîne de caractères`);
                    }
                    break;
                case 'number':
                    if (typeof value !== 'number' && !Number.isFinite(Number(value))) {
                        errors.push(`${fieldName} doit être un nombre`);
                    }
                    break;
                case 'email':
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (typeof value !== 'string' || !emailRegex.test(value)) {
                        errors.push(`${fieldName} doit être un email valide`);
                    }
                    break;
                case 'phone':
                    const phoneRegex = /^[0-9]{8,10}$/;
                    const cleanPhone = typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '';
                    if (!phoneRegex.test(cleanPhone)) {
                        errors.push(`${fieldName} doit être un numéro de téléphone valide (8-10 chiffres)`);
                    }
                    break;
                case 'date':
                    const date = new Date(value);
                    if (isNaN(date.getTime())) {
                        errors.push(`${fieldName} doit être une date valide`);
                    }
                    break;
                case 'boolean':
                    if (typeof value !== 'boolean') {
                        errors.push(`${fieldName} doit être un booléen (true/false)`);
                    }
                    break;
                case 'array':
                    if (!Array.isArray(value)) {
                        errors.push(`${fieldName} doit être un tableau`);
                    }
                    break;
                case 'object':
                    if (typeof value !== 'object' || Array.isArray(value) || value === null) {
                        errors.push(`${fieldName} doit être un objet`);
                    }
                    break;
            }
        }

        // Si le type est invalide, pas besoin de vérifier le reste
        if (errors.length > 0) {
            return errors;
        }

        // Vérification des longueurs pour les strings
        if (typeof value === 'string') {
            const trimmedValue = value.trim();

            if (rules.minLength && trimmedValue.length < rules.minLength) {
                errors.push(`${fieldName} doit contenir au moins ${rules.minLength} caractères`);
            }

            if (rules.maxLength && trimmedValue.length > rules.maxLength) {
                errors.push(`${fieldName} ne peut pas dépasser ${rules.maxLength} caractères`);
            }
        }

        // Vérification des valeurs min/max pour les numbers
        if (typeof value === 'number' || (rules.type === 'number' && !isNaN(Number(value)))) {
            const numValue = Number(value);

            if (rules.min !== undefined && numValue < rules.min) {
                errors.push(`${fieldName} doit être supérieur ou égal à ${rules.min}`);
            }

            if (rules.max !== undefined && numValue > rules.max) {
                errors.push(`${fieldName} doit être inférieur ou égal à ${rules.max}`);
            }
        }

        // Vérification des valeurs autorisées (enum)
        if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${fieldName} doit être l'une des valeurs suivantes: ${rules.enum.join(', ')}`);
        }

        // Validation avec regex personnalisé
        if (rules.pattern && typeof value === 'string') {
            const regex = new RegExp(rules.pattern);
            if (!regex.test(value)) {
                errors.push(`${fieldName} ne respecte pas le format requis`);
            }
        }

        return errors;
    }

    /**
     * Middleware de validation principal
     * @param {Object} schema - Schéma de validation
     * @param {Object} schema.fields - Définition des champs avec leurs règles
     * @param {Array} schema.required - Champs obligatoires
     * @param {boolean} schema.strict - Mode strict (rejeter champs non définis)
     */
    static validate(schema) {
        return (req, res, next) => {
            try {
                // Initialisation du body
                if (!req.body || typeof req.body !== 'object') {
                    req.body = {};
                }

                const { fields = {}, required = [], strict = true } = schema;
                const bodyKeys = Object.keys(req.body);
                const fieldNames = Object.keys(fields);
                const allErrors = [];

                console.log(`🔍 BodyFilter - Route: ${req.method} ${req.originalUrl}`);
                console.log(`📝 Données reçues:`, bodyKeys);
                console.log(`📋 Validation schema:`, { required, fieldNames, strict });

                // Vérification des champs obligatoires manquants
                const missingFields = required.filter(field => {
                    const value = req.body[field];
                    return value === undefined ||
                        value === null ||
                        (typeof value === 'string' && value.trim() === '');
                });

                if (missingFields.length > 0) {
                    console.log(`❌ Champs obligatoires manquants:`, missingFields);
                    return ApiResponse.badRequest(res, 'Champs obligatoires manquants', {
                        missingFields,
                        requiredFields: required,
                        message: `Les champs suivants sont obligatoires: ${missingFields.join(', ')}`
                    });
                }

                // Vérification des champs non autorisés (mode strict)
                if (strict) {
                    const unauthorizedFields = bodyKeys.filter(field => !fieldNames.includes(field));

                    if (unauthorizedFields.length > 0) {
                        console.log(`❌ Champs non autorisés:`, unauthorizedFields);
                        return ApiResponse.badRequest(res, 'Champs non autorisés', {
                            unauthorizedFields,
                            allowedFields: fieldNames,
                            message: `Les champs suivants ne sont pas autorisés: ${unauthorizedFields.join(', ')}`
                        });
                    }
                }

                // Validation de chaque champ présent
                Object.keys(req.body).forEach(fieldName => {
                    const value = req.body[fieldName];
                    const rules = fields[fieldName];

                    // Si le champ n'est pas défini dans le schema et qu'on n'est pas en strict, on ignore
                    if (!rules && !strict) {
                        return;
                    }

                    // Si le champ est défini dans le schema, on valide
                    if (rules) {
                        const fieldErrors = this._validateField(fieldName, value, rules);
                        allErrors.push(...fieldErrors);
                    }
                });

                // Si des erreurs de validation
                if (allErrors.length > 0) {
                    console.log(`❌ Erreurs de validation:`, allErrors);
                    return ApiResponse.badRequest(res, 'Erreurs de validation', {
                        validationErrors: allErrors,
                        message: 'Certains champs ne respectent pas les critères de validation'
                    });
                }

                // Nettoyage et transformation des données
                Object.keys(req.body).forEach(fieldName => {
                    const value = req.body[fieldName];
                    const rules = fields[fieldName];

                    if (!rules) return;

                    // Trim des strings
                    if (typeof value === 'string') {
                        req.body[fieldName] = value.trim();
                    }

                    // Conversion des types si nécessaire
                    if (rules.type === 'number' && typeof value === 'string') {
                        req.body[fieldName] = Number(value);
                    }

                    // Nettoyage téléphone
                    if (rules.type === 'phone' && typeof value === 'string') {
                        req.body[fieldName] = value.replace(/[^0-9]/g, '');
                    }

                    // Conversion date
                    if (rules.type === 'date' && typeof value === 'string') {
                        req.body[fieldName] = new Date(value);
                    }
                });

                // Suppression des champs non autorisés en mode non-strict
                if (!strict) {
                    const filteredBody = {};
                    fieldNames.forEach(field => {
                        if (field in req.body) {
                            filteredBody[field] = req.body[field];
                        }
                    });
                    req.body = filteredBody;
                }

                // Ajout des informations de validation
                req.validation = {
                    schema,
                    processedFields: Object.keys(req.body),
                    isValid: true
                };

                console.log(`✅ Validation réussie - ${Object.keys(req.body).length} champs validés`);
                next();

            } catch (error) {
                console.error('Erreur dans bodyFilterMiddleware:', error);
                return ApiResponse.serverError(res, 'Erreur de validation des données');
            }
        };
    }
}

module.exports = BodyFilter;