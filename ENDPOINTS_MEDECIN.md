# Endpoints pour l'Application Médecin

## 📋 Vue d'ensemble

Ce document liste tous les endpoints de l'API backend qui seront utilisés par l'application mobile/web destinée aux médecins, organisés par écrans et fonctionnalités.

---

## 🔐 **AUTHENTIFICATION**

### **Écran de Connexion**

#### Connexion email/mot de passe (Méthode pour médecins)
- **POST** `/v1/auth/login`
  - **Usage** : Connexion avec email et mot de passe
  - **Données** : `{ email, password }`
  - **Réponse** : Tokens JWT + validation statut médecin
  - **Note** : Seuls les médecins validés peuvent se connecter

#### Inscription nouveau médecin
- **POST** `/v1/auth/register/medecin`
  - **Usage** : Créer compte médecin
  - **Données** : `{ nom, prenom, email, password, numeroOrdre, specialite, ... }`
  - **Réponse** : Compte créé + attente validation

#### Gestion de session
- **POST** `/v1/auth/refresh`
  - **Usage** : Renouveler tokens d'accès
  - **Données** : `{ refreshToken }`
  - **Réponse** : Nouveaux tokens

- **POST** `/v1/auth/logout`
  - **Usage** : Déconnexion sécurisée
  - **Réponse** : Confirmation déconnexion

- **GET** `/v1/auth/me`
  - **Usage** : Informations utilisateur connecté
  - **Réponse** : Données médecin + statut validation

---

## 👨‍⚕️ **PROFIL MÉDECIN**

### **Écran Mon Profil**

#### Consultation du profil
- **GET** `/v1/medecins/profile`
  - **Usage** : Profil médecin complet
  - **Réponse** : 
    - Informations professionnelles complètes
    - Formation, certifications, spécialités
    - Tarifs et services proposés
    - Horaires de consultation
    - Statistiques d'activité et évaluations
    - Score de complétude du profil

#### Modification du profil
- **PUT** `/v1/medecins/profile`
  - **Usage** : Mettre à jour profil médecin
  - **Données** : Tous champs modifiables
    ```json
    {
      "biographie": "string",
      "experienceAnnees": number,
      "tarifConsultationClinique": number,
      "consultationDomicile": boolean,
      "teleconsultation": boolean,
      "accepteNouveauxPatients": boolean,
      "adresseConsultation": "string",
      "horaires": [...],
      ...
    }
    ```
  - **Réponse** : Confirmation mise à jour + recommandations

### **Écran Statut de Validation**
- **GET** `/v1/medecins/validation-status`
  - **Usage** : Consulter statut de validation du compte médecin
  - **Réponse** : 
    - Statut actuel (EN_ATTENTE/VALIDE/REJETE)
    - Temps écoulé et estimation
    - Étapes suivantes selon le statut
    - Informations de contact administration

---

## 📊 **TABLEAU DE BORD**

### **Écran Dashboard Principal**
- **GET** `/v1/medecins/dashboard`
  - **Usage** : Tableau de bord complet du médecin
  - **Réponse** :
    - **Statistiques globales** : Total RDV, patients, revenus
    - **Planning immédiat** : RDV aujourd'hui/demain/semaine
    - **Demandes en attente** : Liste des demandes à traiter
    - **Performance** : Évaluations, notes, recommandations
    - **Alertes et recommandations** : Actions prioritaires

---

## 👥 **GESTION DES PATIENTS**

### **Écran Mes Patients**
- **GET** `/v1/medecins/patients`
  - **Usage** : Liste des patients suivis par le médecin
  - **Paramètres** : 
    - `recherche`, `statut`, `typeRelation` (NOUVEAU/SUIVI/REGULIER)
    - `orderBy`, `page`, `limit`
  - **Réponse** :
    - Liste patients avec statistiques complètes
    - Historique médical récent (non sensible)
    - Relation médecin-patient (ancienneté, type)
    - Évaluations reçues de chaque patient
    - Actions possibles par patient

---

## 📅 **GESTION DES RENDEZ-VOUS**

### **Écran Liste des RDV**
- **GET** `/v1/appointments`
  - **Usage** : Liste des rendez-vous du médecin
  - **Paramètres** : Filtres par statut, date, type consultation
  - **Réponse** : RDV avec informations patients + actions possibles

### **Écran Demandes en Attente**
- **PUT** `/v1/appointments/:id/respond`
  - **Usage** : Répondre à une demande de rendez-vous
  - **Données** :
    ```json
    {
      "decision": "ACCEPTER|REFUSER",
      "motifRefus": "string",
      "creneauxAlternatifs": [
        {
          "dateHeureDebut": "2024-01-15T14:30:00Z",
          "typeConsultation": "CLINIQUE"
        }
      ],
      "messagePersonnalise": "string",
      "modificationsTarif": {
        "nouveau_tarif": number,
        "motif_modification": "string"
      }
    }
    ```
  - **Réponse** : Confirmation traitement + notification patient

### **Écran Annulation RDV**
- **DELETE** `/v1/appointments/:id/cancel`
  - **Usage** : Annuler un rendez-vous (même endpoint que patient)
  - **Données** : `{ motifAnnulation, demandeRemboursement? }`
  - **Réponse** : Confirmation + gestion remboursement

---

## 📋 **GESTION DES DISPONIBILITÉS**

### **Écran Disponibilités**
- **PUT** `/v1/medecins/availability`
  - **Usage** : Gérer horaires, congés et statut de disponibilité
  - **Actions multiples** :
    
    #### Mettre à jour les horaires
    ```json
    {
      "action": "UPDATE_HORAIRES",
      "horaires": [
        {
          "jourSemaine": "LUNDI",
          "heureDebut": "09:00",
          "heureFin": "17:00",
          "typeConsultation": "CLINIQUE",
          "actif": true
        }
      ]
    }
    ```

    #### Ajouter un congé
    ```json
    {
      "action": "AJOUTER_CONGE",
      "conge": {
        "dateDebut": "2024-01-20",
        "dateFin": "2024-01-25",
        "motif": "Vacances",
        "typeConge": "VACANCES",
        "annulationRdvAutorise": true
      }
    }
    ```

    #### Modifier le statut
    ```json
    {
      "action": "MODIFIER_STATUT",
      "statutModifications": {
        "accepteNouveauxPatients": false,
        "messageIndisponibilite": "Indisponible temporairement",
        "delaiMoyenReponse": 24
      }
    }
    ```

---

## ⭐ **ÉVALUATIONS**

### **Écran Évaluation Patient**
- **POST** `/v1/evaluations`
  - **Usage** : Évaluer un patient après consultation (optionnel)
  - **Données** :
    ```json
    {
      "rendezVousId": "uuid",
      "typeEvaluation": "MEDECIN_EVALUE_PATIENT",
      "note": 1-5,
      "commentaire": "string",
      "recommande": boolean,
      "criteresSpecifiques": {
        "ponctualite": 1-5,
        "communication": 1-5,
        "courtoisie": 1-5,
        "suivi": 1-5
      }
    }
    ```

---

## 📱 **ENDPOINTS PAR ÉCRAN DE L'APPLICATION**

### **🏠 Écran d'Accueil/Dashboard**
- `GET /v1/medecins/dashboard` - Tableau de bord complet
- `GET /v1/auth/me` - Informations utilisateur

### **🔐 Écran Authentification**
- `POST /v1/auth/login` - Connexion email/password
- `POST /v1/auth/register/medecin` - Inscription médecin

### **📋 Écran Statut Validation**
- `GET /v1/medecins/validation-status` - Statut validation compte

### **👨‍⚕️ Écran Mon Profil**
- `GET /v1/medecins/profile` - Consultation profil
- `PUT /v1/medecins/profile` - Modification profil

### **👥 Écran Mes Patients**
- `GET /v1/medecins/patients` - Liste patients avec filtres

### **📅 Écran Mes RDV**
- `GET /v1/appointments` - Liste RDV du médecin
- `DELETE /v1/appointments/:id/cancel` - Annuler RDV

### **📝 Écran Demandes RDV**
- `PUT /v1/appointments/:id/respond` - Accepter/Refuser demande

### **⏰ Écran Disponibilités**
- `PUT /v1/medecins/availability` - Gérer horaires/congés/statut

### **⭐ Écran Évaluations**
- `POST /v1/evaluations` - Évaluer patient (optionnel)

### **⚙️ Écran Paramètres**
- `GET /v1/auth/me` - Infos compte
- `POST /v1/auth/refresh` - Actualiser session
- `POST /v1/auth/logout` - Déconnexion

---

## 🔒 **SÉCURITÉ**

- **Authentification** : JWT Bearer Token obligatoire
- **Autorisation** : Role `MEDECIN` + validation obligatoire pour pratiquer
- **Validation compte** : `AuthMiddleware.authorizeValidatedMedecin()` pour endpoints critiques
- **Données sensibles** : Accès limité aux données patients selon la relation thérapeutique

## 🏥 **SPÉCIFICITÉS MÉDECIN**

### **Statuts de Validation**
- **EN_ATTENTE** : Compte créé, documents en cours de validation
- **VALIDE** : Peut exercer pleinement sur la plateforme
- **REJETE** : Dossier rejeté, corrections nécessaires

### **Types de Consultation**
- **CLINIQUE** : Consultation au cabinet médical
- **DOMICILE** : Consultation à domicile (si activée)
- **TELECONSULTATION** : Consultation en ligne (si activée)

### **Gestion des Demandes RDV**
- **DEMANDE** → **ACCEPTER** → **CONFIRME**
- **DEMANDE** → **REFUSER** → **REFUSE** (+ créneaux alternatifs optionnels)
- Notifications automatiques aux patients
- Possibilité de modifier tarifs lors de l'acceptation

## 📊 **FORMATS DE RÉPONSE**

Toutes les réponses suivent le format standardisé :
```json
{
  "success": true/false,
  "message": "Description de l'opération",
  "data": { ... },
  "timestamp": "2024-01-15T14:30:22.123Z"
}
```

## 🚨 **GESTION D'ERREURS**

- **400** : Données invalides
- **401** : Non authentifié  
- **403** : Non autorisé (compte non validé)
- **404** : Ressource non trouvée
- **409** : Conflit (ex: créneau déjà pris)
- **500** : Erreur serveur

---

*Dernière mise à jour : 2024-01-15*