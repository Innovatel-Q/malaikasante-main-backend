# 🏥 Plateforme de Mise en Relation Médecins-Patients

API backend pour la mise en relation médecins-patients en Côte d'Ivoire, développée par **LYCORIS GROUP**.

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.2-blue.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.12.0-indigo.svg)](https://www.prisma.io/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange.svg)](https://www.mysql.com/)

## 📋 Table des Matières

- [🏗️ Architecture du Projet](#️-architecture-du-projet)
- [📁 Structure des Dossiers](#-structure-des-dossiers)
- [⚙️ Configuration](#️-configuration)
- [🛡️ Middleware](#️-middleware)
- [🔄 Workflow de Développement](#-workflow-de-développement)
- [📊 Phases de Développement](#-phases-de-développement)
- [🚀 Guide de Démarrage](#-guide-de-démarrage)
- [📖 Documentation API](#-documentation-api)
- [🧪 Tests](#-tests)
- [🔧 Déploiement](#-déploiement)

---

## 🏗️ Architecture du Projet

### Stack Technique
- **Backend** : Node.js + Express.js
- **Base de données** : MySQL + Prisma ORM
- **Authentification** : JWT + OTP (SMS via LeTexto)
- **Documentation** : Swagger/OpenAPI
- **Validation** : Express-validator + Middleware custom
- **Chiffrement** : bcrypt + AES-256 pour données sensibles

### Principes Architecturaux
- **Séparation des responsabilités** : Controllers → Services → Prisma
- **Validation en couches** : BodyFilter → Business Logic → Database
- **Sécurité by design** : Authentification + autorisation granulaire
- **API RESTful** : Standards HTTP + codes de statut appropriés

---

## 📁 Structure des Dossiers

```
medecins-patients-backend/
├── 📁 bin/                     # Point d'entrée serveur
│   └── www                     # Serveur HTTP avec gestion multi-env
├── 📁 config/                  # Configuration centralisée
│   ├── const.js               # Constantes globales (JWT, SMS, OTP)
│   └── swagger.js             # Configuration documentation API
├── 📁 controllers/            # Logique métier et orchestration
│   └── AuthController.js      # Routage des endpoints d'auth
├── 📁 middleware/             # Couches de validation et sécurité
│   ├── authMiddleware.js      # Authentification + autorisation
│   └── bodyFilterMiddleware.js # Validation et nettoyage données
├── 📁 prisma/                 # ORM et base de données
│   ├── client.js              # Instance Prisma configurée
│   ├── schema.prisma          # Modèle de données complet
│   └── migrations/            # Évolutions de schéma
├── 📁 routes/                 # Endpoints spécialisés
│   ├── v1.js                  # Router principal API v1
│   └── auth/                  # Routes d'authentification
│       ├── otp-send.js        # Génération et envoi OTP
│       ├── otp-verify.js      # Vérification OTP + connexion
│       ├── register-patient.js # Inscription patients (SANS password)
│       ├── register-medecin.js # Inscription médecins (AVEC password)
│       ├── login.js           # Connexion email/password (médecins/admins)
│       └── me.js              # Informations utilisateur connecté
├── 📁 services/               # Services métier et utilitaires
│   ├── ApiResponse.js         # Réponses HTTP standardisées
│   ├── TokenService.js        # Gestion JWT (génération/vérification)
│   └── SmsService.js          # Envoi SMS via API LeTexto
├── 📁 swagger/                # Documentation OpenAPI
│   ├── info/                  # Endpoints système
│   └── auth/                  # Documentation authentification
├── 📁 test/                   # Scripts de test et validation
├── 📁 public/                 # Assets statiques
├── app.js                     # Configuration Express principale
├── package.json               # Dépendances et scripts npm
└── .env                       # Variables d'environnement
```

### Rôle de Chaque Dossier

#### 📁 `bin/` - Serveur HTTP
- **`www`** : Point d'entrée avec gestion des ports par environnement
- **Responsabilité** : Démarrage serveur, gestion erreurs réseau, logs de démarrage

#### 📁 `config/` - Configuration Centralisée
- **Responsabilité** : Toutes les configurations applicatives en un seul endroit
- **Avantage** : Facilite la maintenance et les changements d'environnement

#### 📁 `controllers/` - Orchestration Métier
- **Responsabilité** : Assemblage des routes par domaine fonctionnel
- **Pattern** : Un controller = un domaine métier (Auth, Patient, Médecin, Admin)

#### 📁 `middleware/` - Couches Transversales
- **Responsabilité** : Validation, sécurité, transformation des données
- **Exécution** : Avant les controllers dans la chaîne Express

#### 📁 `routes/` - Endpoints Spécialisés
- **Responsabilité** : Logique métier spécifique de chaque endpoint
- **Pattern** : Organisation hiérarchique par fonctionnalité

#### 📁 `services/` - Services Métier
- **Responsabilité** : Logique réutilisable, intégrations externes
- **Indépendance** : Pas de dépendance à Express (testabilité)

---

## ⚙️ Configuration

### 📄 `config/const.js` - Constantes Globales

```javascript
class Consts {
    // 🏷️ Informations application
    static APP_NAME = "Plateforme Médecins-Patients";
    static APP_AUTHOR = "LYCORIS GROUP";
    
    // 🔐 JWT par environnement (sécurité)
    static JWT_SECRET = (() => {
        const env = process.env.NODE_ENV || 'development';
        switch (env) {
            case 'production': return process.env.JWT_SECRET_PROD;
            case 'test': return process.env.JWT_SECRET_TEST;
            default: return process.env.JWT_SECRET_DEV;
        }
    })();
    
    // 📱 Configuration SMS LeTexto (Côte d'Ivoire)
    static SMS_CONFIG = {
        baseUrl: process.env.LETEXTO_API_URL,
        apiKey: process.env.LETEXTO_API_KEY,
        sender: 'REXTO',
        countryCode: '225'
    };
    
    // 🔢 Configuration OTP
    static OTP_CONFIG = {
        length: 4,               // Code à 4 chiffres
        expirationMinutes: 5,    // Validité 5 minutes
        maxAttempts: 3           // 3 tentatives max
    };
    
    // ⏰ Durées tokens JWT par rôle
    static JWT_EXPIRATION = {
        PATIENT: { access: '7d', refresh: '30d' },
        MEDECIN: { access: '1d', refresh: '30d' },
        ADMIN: { access: '1d', refresh: null }  // Pas de refresh pour admins
    };
}
```

**Usage** : `const Consts = require('./config/const');`

### 📄 `config/swagger.js` - Documentation API

```javascript
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: "API Plateforme Médecins-Patients",
            version: '1.0.0',
        },
        servers: getServers(), // URLs selon environnement
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: ['./swagger/**/*.yaml', './routes/**/*.js']
};
```

**Accès** : `http://localhost:3000/v1/api-docs`

---

## 🛡️ Middleware

### 🔐 `authMiddleware.js` - Authentification & Autorisation

#### `authenticate()` - Vérification des Tokens JWT
```javascript
AuthMiddleware.authenticate()
```
- **Rôle** : Valide le token JWT dans l'en-tête Authorization
- **Ajouts à `req`** : `req.user` (données utilisateur), `req.token`
- **Erreurs** : 401 si token invalide/expiré, 404 si utilisateur introuvable

#### `authorize(roles)` - Contrôle des Permissions
```javascript
AuthMiddleware.authorize(['PATIENT'])           // Un seul rôle
AuthMiddleware.authorize(['MEDECIN', 'ADMIN'])  // Plusieurs rôles
```
- **Rôle** : Vérifie que l'utilisateur a l'un des rôles autorisés
- **Prérequis** : Doit être utilisé APRÈS `authenticate()`

#### `authorizeValidatedMedecin()` - Médecins Validés Uniquement
```javascript
AuthMiddleware.authorizeValidatedMedecin()
```
- **Rôle** : Autorise uniquement les médecins avec `statutValidation: 'VALIDE'`
- **Usage** : Endpoints réservés aux médecins en exercice

**Exemple d'utilisation complète :**
```javascript
router.get('/profile',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    (req, res) => {
        // req.user contient les données du patient authentifié
    }
);
```

### ✅ `bodyFilterMiddleware.js` - Validation des Données

#### Configuration des Schémas
```javascript
const schema = {
    fields: {
        email: {
            type: 'email',
            maxLength: 255
        },
        telephone: {
            type: 'phone'  // Validation spéciale CI (8-10 chiffres)
        },
        nom: {
            type: 'string',
            minLength: 2,
            maxLength: 100
        },
        age: {
            type: 'number',
            min: 0,
            max: 120
        },
        role: {
            type: 'string',
            enum: ['PATIENT', 'MEDECIN', 'ADMIN']
        }
    },
    required: ['email', 'telephone'],  // Champs obligatoires
    strict: true                       // Rejeter champs non autorisés
};

router.post('/', BodyFilter.validate(schema), handler);
```

#### Types de Validation Supportés
- **`string`** : Chaîne avec longueurs min/max
- **`number`** : Nombre avec valeurs min/max
- **`email`** : Format email valide
- **`phone`** : Téléphone ivoirien (8-10 chiffres)
- **`date`** : Date valide
- **`boolean`** : Booléen strict
- **`array`** : Tableau
- **`object`** : Objet
- **`enum`** : Valeur dans liste prédéfinie

#### Nettoyage Automatique
- **Trim** des chaînes
- **Suppression** caractères non-numériques des téléphones
- **Conversion** de types si nécessaire
- **Validation** et transformation en une seule étape

---

## 🔄 Workflow de Développement

### 📋 Processus Complet : Créer un Endpoint

#### Étape 1 : Définir le Schéma de Validation
```javascript
// routes/patients/profile.js
const profileSchema = {
    fields: {
        nom: { type: 'string', minLength: 2, maxLength: 100 },
        prenom: { type: 'string', minLength: 2, maxLength: 100 },
        dateNaissance: { type: 'date' },
        sexe: { type: 'string', enum: ['M', 'F', 'AUTRE'] }
    },
    required: ['nom', 'prenom'],
    strict: true
};
```

#### Étape 2 : Créer la Route Spécialisée
```javascript
// routes/patients/profile.js
const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const ApiResponse = require('../../services/ApiResponse');
const AuthMiddleware = require('../../middleware/authMiddleware');
const BodyFilter = require('../../middleware/bodyFilterMiddleware');

/**
 * GET /v1/patients/profile - Récupérer le profil patient
 */
router.get('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    async (req, res) => {
        try {
            const patient = await prisma.patient.findUnique({
                where: { userId: req.user.id },
                include: { user: true }
            });
            
            if (!patient) {
                return ApiResponse.notFound(res, 'Profil patient non trouvé');
            }
            
            return ApiResponse.success(res, 'Profil récupéré', {
                id: patient.id,
                nom: patient.user.nom,
                prenom: patient.user.prenom,
                // ... autres données
            });
        } catch (error) {
            console.error('Erreur récupération profil:', error);
            return ApiResponse.serverError(res, 'Erreur serveur');
        }
    }
);

/**
 * PUT /v1/patients/profile - Mettre à jour le profil
 */
router.put('/',
    AuthMiddleware.authenticate(),
    AuthMiddleware.authorize(['PATIENT']),
    BodyFilter.validate(profileSchema),
    async (req, res) => {
        try {
            const { nom, prenom, dateNaissance, sexe } = req.body;
            
            // Logique de mise à jour...
            
            return ApiResponse.success(res, 'Profil mis à jour', updatedData);
        } catch (error) {
            console.error('Erreur mise à jour profil:', error);
            return ApiResponse.serverError(res, 'Erreur serveur');
        }
    }
);

module.exports = router;
```

#### Étape 3 : Intégrer au Controller
```javascript
// controllers/PatientController.js
const express = require('express');
const router = express.Router();

const profileRoute = require('../routes/patients/profile');
const medicalDataRoute = require('../routes/patients/medical-data');

// Montage des routes spécialisées
router.use('/profile', profileRoute);
router.use('/medical-data', medicalDataRoute);

module.exports = router;
```

#### Étape 4 : Connecter au Router Principal
```javascript
// routes/v1.js
const patientController = require('../controllers/PatientController');
router.use('/patients', patientController);
```

#### Étape 5 : Créer la Documentation Swagger
```yaml
# swagger/patients/profile.yaml
openapi: 3.0.0
paths:
  /v1/patients/profile:
    get:
      tags:
        - Patients
      summary: Récupérer le profil patient
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
                    properties:
                      id:
                        type: string
                      nom:
                        type: string
                      prenom:
                        type: string
```

#### Étape 6 : Tester et Valider
```bash
# Tests manuels
curl -X GET http://localhost:3000/v1/patients/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Tests automatisés
npm test -- routes/patients/profile.test.js
```

### 🔄 Résultat : Endpoint Accessible
```
GET /v1/patients/profile
PUT /v1/patients/profile
```

### 📝 Conventions de Code

#### Nomenclature des Fichiers
- **Routes** : `kebab-case.js` (ex: `medical-data.js`)
- **Controllers** : `PascalCase.js` (ex: `PatientController.js`)
- **Services** : `PascalCase.js` (ex: `TokenService.js`)

#### Structure des Réponses API
```javascript
// Succès
ApiResponse.success(res, message, data)
// {
//   "success": true,
//   "message": "...",
//   "data": {...},
//   "timestamp": "2024-01-15T14:30:22.123Z"
// }

// Erreur
ApiResponse.badRequest(res, message, data)
// {
//   "success": false,
//   "error": "BAD_REQUEST",
//   "message": "...",
//   "data": {...},
//   "timestamp": "2024-01-15T14:30:22.123Z"
// }
```

---

## 📊 Phases de Développement

### 🚀 Phase P1A - MVP Core (CRITIQUE)

**Objectif** : Fonctionnalités essentielles pour la mise en ligne

#### Endpoints Prioritaires
1. **`POST /v1/auth/otp/send`** ✅ - Envoi codes OTP
2. **`POST /v1/auth/otp/verify`** ✅ - Vérification OTP + connexion patients
3. **`POST /v1/auth/register/patient`** ✅ - Inscription patients (SANS password)
4. **`POST /v1/auth/login`** ✅ - Connexion médecins/admins (AVEC password)
5. **`GET /v1/auth/me`** ✅ - Informations utilisateur connecté

#### User Stories Couvertes
- **Patients** : Inscription OTP, connexion simple
- **Médecins** : Connexion avec email/password
- **Base** : Authentification sécurisée

#### Critères de Validation P1A
- [ ] Inscription patient fonctionnelle
- [ ] Connexion OTP patients opérationnelle  
- [ ] Connexion email/password médecins/admins
- [ ] Tokens JWT générés et validés
- [ ] Documentation Swagger complète
- [ ] Tests unitaires passants

---

### 🔧 Phase P1B - Fonctionnalités Avancées (HAUTE)

**Objectif** : Compléter l'authentification et ajouter la gestion des profils

#### Endpoints à Développer
6. **`POST /v1/auth/register/medecin`** - Inscription médecins avec validation admin
7. **`POST /v1/auth/refresh`** - Renouvellement tokens
8. **`POST /v1/auth/logout`** - Déconnexion sécurisée
9. **`GET /v1/auth/sessions`** - Gestion sessions actives
10. **`GET /v1/patients/profile`** - Profil patient
11. **`PUT /v1/patients/profile`** - Mise à jour profil
12. **`GET /v1/medecins/validation-status`** - Statut validation médecin

#### User Stories Couvertes
- **Médecins** : Inscription complète avec validation
- **Patients** : Gestion profil personnel
- **Sécurité** : Gestion fine des sessions

---

### 🎯 Phase P2 - Recherche et Rendez-vous (HAUTE)

**Objectif** : Cœur métier de la mise en relation

#### Endpoints à Développer
13. **`GET /v1/doctors/search`** - Recherche médecins multi-critères
14. **`GET /v1/doctors/{id}/details`** - Détails médecin
15. **`GET /v1/doctors/{id}/available-slots`** - Créneaux disponibles
16. **`POST /v1/appointments/request`** - Demande rendez-vous
17. **`PUT /v1/appointments/{id}/respond`** - Réponse médecin
18. **`GET /v1/appointments`** - Liste rendez-vous utilisateur
19. **`DELETE /v1/appointments/{id}/cancel`** - Annulation
20. **`PUT /v1/appointments/{id}/reschedule`** - Reprogrammation

#### User Stories Couvertes
- **Patients** : Recherche médecins, prise RDV
- **Médecins** : Gestion agenda, réponses demandes
- **Système** : Notifications automatiques

---

### 💼 Phase P3 - Administration et Validation (MOYENNE)

**Objectif** : Outils administratifs et validation des comptes

#### Endpoints à Développer
21. **`GET /v1/admin/doctors/pending`** - Médecins en attente
22. **`PUT /v1/admin/doctors/{id}/validate`** - Validation compte médecin
23. **`PUT /v1/admin/doctors/{id}/suspend`** - Suspension compte
24. **`GET /v1/admin/patients`** - Gestion patients
25. **`GET /v1/admin/analytics`** - Tableaux de bord
26. **`GET /v1/admin/reports`** - Rapports d'activité

#### User Stories Couvertes
- **Admins** : Validation médecins, modération
- **Système** : Analytics et reporting
- **Sécurité** : Audit et conformité

---

### 🚀 Phase P4 - Fonctionnalités Avancées (BASSE)

**Objectif** : Optimisations et fonctionnalités premium

#### Endpoints à Développer
27. **`POST /v1/consultations/{id}/prescription`** - Ordonnances numériques
28. **`POST /v1/evaluations`** - Système d'évaluation
29. **`GET /v1/emergency/pharmacies`** - Services d'urgence
30. **`POST /v1/ai-health/conversation`** - IA Santé (optionnel)
31. **`GET /v1/routes/calculate`** - Calcul itinéraires domicile

#### User Stories Couvertes
- **Médecins** : Ordonnances numériques, consultations domicile
- **Patients** : Évaluations, services urgence, IA santé
- **Système** : Géolocalisation, contenu premium

---

## 🚀 Guide de Démarrage

### Prérequis
- **Node.js** 18.x ou supérieur
- **MySQL** 8.0
- **npm** ou **yarn**

### Installation

```bash
# 1. Cloner le repository
git clone <repository-url>
cd medecins-patients-backend

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos configurations

# 4. Configurer la base de données
npx prisma migrate dev
npx prisma generate

# 5. (Optionnel) Alimenter avec des données de test
npm run db:seed

# 6. Démarrer en mode développement
npm run dev
```

### Variables d'Environnement Essentielles

```bash
# Base de données
DATABASE_URL="mysql://user:password@localhost:3306/medecins_patients"

# JWT Secrets (différents par environnement)
JWT_SECRET_DEV="your-dev-secret-key"
JWT_SECRET_TEST="your-test-secret-key"
JWT_SECRET_PROD="your-prod-secret-key"

# API LeTexto (SMS)
LETEXTO_API_URL="https://api.letexto.com"
LETEXTO_API_KEY="your-letexto-api-key"

# Environnement
NODE_ENV="development"
```

### Scripts Disponibles

```bash
npm start              # Production (node)
npm run dev            # Développement (nodemon)
npm run db:migrate     # Migrations Prisma
npm run db:generate    # Génération client Prisma
npm run db:seed        # Données de test
npm test               # Tests automatisés
```

---

## 📖 Documentation API

### Accès à la Documentation
- **Swagger UI** : `http://localhost:3000/v1/api-docs`
- **Endpoint info** : `http://localhost:3000/v1/info`
- **Test connectivité** : `http://localhost:3000/v1/ping`

### Authentification dans Swagger
1. Obtenir un token via `/v1/auth/otp/verify` ou `/v1/auth/login`
2. Cliquer sur "Authorize" dans Swagger UI
3. Saisir : `Bearer YOUR_JWT_TOKEN`

### Exemples de Requêtes

#### Inscription Patient
```bash
# 1. Demander un code OTP
curl -X POST http://localhost:3000/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"telephone": "0102030405"}'

# 2. Vérifier le code (si patient inexistant)
curl -X POST http://localhost:3000/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"telephone": "0102030405", "otp": "1234"}'

# 3. Créer le compte patient
curl -X POST http://localhost:3000/v1/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{
    "nom": "Kouassi",
    "prenom": "Jean",
    "telephone": "0102030405",
    "email": "jean@example.com"
  }'
```

#### Connexion Médecin
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dr.fatou@example.com",
    "password": "motdepasse123"
  }'
```

---

## 🧪 Tests

### Types de Tests
- **Unitaires** : Services et utilitaires
- **Intégration** : Endpoints complets
- **Validation** : Middleware et schémas

### Structure des Tests
```
test/
├── unit/
│   ├── services/
│   └── middleware/
├── integration/
│   ├── auth/
│   └── patients/
└── fixtures/
    └── test-data.js
```

### Lancer les Tests
```bash
# Tous les tests
npm test

# Tests spécifiques
npm test -- --grep "auth"
npm test -- test/integration/auth/

# Avec couverture
npm run test:coverage
```

---

## 🔧 Déploiement

### Environnements

#### Développement
- **Port** : 3000
- **Base** : MySQL locale
- **JWT** : Secret développement
- **SMS** : Mode test LeTexto

#### Test
- **Port** : 3001  
- **Base** : MySQL de test
- **JWT** : Secret test
- **SMS** : Sandbox

#### Production
- **Port** : 8080
- **Base** : MySQL production
- **JWT** : Secret production sécurisé
- **SMS** : API LeTexto production

### Build et Déploiement
```bash
# Préparer pour production
npm run build

# Migrations production
npx prisma migrate deploy

# Démarrer en production
npm start
```

---

## 🤝 Contribution

### Standards de Code
- **ESLint** : Configuration standard
- **Prettier** : Formatage automatique
- **Commits** : Convention conventionnelle

### Processus de Développement
1. **Branche** : Créer depuis `develop`
2. **Feature** : Développer selon workflow
3. **Tests** : Ajouter tests unitaires
4. **Documentation** : Mettre à jour Swagger
5. **PR** : Pull request avec revue
6. **Merge** : Après validation

### Contact
- **Équipe** : LYCORIS GROUP
- **Documentation** : Voir `/swagger/` pour détails API
- **Issues** : Reporter via Git issues

---

## 📄 Licence

Propriété de **LYCORIS GROUP** - Tous droits réservés.

---

*Documentation mise à jour le 22 juillet 2025*