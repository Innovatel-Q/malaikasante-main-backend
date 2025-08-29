# Endpoints pour l'Application Patient

## 📋 Vue d'ensemble

Ce document liste tous les endpoints de l'API backend qui seront utilisés par l'application mobile/web destinée aux patients, organisés par écrans et fonctionnalités.

---

## 🔐 **AUTHENTIFICATION**

### **Écran de Connexion/Inscription**

#### Vérification par OTP (Méthode principale pour patients)
- **POST** `/v1/auth/otp/send`
  - **Usage** : Envoyer code OTP par SMS
  - **Données** : `{ telephone }`
  - **Réponse** : Confirmation envoi + numéro masqué

- **POST** `/v1/auth/otp/verify`
  - **Usage** : Vérifier code OTP + connexion automatique si patient existant
  - **Données** : `{ telephone, otp }`
  - **Réponse** : Tokens JWT + infos patient OU indication de créer un compte

#### Inscription nouveau patient
- **POST** `/v1/auth/register/patient`
  - **Usage** : Créer compte patient après vérification OTP
  - **Données** : `{ nom, prenom, telephone, email, dateNaissance?, sexe? }`
  - **Réponse** : Compte créé + tokens JWT

#### Gestion de session
- **POST** `/v1/auth/refresh`
  - **Usage** : Renouveler tokens d'accès
  - **Données** : `{ refreshToken }`
  - **Réponse** : Nouveaux tokens

- **POST** `/v1/auth/logout`
  - **Usage** : Déconnexion sécurisée
  - **Réponse** : Confirmation déconnexion

---

## 👤 **PROFIL PATIENT**

### **Écran Mon Profil**

#### Consultation du profil
- **GET** `/v1/auth/me`
  - **Usage** : Informations utilisateur connecté (vue générale)
  - **Réponse** : Données utilisateur + patient + complétion profil

- **GET** `/v1/patients/profile`
  - **Usage** : Profil patient détaillé
  - **Réponse** : Profil complet + statistiques compte + calculs dérivés (âge, IMC)

#### Modification du profil
- **PUT** `/v1/patients/profile`
  - **Usage** : Mettre à jour informations personnelles/médicales
  - **Données** : Tous champs modifiables (nom, adresse, poids, taille, allergies, etc.)
  - **Réponse** : Profil mis à jour + résumé modifications

### **Écran Données Médicales**
- **GET** `/v1/patients/medical-data`
  - **Usage** : Consulter données médicales sensibles + historique
  - **Réponse** : Données complètes + consultations passées + prescriptions + alertes médicales

---

## 🔍 **RECHERCHE DE MÉDECINS**

### **Écran Recherche Médecins**
- **GET** `/v1/doctors/search`
  - **Usage** : Recherche multicritères de médecins validés
  - **Paramètres** : 
    - `specialite`, `ville`, `tarifMin`, `tarifMax`, `noteMin`
    - `domicile`, `teleconsultation`, `disponible`
    - `page`, `limit`, `sortBy`, `sortOrder`
  - **Réponse** : Liste médecins + pagination + statistiques recherche

### **Écran Profil Médecin**
- **GET** `/v1/doctors/:id/details`
  - **Usage** : Profil détaillé d'un médecin spécifique
  - **Réponse** : Infos complètes + formations + évaluations + statistiques + horaires

### **Écran Créneaux Disponibles**
- **GET** `/v1/doctors/:id/available-slots`
  - **Usage** : Créneaux disponibles pour prise de RDV
  - **Paramètres** : `dateDebut`, `dateFin`, `typeConsultation`, `dureeConsultation`
  - **Réponse** : Créneaux organisés par date + tarifs + conditions

---

## 📅 **GESTION DES RENDEZ-VOUS**

### **Écran Prise de RDV**
- **POST** `/v1/appointments/request`
  - **Usage** : Demander un nouveau rendez-vous
  - **Données** : 
    ```json
    {
      "medecinId": "uuid",
      "dateHeureDebut": "2024-01-15T14:30:00Z",
      "typeConsultation": "CLINIQUE|DOMICILE|TELECONSULTATION",
      "motifConsultation": "description",
      "niveauUrgence": "NORMAL|URGENT|SUIVI_ROUTINE",
      "dureeEstimee": 30,
      "adressePatient": "adresse si domicile",
      "informationsComplementaires": "infos supplémentaires"
    }
    ```
  - **Réponse** : RDV créé + infos médecin + étapes suivantes

### **Écran Mes Rendez-vous**
- **GET** `/v1/appointments`
  - **Usage** : Liste des rendez-vous du patient
  - **Paramètres** : `statut`, `dateDebut`, `dateFin`, `typeConsultation`, `page`, `limit`
  - **Réponse** : Liste RDV enrichie + actions possibles + statistiques

### **Écran Annulation RDV**
- **DELETE** `/v1/appointments/:id/cancel`
  - **Usage** : Annuler un rendez-vous
  - **Données** : `{ motifAnnulation, demandeRemboursement? }`
  - **Réponse** : Confirmation + frais éventuels + conditions remboursement

---

## ⭐ **ÉVALUATIONS**

### **Écran Évaluation Post-Consultation**
- **POST** `/v1/evaluations`
  - **Usage** : Évaluer un médecin après consultation terminée
  - **Données** :
    ```json
    {
      "rendezVousId": "uuid",
      "typeEvaluation": "PATIENT_EVALUE_MEDECIN",
      "note": 1-5,
      "commentaire": "avis détaillé",
      "recommande": true/false,
      "criteresSpecifiques": {
        "ponctualite": 1-5,
        "communication": 1-5,
        "competence": 1-5,
        "courtoisie": 1-5,
        "suivi": 1-5
      },
      "anonyme": true/false
    }
    ```
  - **Réponse** : Évaluation enregistrée + impact + prochaines étapes

---

## 📱 **ENDPOINTS PAR ÉCRAN DE L'APPLICATION**

### **🏠 Écran d'Accueil/Dashboard**
- `GET /v1/auth/me` - Informations utilisateur
- `GET /v1/appointments?limit=3&sortBy=dateHeureDebut&sortOrder=asc` - Prochains RDV
- `GET /v1/patients/profile` - Complétion profil

### **🔐 Écran Authentification**
- `POST /v1/auth/otp/send` - Demander code
- `POST /v1/auth/otp/verify` - Vérifier + connexion
- `POST /v1/auth/register/patient` - Inscription

### **👤 Écran Mon Profil**
- `GET /v1/patients/profile` - Consultation
- `PUT /v1/patients/profile` - Modification

### **🏥 Écran Données Médicales**
- `GET /v1/patients/medical-data` - Données complètes

### **🔍 Écran Recherche Médecins**
- `GET /v1/doctors/search` - Recherche avec filtres

### **👨‍⚕️ Écran Détails Médecin**
- `GET /v1/doctors/:id/details` - Profil médecin
- `GET /v1/doctors/:id/available-slots` - Créneaux

### **📅 Écran Prise de RDV**
- `GET /v1/doctors/:id/available-slots` - Créneaux disponibles
- `POST /v1/appointments/request` - Confirmer RDV

### **📋 Écran Mes RDV**
- `GET /v1/appointments` - Liste avec filtres
- `DELETE /v1/appointments/:id/cancel` - Annulation

### **⭐ Écran Évaluation**
- `POST /v1/evaluations` - Noter médecin

### **⚙️ Écran Paramètres**
- `GET /v1/auth/me` - Infos compte
- `POST /v1/auth/refresh` - Actualiser session
- `POST /v1/auth/logout` - Déconnexion

---

## 🔒 **SÉCURITÉ**

- **Authentification** : JWT Bearer Token obligatoire (sauf endpoints publics)
- **Autorisation** : Role `PATIENT` requis pour tous les endpoints patients
- **OTP** : Vérification SMS obligatoire pour inscription/connexion
- **Audit** : Traçabilité des accès aux données médicales sensibles

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
- **403** : Non autorisé
- **404** : Ressource non trouvée
- **409** : Conflit (ex: email déjà utilisé)
- **500** : Erreur serveur

---

*Dernière mise à jour : 2024-01-15*