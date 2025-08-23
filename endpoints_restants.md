# 📋 Endpoints Restants à Développer
## Plateforme de Mise en Relation Médecins-Patients

*Document généré le 23 août 2025 - LYCORIS GROUP*

---

## 📊 Récapitulatif Global

| Phase | Statut | Endpoints Restants | Priorité | Durée Estimée |
|-------|--------|-------------------|----------|---------------|
| **P1B** | 🔶 En cours | 3 endpoints | HAUTE | 3-5 jours |
| **P2** | ❌ À faire | 8 endpoints | HAUTE | 2-3 semaines |
| **P3** | 🔶 Démarré | 5 endpoints | MOYENNE | 1-2 semaines |
| **P4** | ❌ À faire | 5 endpoints | BASSE | 2-3 semaines |

**Total : 21 endpoints restants**

---

## 🔧 Phase P1B - Fonctionnalités Avancées (HAUTE)
*Objectif : Compléter l'authentification et ajouter la gestion des profils*

### 👤 Gestion Profils Patients

#### `GET /v1/patients/profile`
- **Description** : Récupérer le profil complet du patient authentifié
- **Authentification** : ✅ Requise (Patient uniquement)
- **Données retournées** : Informations personnelles, préférences, historique médical de base
- **Logique** : Récupérer données User + Patient depuis base avec relations
- **Estimation** : 1 jour

#### `PUT /v1/patients/profile`
- **Description** : Mettre à jour les informations du profil patient
- **Authentification** : ✅ Requise (Patient uniquement)
- **Données acceptées** : Nom, prénom, email, téléphone, ville, préférences communication
- **Logique** : Validation des données + mise à jour sécurisée avec historique
- **Estimation** : 1 jour

#### `GET /v1/patients/medical-data`
- **Description** : Consulter les données médicales sensibles du patient
- **Authentification** : ✅ Requise (Patient uniquement)
- **Données retournées** : Antécédents, allergies, traitements actuels (chiffrées)
- **Logique** : Déchiffrement sécurisé des données médicales + audit de consultation
- **Estimation** : 1 jour

---

## 🎯 Phase P2 - Recherche et Rendez-vous (HAUTE)
*Objectif : Cœur métier de la mise en relation médecins-patients*

### 🔍 Recherche et Découverte Médecins

#### `GET /v1/doctors/search`
- **Description** : Recherche multicritères de médecins validés disponibles
- **Authentification** : ✅ Requise (Patients et publique avec limitations)
- **Paramètres** : Spécialité, ville, disponibilité, tarifs, note, domicile, teleconsultation
- **Données retournées** : Liste paginée avec profils médecins, disponibilités, tarifs
- **Logique** : Requête complexe avec filtres + géolocalisation + cache Redis
- **Estimation** : 3 jours

#### `GET /v1/doctors/{id}/details`
- **Description** : Consulter le profil détaillé d'un médecin spécifique
- **Authentification** : ✅ Requise (Patients)
- **Données retournées** : Bio complète, spécialités, expérience, avis patients, tarifs
- **Logique** : Profil public enrichi + statistiques + évaluations agrégées
- **Estimation** : 1 jour

#### `GET /v1/doctors/{id}/available-slots`
- **Description** : Récupérer les créneaux de rendez-vous disponibles du médecin
- **Authentification** : ✅ Requise (Patients)
- **Paramètres** : Date début, date fin, type consultation (cabinet/domicile/télécons)
- **Données retournées** : Créneaux libres avec durées et tarifs selon type
- **Logique** : Calcul disponibilités - RDV existants - congés + règles médecin
- **Estimation** : 2 jours

### 📅 Gestion des Rendez-vous

#### `POST /v1/appointments/request`
- **Description** : Demander un rendez-vous auprès d'un médecin
- **Authentification** : ✅ Requise (Patients uniquement)
- **Données requises** : ID médecin, créneau souhaité, type consultation, motif
- **Logique** : Validation créneau disponible + notification médecin + statut EN_ATTENTE
- **Estimation** : 2 jours

#### `PUT /v1/appointments/{id}/respond`
- **Description** : Répondre à une demande de rendez-vous (accepter/refuser)
- **Authentification** : ✅ Requise (Médecins validés uniquement)
- **Données requises** : Décision (accepter/refuser), motif si refus, créneaux alternatifs
- **Logique** : Mise à jour statut RDV + notifications patient + gestion créneaux
- **Estimation** : 2 jours

#### `GET /v1/appointments`
- **Description** : Lister les rendez-vous de l'utilisateur connecté
- **Authentification** : ✅ Requise (Patients et Médecins)
- **Paramètres** : Statut, période, type consultation, pagination
- **Données retournées** : Liste personnalisée selon le rôle avec détails pertinents
- **Logique** : Requête différenciée par rôle + historique + rendez-vous futurs
- **Estimation** : 1 jour

#### `DELETE /v1/appointments/{id}/cancel`
- **Description** : Annuler un rendez-vous existant
- **Authentification** : ✅ Requise (Patients et Médecins propriétaires)
- **Données requises** : Motif d'annulation obligatoire
- **Logique** : Vérification autorisation + libération créneau + notifications + règles annulation
- **Estimation** : 1 jour

#### `PUT /v1/appointments/{id}/reschedule`
- **Description** : Reprogrammer un rendez-vous à une nouvelle date
- **Authentification** : ✅ Requise (Patients et Médecins propriétaires)
- **Données requises** : Nouveau créneau, motif du changement
- **Logique** : Validation nouveau créneau + accord des deux parties + notifications
- **Estimation** : 1 jour

---

## 💼 Phase P3 - Administration et Validation (MOYENNE)
*Objectif : Outils administratifs complets et gestion de la plateforme*

### 🏥 Gestion des Médecins

#### `GET /v1/admin/doctors/pending`
- **Description** : Lister les médecins en attente de validation
- **Authentification** : ✅ Requise (Administrateurs uniquement)
- **Données retournées** : Liste avec documents soumis, informations de contact, délai d'attente
- **Logique** : Filtrage par statut EN_ATTENTE + tri par date de soumission + documents joints
- **Estimation** : 1 jour

#### `PUT /v1/admin/doctors/{id}/suspend`
- **Description** : Suspendre ou réactiver un compte médecin
- **Authentification** : ✅ Requise (Administrateurs uniquement)
- **Données requises** : Motif de suspension, durée (temporaire/définitive)
- **Logique** : Changement statut + notification + annulation RDV futurs + audit
- **Estimation** : 1 jour

### 👥 Gestion des Patients

#### `GET /v1/admin/patients`
- **Description** : Consulter et gérer la liste des comptes patients
- **Authentification** : ✅ Requise (Administrateurs uniquement)
- **Paramètres** : Recherche, filtres par statut, date inscription, activité
- **Données retournées** : Liste paginée avec statistiques d'utilisation et modération
- **Logique** : Vue d'ensemble avec outils de recherche avancée + export possible
- **Estimation** : 1 jour

### 📊 Analytics et Reporting

#### `GET /v1/admin/analytics`
- **Description** : Tableaux de bord avec métriques clés de la plateforme
- **Authentification** : ✅ Requise (Administrateurs uniquement)
- **Paramètres** : Période d'analyse, type de métriques
- **Données retournées** : KPIs inscriptions, RDV, utilisation, revenus, satisfaction
- **Logique** : Agrégation de données avec calculs statistiques + graphiques
- **Estimation** : 2 jours

#### `GET /v1/admin/reports`
- **Description** : Générer des rapports détaillés d'activité et modération
- **Authentification** : ✅ Requise (Administrateurs uniquement)
- **Paramètres** : Type rapport, période, format (PDF/Excel), destinataires
- **Données retournées** : Rapports formatés avec analyses et recommandations
- **Logique** : Génération asynchrone + envoi par email + archivage sécurisé
- **Estimation** : 2 jours

---

## 🚀 Phase P4 - Fonctionnalités Avancées (BASSE)
*Objectif : Optimisations et fonctionnalités premium*

### 💊 Services Médicaux Avancés

#### `POST /v1/consultations/{id}/prescription`
- **Description** : Créer une ordonnance numérique post-consultation
- **Authentification** : ✅ Requise (Médecins validés uniquement)
- **Données requises** : Médicaments prescrits, posologie, durée, instructions
- **Logique** : Génération PDF sécurisé + signature numérique + envoi patient + archivage
- **Estimation** : 3 jours

#### `POST /v1/evaluations`
- **Description** : Système d'évaluation mutuelle post-rendez-vous
- **Authentification** : ✅ Requise (Patients et Médecins)
- **Données requises** : Note (1-5), commentaire, recommandation, critères spécifiques
- **Logique** : Validation RDV terminé + double évaluation + calcul moyennes + modération
- **Estimation** : 2 jours

### 🚨 Services d'Urgence

#### `GET /v1/emergency/pharmacies`
- **Description** : Localiser les pharmacies de garde ouvertes à proximité
- **Authentification** : ❌ Public (avec limitation de taux)
- **Paramètres** : Position géographique, rayon de recherche
- **Données retournées** : Pharmacies ouvertes avec adresses, horaires, contact
- **Logique** : Géolocalisation + API externes + cache + mise à jour temps réel
- **Estimation** : 2 jours

### 🤖 Intelligence Artificielle

#### `POST /v1/ai-health/conversation`
- **Description** : Assistant IA pour conseils santé de base (non-diagnostic)
- **Authentification** : ✅ Requise (Patients avec abonnement Pro)
- **Données requises** : Symptômes décrits, contexte, historique conversation
- **Données retournées** : Conseils généraux, recommandations, orientations
- **Logique** : Intégration IA + disclaimers légaux + limitation utilisation + audit
- **Estimation** : 1 semaine (intégration complexe)

### 🗺️ Géolocalisation Avancée

#### `GET /v1/routes/calculate`
- **Description** : Calcul d'itinéraires optimisés pour consultations à domicile
- **Authentification** : ✅ Requise (Médecins acceptant domicile)
- **Paramètres** : Adresse départ, adresse patient, préférences trajet
- **Données retournées** : Itinéraire détaillé, temps trajet, coût estimé, navigation
- **Logique** : API cartographie + optimisation multi-points + tarification distance
- **Estimation** : 3 jours

---

## 📈 Planning de Développement Recommandé

### 🎯 Semaine 1-2 : Finaliser P1B
- Jour 1-3 : Routes profils patients
- Jour 4-5 : Tests d'intégration P1A + P1B
- **Livrable** : MVP complet avec gestion utilisateurs

### 🎯 Semaine 3-5 : Développer P2 (Cœur métier)
- Semaine 3 : Recherche médecins + profils détaillés
- Semaine 4 : Système de rendez-vous complet
- Semaine 5 : Tests et optimisations
- **Livrable** : Plateforme fonctionnelle avec mise en relation

### 🎯 Semaine 6-7 : Compléter P3 (Administration)
- Semaine 6 : Interface admin + analytics
- Semaine 7 : Reporting et outils de modération
- **Livrable** : Outils administratifs complets

### 🎯 Semaine 8-10 : P4 (Fonctionnalités premium)
- Semaine 8 : Ordonnances + évaluations
- Semaine 9 : Services d'urgence + géolocalisation
- Semaine 10 : IA santé (optionnel selon priorités)
- **Livrable** : Plateforme complète avec services avancés

---

## 🔧 Prérequis Techniques

### Base de Données
- [ ] Tables pour rendez-vous et créneaux
- [ ] Tables pour évaluations et notes
- [ ] Tables pour prescriptions et documents
- [ ] Index de performance pour recherches

### Services Externes
- [ ] API SMS LeTexto (déjà configuré)
- [ ] API cartographie (Google Maps/OpenStreetMap)
- [ ] Service de génération PDF
- [ ] Service IA santé (OpenAI/local)

### Infrastructure
- [ ] Cache Redis pour recherches
- [ ] Queue system pour tâches asynchrones
- [ ] Stockage sécurisé pour documents médicaux
- [ ] Monitoring et logs avancés

---

## ⚠️ Points d'Attention

### Sécurité
- Chiffrement des données médicales sensibles
- Audit trail pour toutes les actions admin
- Validation stricte des autorisations par endpoint
- Protection contre les attaques par déni de service

### Performance
- Optimisation des requêtes de recherche médecins
- Cache intelligent pour les profils fréquemment consultés
- Pagination obligatoire sur tous les listings
- Compression des images et documents

### Légal & Conformité
- Respect RGPD pour données personnelles
- Disclaimers médicaux sur IA et conseils
- Archivage sécurisé des prescriptions (durée légale)
- Consentements patients pour données sensibles

---

*Document de planification - LYCORIS GROUP*  
*Mise à jour : 23 août 2025*