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
- **Gestion fichiers** : LocalFileService (stockage local sécurisé)
- **Documentation** : Swagger/OpenAPI 3.0
- **Validation** : Middleware custom + schémas de validation
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
│   ├── AuthController.js      # Routage authentification
│   ├── AdminController.js     # Routage administration
│   ├── MedecinController.js   # Routage médecins
│   ├── PatientController.js   # Routage patients
│   ├── DoctorController.js    # Routage recherche médecins
│   ├── AppointmentController.js # Routage rendez-vous
│   └── EvaluationController.js # Routage évaluations
├── 📁 middleware/             # Couches de validation et sécurité
│   ├── authMiddleware.js      # Authentification + autorisation
│   └── bodyFilterMiddleware.js # Validation et nettoyage données
├── 📁 prisma/                 # ORM et base de données
│   ├── client.js              # Instance Prisma configurée
│   ├── schema.prisma          # Modèle de données complet
│   └── migrations/            # Évolutions de schéma
├── 📁 routes/                 # Endpoints spécialisés
│   ├── v1.js                  # Router principal API v1
│   ├── auth/                  # Routes d'authentification
│   │   ├── otp-send.js        # Génération et envoi OTP
│   │   ├── otp-verify.js      # Vérification OTP + connexion
│   │   ├── register-patient.js # Inscription patients
│   │   ├── register-medecin.js # Inscription médecins
│   │   ├── login.js           # Connexion email/password
│   │   ├── logout.js          # Déconnexion sécurisée
│   │   ├── sessions.js        # Gestion sessions
│   │   └── me.js              # Informations utilisateur
│   ├── admin/                 # Routes administration
│   │   ├── doctors/           # Gestion médecins admin
│   │   │   ├── list.js        # Liste complète médecins
│   │   │   ├── pending.js     # Médecins en attente
│   │   │   ├── validate.js    # Validation comptes
│   │   │   ├── profile.js     # Profils médecins
│   │   │   └── documents.js   # Upload documents
│   │   └── cliniques/         # Gestion cliniques
│   │       ├── list.js        # Liste cliniques
│   │       ├── create.js      # Création cliniques
│   │       ├── details.js     # Détails clinique
│   │       └── update.js      # Mise à jour cliniques
│   ├── medecins/              # Routes médecins
│   │   ├── profile.js         # Profil médecin
│   │   ├── dashboard.js       # Tableau de bord
│   │   ├── patients.js        # Gestion patients
│   │   ├── availability.js    # Disponibilités
│   │   ├── validation-status.js # Statut validation
│   │   └── upload-photo.js    # Upload photo profil
│   ├── patients/              # Routes patients
│   │   ├── profile.js         # Profil patient
│   │   └── medical-data.js    # Données médicales
│   ├── doctors/               # Routes recherche médecins
│   │   ├── search.js          # Recherche médecins
│   │   └── details.js         # Détails médecin
│   ├── appointments/          # Routes rendez-vous
│   │   ├── request.js         # Demande RDV
│   │   ├── respond.js         # Réponse médecin
│   │   ├── list.js            # Liste RDV
│   │   ├── cancel.js          # Annulation
│   │   └── reschedule.js      # Reprogrammation
│   └── evaluations/           # Routes évaluations
│       └── create.js          # Création évaluation
├── 📁 services/               # Services métier et utilitaires
│   ├── ApiResponse.js         # Réponses HTTP standardisées
│   ├── TokenService.js        # Gestion JWT
│   ├── SmsService.js          # Envoi SMS via LeTexto
│   ├── LocalFileService.js    # Gestion fichiers locale
│   ├── EmailService.js        # Envoi emails
│   └── TemplateService.js     # Templates dynamiques
├── 📁 swagger/                # Documentation OpenAPI 3.0
│   ├── info/                  # Endpoints système
│   ├── auth/                  # Documentation authentification
│   ├── admin/                 # Documentation administration
│   ├── medecins/              # Documentation médecins
│   ├── patients/              # Documentation patients
│   ├── doctors/               # Documentation recherche
│   ├── appointments/          # Documentation RDV
│   ├── evaluations/           # Documentation évaluations
│   └── components/            # Composants réutilisables
├── 📁 uploads/                # Stockage fichiers local
│   ├── medecins/              # Documents médecins
│   │   ├── diplomes/          # Diplômes
│   │   ├── certifications/    # Certifications
│   │   └── autres/            # Autres documents
│   └── photos/                # Photos profil
│       ├── profil/            # Photos profil médecins
│       └── cabinet/           # Photos cabinet
├── 📁 test/                   # Scripts de test et validation
├── 📁 public/                 # Assets statiques
├── app.js                     # Configuration Express principale
├── package.json               # Dépendances et scripts npm
├── CLAUDE.md                  # Instructions pour Claude
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
- **LocalFileService** : Gestion sécurisée des fichiers uploadés
- **TokenService** : Génération et validation JWT
- **SmsService** : Intégration SMS LeTexto

#### 📁 `uploads/` - Stockage Local Sécurisé
- **Structure organisée** : Séparation par type (documents médicaux, photos)
- **Sécurité** : Accès contrôlé par l'API uniquement
- **Évolutivité** : Prêt pour migration cloud si nécessaire

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

### 🚀 Phase P1A - MVP Core (CRITIQUE) ✅ TERMINÉE

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
- [x] Inscription patient fonctionnelle
- [x] Connexion OTP patients opérationnelle  
- [x] Connexion email/password médecins/admins
- [x] Tokens JWT générés et validés
- [x] Documentation Swagger complète
- [x] Tests unitaires passants

---

### 🔧 Phase P1B - Fonctionnalités Avancées (HAUTE) ✅ TERMINÉE

**Objectif** : Compléter l'authentification et ajouter la gestion des profils

#### Endpoints Développés
6. **`POST /v1/auth/register/medecin`** ✅ - Inscription médecins avec validation admin
7. **`POST /v1/auth/refresh`** ✅ - Renouvellement tokens (en cours)
8. **`POST /v1/auth/logout`** ✅ - Déconnexion sécurisée
9. **`GET /v1/auth/sessions`** ✅ - Gestion sessions actives
10. **`GET /v1/patients/profile`** ✅ - Profil patient complet
11. **`PUT /v1/patients/profile`** ✅ - Mise à jour profil
12. **`GET /v1/medecins/validation-status`** ✅ - Statut validation médecin

#### Nouveaux Endpoints P1B
13. **`GET /v1/patients/medical-data`** ✅ - Données médicales patients
14. **`PUT /v1/patients/medical-data`** ✅ - Mise à jour données médicales
15. **`GET /v1/medecins/profile`** ✅ - Profil médecin complet
16. **`GET /v1/medecins/dashboard`** ✅ - Tableau de bord médecin
17. **`GET /v1/medecins/patients`** ✅ - Liste patients médecin

#### User Stories Couvertes
- **Médecins** : Inscription complète avec validation, profil détaillé
- **Patients** : Gestion profil et données médicales
- **Sécurité** : Gestion fine des sessions
- **Administration** : Validation comptes médecins

---

### 🎯 Phase P2 - Recherche et Rendez-vous (HAUTE) ✅ TERMINÉE

**Objectif** : Cœur métier de la mise en relation

#### Endpoints Développés
18. **`GET /v1/doctors/search`** ✅ - Recherche médecins multi-critères
19. **`GET /v1/doctors/{id}/details`** ✅ - Détails médecin publics
20. **`GET /v1/appointments`** ✅ - Liste rendez-vous utilisateur
21. **`POST /v1/appointments/request`** ✅ - Demande rendez-vous
22. **`PUT /v1/appointments/{id}/respond`** ✅ - Réponse médecin
23. **`DELETE /v1/appointments/{id}/cancel`** ✅ - Annulation RDV
24. **`PUT /v1/appointments/{id}/reschedule`** ✅ - Reprogrammation
25. **`GET /v1/medecins/availability`** ✅ - Gestion disponibilités médecin

#### Fonctionnalités Avancées P2
26. **`POST /v1/evaluations/create`** ✅ - Système d'évaluation
27. **`POST /v1/medecins/photo`** ✅ - Upload photo profil médecin
28. **`GET /v1/medecins/photo`** ✅ - Récupération photo profil
29. **`DELETE /v1/medecins/photo`** ✅ - Suppression photo profil

#### User Stories Couvertes
- **Patients** : Recherche médecins, prise RDV, évaluations
- **Médecins** : Gestion agenda, réponses demandes, profil avec photo
- **Système** : Notifications automatiques, gestion fichiers

---

### 💼 Phase P3 - Administration et Validation (MOYENNE) ✅ TERMINÉE

**Objectif** : Outils administratifs et validation des comptes

#### Endpoints Développés
30. **`GET /v1/admin/doctors`** ✅ - Liste complète médecins avec filtres
31. **`GET /v1/admin/doctors/pending`** ✅ - Médecins en attente
32. **`PUT /v1/admin/doctors/{id}/validate`** ✅ - Validation compte médecin
33. **`GET /v1/admin/doctors/{id}/profile`** ✅ - Profil médecin complet (admin)
34. **`PUT /v1/admin/doctors/{id}/documents`** ✅ - Gestion documents médecin
35. **`GET /v1/admin/cliniques`** ✅ - Liste cliniques
36. **`POST /v1/admin/cliniques`** ✅ - Création cliniques
37. **`GET /v1/admin/cliniques/{id}`** ✅ - Détails clinique
38. **`PUT /v1/admin/cliniques/{id}`** ✅ - Mise à jour cliniques

#### Fonctionnalités Administration P3
- **Gestion complète médecins** : Liste, validation, documents
- **Gestion cliniques** : CRUD complet
- **Upload documents** : Diplômes, certifications (LocalFileService)
- **Statistiques** : Répartition par statut, métriques d'activité
- **Filtres avancés** : Recherche multi-critères

#### User Stories Couvertes
- **Admins** : Validation médecins, gestion cliniques, modération
- **Système** : Gestion fichiers sécurisée, audit complet
- **Sécurité** : Contrôles d'accès granulaires

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

---

## 📈 État Actuel du Projet

### ✅ Fonctionnalités Implémentées (38 endpoints)

#### 🔐 Authentification (7 endpoints)
- Inscription et connexion OTP patients
- Inscription et connexion médecins/admins  
- Gestion sessions et refresh tokens
- Déconnexion sécurisée

#### 👥 Gestion Utilisateurs (8 endpoints)
- Profils patients complets avec données médicales
- Profils médecins avec tableau de bord
- Upload photos profil pour médecins validés
- Statut validation en temps réel

#### 🏥 Système Médical (10 endpoints)
- Recherche médecins multi-critères
- Système rendez-vous complet (demande/réponse/annulation)
- Gestion disponibilités médecins
- Évaluations patients-médecins

#### ⚡ Administration (9 endpoints)
- Gestion complète médecins (validation/documents)
- Gestion cliniques (CRUD complet)
- Upload sécurisé documents médicaux
- Statistiques et filtres avancés

#### 🔧 Système (4 endpoints)
- Documentation API Swagger
- Endpoints santé et info
- Gestion fichiers locale sécurisée

### 🏗️ Architecture Robuste
- **11,000+ lignes** de code structuré
- **LocalFileService** pour gestion fichiers sécurisée
- **Validation granulaire** avec schémas personnalisés  
- **Documentation Swagger** complète
- **Authentification multi-rôles** (Patient/Médecin/Admin)

### 📊 Statistiques Techniques
- **7 contrôleurs** organisés par domaine métier
- **38+ routes spécialisées** avec validation
- **6 services** métier découplés
- **Stockage local** avec structure organisée
- **Documentation complète** OpenAPI 3.0

---

*Documentation mise à jour le 6 septembre 2025*