# Prompt - Implémentation complète d'une phase

## Objectif
Implémenter tous les endpoints d'une phase spécifique (P1B, P2, P3, P4) en respectant l'architecture du projet médecins-patients et en suivant les spécifications du fichier `endpoints_restants.md`.

## Instructions

**RESPECTER ABSOLUMENT** l'architecture existante et les patterns établis dans le projet.

### Format de commande OBLIGATOIRE
```
/implement-phase <phase>
```
- `<phase>` = P1B | P2 | P3 | P4 (UNIQUEMENT ces valeurs)

### 0. Analyse préalable OBLIGATOIRE
1. **Lire `endpoints_restants.md`** pour identifier tous les endpoints de la phase
2. **Examiner `routes/v1.js`** pour comprendre la structure des controllers
3. **Observer `controllers/`** pour voir les patterns d'organisation existants
4. **Regarder `routes/auth/`** et `routes/patients/` pour les patterns de routes
5. **Vérifier `middleware/authMiddleware.js`** pour les autorisations
6. **Examiner `services/ApiResponse.js`** pour les réponses standardisées
7. **Observer `swagger/`** pour le style de documentation
8. **Vérifier `prisma/schema.prisma`** pour comprendre les modèles de données

### RÈGLES STRICTES à respecter

#### ❌ NE JAMAIS faire :
- Créer des controllers qui n'existent pas déjà
- Ignorer les spécifications détaillées dans `endpoints_restants.md`
- Utiliser des imports différents de ceux du projet
- Créer des structures de réponse différentes d'`ApiResponse`
- Oublier l'authentification et l'autorisation selon les spécifications

#### ✅ TOUJOURS faire :
- Suivre EXACTEMENT les spécifications de `endpoints_restants.md`
- Respecter les patterns des routes existantes
- Utiliser `AuthMiddleware.authenticate()` et `AuthMiddleware.authorize()`
- Utiliser `BodyFilter.validate()` avec des schémas appropriés
- Créer la documentation Swagger correspondante
- Mettre à jour les controllers existants avec les nouvelles routes
- Gérer les erreurs avec try/catch et ApiResponse

## Architecture de référence

### Structure des phases dans endpoints_restants.md

**Phase P1B - Fonctionnalités Avancées (HAUTE)**
- `GET /v1/patients/profile` - Récupérer le profil patient
- `PUT /v1/patients/profile` - Mettre à jour le profil
- `GET /v1/patients/medical-data` - Consulter données médicales

**Phase P2 - Recherche et Rendez-vous (HAUTE)**
- `GET /v1/doctors/search` - Recherche multicritères
- `GET /v1/doctors/{id}/details` - Profil détaillé médecin
- `GET /v1/doctors/{id}/available-slots` - Créneaux disponibles
- `POST /v1/appointments/request` - Demander RDV
- `PUT /v1/appointments/{id}/respond` - Réponse médecin
- `GET /v1/appointments` - Lister RDV utilisateur
- `DELETE /v1/appointments/{id}/cancel` - Annuler RDV
- `PUT /v1/appointments/{id}/reschedule` - Reprogrammer RDV

**Phase P3 - Administration (MOYENNE)**
- `GET /v1/admin/doctors/pending` - Médecins en attente
- `PUT /v1/admin/doctors/{id}/suspend` - Suspendre médecin
- `GET /v1/admin/patients` - Gestion patients
- `GET /v1/admin/analytics` - Tableaux de bord
- `GET /v1/admin/reports` - Rapports d'activité

**Phase P4 - Fonctionnalités Avancées (BASSE)**
- `POST /v1/consultations/{id}/prescription` - Ordonnances numériques
- `POST /v1/evaluations` - Système d'évaluation
- `GET /v1/emergency/pharmacies` - Pharmacies de garde
- `POST /v1/ai-health/conversation` - Assistant IA santé
- `GET /v1/routes/calculate` - Calcul itinéraires

### Structure des routes existantes (Pattern à suivre)
```javascript
const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

// Schéma de validation
const validationSchema = {
    fields: {
        nom: { type: 'string', minLength: 2, maxLength: 100 },
        email: { type: 'email', maxLength: 255 }
    },
    required: ['nom'],
    strict: true
};

// Route avec middleware complet
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            // Logique métier avec Prisma
            const data = await prisma.patient.findUnique({
                where: { userId: req.user.id },
                include: { user: true }
            });

            if (!data) {
                return ApiResponse.notFound(res, 'Ressource non trouvée');
            }

            return ApiResponse.success(res, 'Données récupérées', data);
        } catch (error) {
            console.error('Erreur:', error);
            return ApiResponse.serverError(res, 'Erreur serveur');
        }
    }
);

router.put('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    BodyFilter.validate(validationSchema),
    async (req, res) => {
        try {
            // Logique de mise à jour
            const updated = await prisma.patient.update({
                where: { userId: req.user.id },
                data: req.body
            });

            return ApiResponse.success(res, 'Mise à jour réussie', updated);
        } catch (error) {
            console.error('Erreur mise à jour:', error);
            return ApiResponse.serverError(res, 'Erreur serveur');
        }
    }
);

module.exports = router;
```

### Structure Swagger (Pattern à suivre)
```yaml
openapi: 3.0.0
paths:
  /v1/patients/profile:
    get:
      tags:
        - Patients
      summary: Récupérer le profil patient
      description: Permet au patient authentifié de récupérer ses informations de profil
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Profil récupéré avec succès
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  message:
                    type: string
                    example: "Profil récupéré"
                  data:
                    type: object
        '401':
          description: Non authentifié
        '404':
          description: Profil non trouvé
        '500':
          description: Erreur serveur
    put:
      tags:
        - Patients
      summary: Mettre à jour le profil
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                nom:
                  type: string
                prenom:
                  type: string
              required:
                - nom
      responses:
        '200':
          description: Profil mis à jour
        '400':
          description: Données invalides
        '401':
          description: Non authentifié
```

## Conventions du projet

### Authentification et Autorisation
- **Patients** : `AuthMiddleware.authorize(['PATIENT'])`
- **Médecins validés** : `AuthMiddleware.authorizeValidatedMedecin()`
- **Admins** : `AuthMiddleware.authorize(['ADMIN'])`
- **Médecins + Admins** : `AuthMiddleware.authorize(['MEDECIN', 'ADMIN'])`

### Réponses standardisées
- **Succès** : `ApiResponse.success(res, message, data)`
- **Erreur validation** : `ApiResponse.badRequest(res, message)`
- **Non trouvé** : `ApiResponse.notFound(res, message)`
- **Non autorisé** : `ApiResponse.unauthorized(res, message)`
- **Erreur serveur** : `ApiResponse.serverError(res, message)`

### Validation des données
- **Schema BodyFilter** : Utiliser `fields`, `required`, `strict: true`
- **Types supportés** : string, number, email, phone, date, boolean
- **Validation téléphone CI** : type 'phone' (8-10 chiffres)

### Base de données (Prisma)
- **Toujours inclure** les relations nécessaires avec `include`
- **Soft delete** : Vérifier `statut: 'ACTIF'` dans les requêtes
- **Données chiffrées** : Gérer le chiffrement/déchiffrement des données médicales
- **Transactions** : Utiliser `prisma.$transaction()` pour les opérations complexes

## Processus de travail

### Étape 1 : Analyse de la phase
1. **Lire** la section complète de la phase dans `endpoints_restants.md`
2. **Identifier** tous les endpoints avec leurs spécifications détaillées
3. **Noter** les exigences d'authentification, de validation, et d'estimation
4. **Comprendre** les relations entre les endpoints de la phase

### Étape 2 : Planification
1. **Organiser** les endpoints par domaine (patients, doctors, appointments, admin)
2. **Identifier** les nouveaux controllers/routes à créer
3. **Planifier** l'ordre d'implémentation (dépendances)
4. **Préparer** les schémas de validation nécessaires

### Étape 3 : Implémentation systématique

#### Pour chaque endpoint :

1. **Créer le fichier route** dans `routes/<domaine>/<nom-route>.js`
   - Suivre le pattern des routes existantes
   - Implémenter la logique métier selon les spécifications
   - Ajouter l'authentification et autorisation appropriées
   - Utiliser les schémas BodyFilter requis

2. **Créer la documentation Swagger** dans `swagger/<domaine>/<nom-route>.yaml`
   - Respecter le format OpenAPI 3.0.0
   - Documenter tous les paramètres et réponses
   - Inclure les exemples de réponse

3. **Mettre à jour le controller** approprié
   - Ajouter l'import de la nouvelle route
   - Monter la route avec `router.use()`

### Étape 4 : Tests et Validation
1. **Exécuter** `npm run dev` pour vérifier le démarrage
2. **Tester** chaque endpoint via Swagger UI (`/v1/api-docs`)
3. **Vérifier** l'authentification et l'autorisation
4. **Valider** les réponses selon les spécifications

### Étape 5 : Intégration complète
1. **S'assurer** que tous les endpoints de la phase fonctionnent
2. **Vérifier** les interactions entre les endpoints
3. **Tester** les cas d'erreur et les validations
4. **Documenter** les changements apportés

## Instructions de test final

Après l'implémentation complète de la phase :

1. **Toujours exécuter** `npm run dev` sans erreurs
2. **Vérifier** l'accès à `/v1/api-docs` avec la nouvelle documentation
3. **Tester** quelques endpoints clés de la phase via Swagger
4. **S'assurer** que l'authentification fonctionne correctement
5. **Valider** que les réponses respectent le format ApiResponse

### En cas d'erreur :
1. **Analyser** les logs d'erreur attentivement
2. **Vérifier** la syntaxe et les imports
3. **Contrôler** que les routes sont correctement montées
4. **S'assurer** que les modèles Prisma correspondent aux requêtes

Le processus n'est terminé que quand tous les endpoints de la phase sont implémentés, testés et fonctionnels.

## Exemples concrets par phase

### Commande : `/implement-phase P1B`
**Résultat attendu :**
- 3 endpoints patients implémentés
- Routes dans `routes/patients/`
- Documentation Swagger mise à jour
- Controller PatientController.js mis à jour
- Tests fonctionnels réussis

### Commande : `/implement-phase P2`
**Résultat attendu :**
- 8 endpoints de recherche et RDV implémentés
- Nouveaux domaines : doctors, appointments
- Logique complexe de recherche et disponibilités
- Gestion des notifications
- Tests d'intégration complets

Le projet doit rester stable et tous les endpoints existants doivent continuer à fonctionner après l'implémentation.