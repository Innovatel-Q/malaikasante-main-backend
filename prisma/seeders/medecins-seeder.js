const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seedMedecins() {
    console.log('👨‍⚕️ Création des médecins et leurs comptes utilisateurs...');

    try {
        // Récupérer les cliniques créées
        const cliniques = await prisma.clinique.findMany({
            select: { id: true, nom: true }
        });

        if (cliniques.length === 0) {
            throw new Error('Aucune clinique trouvée. Veuillez d\'abord exécuter le seeder des cliniques.');
        }

        console.log(`🏥 ${cliniques.length} clinique(s) trouvée(s) pour associer les médecins.`);

        // Supprimer les anciens médecins et utilisateurs médecins
        const existingMedecins = await prisma.medecin.count();
        if (existingMedecins > 0) {
            console.log(`⚠️  ${existingMedecins} médecin(s) déjà existant(s). Suppression...`);
            await prisma.medecin.deleteMany();
            await prisma.user.deleteMany({
                where: { role: 'MEDECIN' }
            });
        }

        // Données des 12 médecins (3 par clinique)
        const medecinData = [
            // Clinique de la Paix (3 médecins)
            {
                nom: "KOUAME", prenom: "Jean-Baptiste", email: "jb.kouame@cliniquepaix.ci", 
                telephone: "0708123456", specialites: ["CARDIOLOGIE"], experienceAnnees: 15, 
                tarif: 35000, bio: "Cardiologue expérimenté spécialisé dans les pathologies cardiovasculaires et l'électrophysiologie cardiaque."
            },
            {
                nom: "DIALLO", prenom: "Aminata", email: "a.diallo@cliniquepaix.ci", 
                telephone: "0708123457", specialites: ["PEDIATRIE"], experienceAnnees: 12, 
                tarif: 28000, bio: "Pédiatre passionnée avec une expertise en néonatologie et suivi de croissance infantile."
            },
            {
                nom: "ASSOUMAN", prenom: "Koffi", email: "k.assouman@cliniquepaix.ci", 
                telephone: "0708123458", specialites: ["MEDECINE_GENERALE"], experienceAnnees: 8, 
                tarif: 20000, bio: "Médecin généraliste dévoué, spécialisé dans la médecine familiale et préventive."
            },

            // Centre Médical les Palmiers (3 médecins)
            {
                nom: "TRAORE", prenom: "Mariam", email: "m.traore@palmiers-medical.ci", 
                telephone: "0708123459", specialites: ["GYNECOLOGIE"], experienceAnnees: 18, 
                tarif: 40000, bio: "Gynécologue-obstétricienne avec 18 ans d'expérience en suivi de grossesse et chirurgie gynécologique."
            },
            {
                nom: "N'GUESSAN", prenom: "Alain", email: "a.nguessan@palmiers-medical.ci", 
                telephone: "0708123460", specialites: ["DERMATOLOGIE"], experienceAnnees: 10, 
                tarif: 32000, bio: "Dermatologue spécialisé en dermatologie esthétique et traitement des pathologies cutanées."
            },
            {
                nom: "KONE", prenom: "Fatou", email: "f.kone@palmiers-medical.ci", 
                telephone: "0708123461", specialites: ["MEDECINE_GENERALE"], experienceAnnees: 6, 
                tarif: 18000, bio: "Jeune médecin généraliste dynamique, formée aux nouvelles approches de médecine préventive."
            },

            // Polyclinique Sainte-Anne (3 médecins)
            {
                nom: "OUATTARA", prenom: "Ibrahim", email: "i.ouattara@sainte-anne.ci", 
                telephone: "0708123462", specialites: ["CARDIOLOGIE", "MEDECINE_INTERNE"], experienceAnnees: 20, 
                tarif: 50000, bio: "Cardiologue senior et interniste, chef de service avec expertise en cardiologie interventionnelle."
            },
            {
                nom: "BAMBA", prenom: "Nathalie", email: "n.bamba@sainte-anne.ci", 
                telephone: "0708123463", specialites: ["NEUROLOGIE"], experienceAnnees: 14, 
                tarif: 45000, bio: "Neurologue spécialisée dans les troubles neurodégénératifs et l'épilepsie."
            },
            {
                nom: "YAO", prenom: "Serge", email: "s.yao@sainte-anne.ci", 
                telephone: "0708123464", specialites: ["ORTHOPEDIE"], experienceAnnees: 16, 
                tarif: 42000, bio: "Chirurgien orthopédiste expert en chirurgie du genou et traumatologie sportive."
            },

            // Cabinet Médical de l'Étoile (3 médecins)
            {
                nom: "SANGARE", prenom: "Aïcha", email: "a.sangare@etoile-medical.ci", 
                telephone: "0708123465", specialites: ["PEDIATRIE"], experienceAnnees: 11, 
                tarif: 25000, bio: "Pédiatre spécialisée en vaccination et médecine préventive infantile."
            },
            {
                nom: "DIABATE", prenom: "Moussa", email: "m.diabate@etoile-medical.ci", 
                telephone: "0708123466", specialites: ["MEDECINE_GENERALE"], experienceAnnees: 9, 
                tarif: 22000, bio: "Médecin de famille expérimenté dans le suivi des maladies chroniques et médecine gériatrique."
            },
            {
                nom: "COULIBALY", prenom: "Adjara", email: "a.coulibaly@etoile-medical.ci", 
                telephone: "0708123467", specialites: ["MEDECINE_GENERALE", "PEDIATRIE"], experienceAnnees: 7, 
                tarif: 19000, bio: "Médecin polyvalent spécialisée en médecine familiale et soins pédiatriques de base."
            }
        ];

        console.log(`👥 Création de ${medecinData.length} comptes utilisateur médecins...`);

        // Créer les médecins un par un avec leurs utilisateurs et associations cliniques
        const medecinsCreated = [];
        
        for (let i = 0; i < medecinData.length; i++) {
            const medecin = medecinData[i];
            const cliniqueIndex = Math.floor(i / 3); // 3 médecins par clinique
            const clinique = cliniques[cliniqueIndex];
            
            // Hash du mot de passe (format: prénom + année courante)
            const password = await bcrypt.hash(`${medecin.prenom}2024!`, 12);
            
            // Créer l'utilisateur
            const user = await prisma.user.create({
                data: {
                    email: medecin.email,
                    telephone: medecin.telephone,
                    nom: medecin.nom,
                    prenom: medecin.prenom,
                    password: password,
                    role: 'MEDECIN',
                    statut: 'ACTIF',
                    canalCommunicationPrefere: 'EMAIL'
                }
            });

            // Créer le profil médecin
            const medecinProfile = await prisma.medecin.create({
                data: {
                    userId: user.id,
                    numeroOrdre: `CI-MED-${String(2024000 + i + 1).padStart(7, '0')}`,
                    statutValidation: 'VALIDE',
                    dateValidation: new Date(),
                    specialites: medecin.specialites,
                    cliniqueId: clinique.id,
                    bio: medecin.bio,
                    experienceAnnees: medecin.experienceAnnees,
                    languesParlees: ["Français", "Baoulé", "Dioula"],
                    tarifConsultationBase: medecin.tarif,
                    accepteDomicile: Math.random() > 0.5, // 50% acceptent le domicile
                    accepteTeleconsultation: Math.random() > 0.3, // 70% acceptent la téléconsultation
                    accepteclinique: true, // Tous acceptent les consultations en clinique
                    noteMoyenne: 3.5 + Math.random() * 1.5, // Notes entre 3.5 et 5.0
                    nombreEvaluations: Math.floor(Math.random() * 50) + 10 // Entre 10 et 60 évaluations
                }
            });

            medecinsCreated.push({
                user,
                medecin: medecinProfile,
                clinique: clinique.nom,
                password: `${medecin.prenom}2024!`
            });
        }

        console.log('✅ Médecins créés avec succès !');
        console.log('');
        console.log('📋 Comptes médecins créés :');
        console.log('');

        medecinsCreated.forEach((item, index) => {
            console.log(`👨‍⚕️ Dr ${item.user.prenom} ${item.user.nom}`);
            console.log(`   Email      : ${item.user.email}`);
            console.log(`   Password   : ${item.password}`);
            console.log(`   Téléphone  : ${item.user.telephone}`);
            console.log(`   N° Ordre   : ${item.medecin.numeroOrdre}`);
            console.log(`   Clinique   : ${item.clinique}`);
            console.log(`   Spécialités: ${JSON.stringify(item.medecin.specialites).replace(/["\[\]]/g, '')}`);
            console.log(`   Expérience : ${item.medecin.experienceAnnees} ans`);
            console.log(`   Tarif base : ${item.medecin.tarifConsultationBase.toLocaleString()} XOF`);
            console.log(`   Note       : ${parseFloat(item.medecin.noteMoyenne).toFixed(1)}/5`);
            console.log(`   Domicile   : ${item.medecin.accepteDomicile ? '✅' : '❌'}`);
            console.log(`   Télé       : ${item.medecin.accepteTeleconsultation ? '✅' : '❌'}`);
            console.log('');
        });

        console.log('🔐 Connexion via POST /v1/auth/login avec email/password');
        console.log('');

        return { 
            count: medecinsCreated.length,
            medecins: medecinsCreated.map(m => ({
                id: m.medecin.id,
                userId: m.user.id,
                nom: `Dr ${m.user.prenom} ${m.user.nom}`,
                email: m.user.email,
                clinique: m.clinique
            }))
        };

    } catch (error) {
        console.error('❌ Erreur lors de la création des médecins:', error);
        throw error;
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    seedMedecins()
        .then((result) => {
            console.log(`🎉 ${result.count} médecin(s) créé(s) !`);
        })
        .catch((error) => {
            console.error('💥 Erreur fatale:', error);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}

module.exports = seedMedecins;