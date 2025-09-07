const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedCliniques() {
    console.log('🏥 Création des cliniques...');

    try {
        // Vérifier si des cliniques existent déjà
        const existingCliniques = await prisma.clinique.count();

        if (existingCliniques > 0) {
            console.log(`⚠️  ${existingCliniques} clinique(s) déjà existante(s). Suppression et recréation...`);
            
            // Supprimer les anciennes cliniques (cascade sur medecins via FK)
            await prisma.clinique.deleteMany();
        }

        // Données des 4 cliniques à Abidjan avec coordonnées réelles
        const cliniquesData = [
            {
                nom: "Clinique de la Paix",
                adresse: "Boulevard de la République, Cocody",
                ville: "Abidjan",
                telephone: "2722412345",
                email: "contact@cliniquepaix.ci",
                latitude: 5.3597,
                longitude: -4.0083,
                horaires: {
                    "lundi": { "debut": "07:00", "fin": "19:00" },
                    "mardi": { "debut": "07:00", "fin": "19:00" },
                    "mercredi": { "debut": "07:00", "fin": "19:00" },
                    "jeudi": { "debut": "07:00", "fin": "19:00" },
                    "vendredi": { "debut": "07:00", "fin": "19:00" },
                    "samedi": { "debut": "08:00", "fin": "16:00" },
                    "dimanche": "fermé"
                },
                services: [
                    "Cardiologie",
                    "Pédiatrie", 
                    "Médecine générale",
                    "Laboratoire",
                    "Pharmacie",
                    "Urgences 24h/24"
                ]
            },
            {
                nom: "Centre Médical les Palmiers",
                adresse: "Zone 4, Marcory Résidentiel",
                ville: "Abidjan",
                telephone: "2722445678",
                email: "accueil@palmiers-medical.ci",
                latitude: 5.2669,
                longitude: -4.0056,
                horaires: {
                    "lundi": { "debut": "08:00", "fin": "18:00" },
                    "mardi": { "debut": "08:00", "fin": "18:00" },
                    "mercredi": { "debut": "08:00", "fin": "18:00" },
                    "jeudi": { "debut": "08:00", "fin": "18:00" },
                    "vendredi": { "debut": "08:00", "fin": "18:00" },
                    "samedi": { "debut": "09:00", "fin": "15:00" },
                    "dimanche": "fermé"
                },
                services: [
                    "Gynécologie",
                    "Dermatologie",
                    "Médecine générale",
                    "Échographie",
                    "Laboratoire"
                ]
            },
            {
                nom: "Polyclinique Sainte-Anne",
                adresse: "Avenue Chardy, Le Plateau",
                ville: "Abidjan",
                telephone: "2722467890",
                email: "info@sainte-anne.ci",
                latitude: 5.3250,
                longitude: -4.0267,
                horaires: {
                    "lundi": { "debut": "07:30", "fin": "20:00" },
                    "mardi": { "debut": "07:30", "fin": "20:00" },
                    "mercredi": { "debut": "07:30", "fin": "20:00" },
                    "jeudi": { "debut": "07:30", "fin": "20:00" },
                    "vendredi": { "debut": "07:30", "fin": "20:00" },
                    "samedi": { "debut": "08:00", "fin": "17:00" },
                    "dimanche": { "debut": "09:00", "fin": "13:00" }
                },
                services: [
                    "Cardiologie",
                    "Neurologie",
                    "Orthopédie",
                    "Médecine générale",
                    "Radiologie",
                    "Scanner",
                    "IRM",
                    "Pharmacie"
                ]
            },
            {
                nom: "Cabinet Médical de l'Étoile",
                adresse: "Rue des Jardins, Yopougon Résidentiel",
                ville: "Abidjan",
                telephone: "2722489012",
                email: "cabinet@etoile-medical.ci",
                latitude: 5.3358,
                longitude: -4.0750,
                horaires: {
                    "lundi": { "debut": "08:00", "fin": "17:00" },
                    "mardi": { "debut": "08:00", "fin": "17:00" },
                    "mercredi": { "debut": "08:00", "fin": "17:00" },
                    "jeudi": { "debut": "08:00", "fin": "17:00" },
                    "vendredi": { "debut": "08:00", "fin": "17:00" },
                    "samedi": { "debut": "09:00", "fin": "14:00" },
                    "dimanche": "fermé"
                },
                services: [
                    "Pédiatrie",
                    "Médecine générale",
                    "Vaccination",
                    "Consultations familiales"
                ]
            }
        ];

        // Créer les cliniques
        const cliniques = [];
        for (const cliniqueData of cliniquesData) {
            const clinique = await prisma.clinique.create({
                data: cliniqueData
            });
            cliniques.push(clinique);
        }

        console.log('✅ Cliniques créées avec succès !');
        console.log('');
        console.log('📋 Cliniques créées :');
        console.log('');

        cliniques.forEach((clinique, index) => {
            console.log(`🏥 ${clinique.nom}`);
            console.log(`   Adresse   : ${clinique.adresse}`);
            console.log(`   Téléphone : ${clinique.telephone}`);
            console.log(`   Email     : ${clinique.email}`);
            console.log(`   GPS       : ${clinique.latitude}, ${clinique.longitude}`);
            console.log(`   Services  : ${JSON.parse(JSON.stringify(clinique.services)).join(', ')}`);
            console.log('');
        });

        return { 
            count: cliniques.length, 
            cliniques: cliniques.map(c => ({ id: c.id, nom: c.nom }))
        };

    } catch (error) {
        console.error('❌ Erreur lors de la création des cliniques:', error);
        throw error;
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    seedCliniques()
        .then((result) => {
            console.log(`🎉 ${result.count} clinique(s) créée(s) !`);
        })
        .catch((error) => {
            console.error('💥 Erreur fatale:', error);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}

module.exports = seedCliniques;