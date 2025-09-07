const { PrismaClient } = require('@prisma/client');
const seedAdmins = require('./seeders/admin-seeder');
const seedCliniques = require('./seeders/cliniques-seeder');
const seedMedecins = require('./seeders/medecins-seeder');
const seedDisponibilites = require('./seeders/disponibilites-seeder');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Démarrage du seeding complet...');
    console.log('');

    try {
        // Seeding dans l'ordre des dépendances
        console.log('====================================');
        console.log('1️⃣  SEEDING DES ADMINISTRATEURS');
        console.log('====================================');
        await seedAdmins();
        console.log('');

        console.log('====================================');
        console.log('2️⃣  SEEDING DES CLINIQUES');
        console.log('====================================');
        await seedCliniques();
        console.log('');

        console.log('====================================');
        console.log('3️⃣  SEEDING DES MÉDECINS');
        console.log('====================================');
        await seedMedecins();
        console.log('');

        console.log('====================================');
        console.log('4️⃣  SEEDING DES DISPONIBILITÉS');
        console.log('====================================');
        await seedDisponibilites();
        console.log('');

        console.log('====================================');
        console.log('✨ SEEDING TERMINÉ AVEC SUCCÈS ! ✨');
        console.log('====================================');
        console.log('');

        // Afficher le récapitulatif final
        const stats = await prisma.$transaction([
            prisma.user.count({ where: { role: 'ADMIN' } }),
            prisma.clinique.count(),
            prisma.user.count({ where: { role: 'MEDECIN' } }),
            prisma.medecin.count(),
            prisma.disponibilite.count()
        ]);

        console.log('📊 RÉCAPITULATIF FINAL :');
        console.log(`   👤 Administrateurs    : ${stats[0]}`);
        console.log(`   🏥 Cliniques          : ${stats[1]}`);
        console.log(`   👨‍⚕️ Users médecins     : ${stats[2]}`);
        console.log(`   📋 Profils médecins   : ${stats[3]}`);
        console.log(`   📅 Disponibilités     : ${stats[4]}`);
        console.log('');
        console.log('🚀 Base de données prête pour les tests !');
        console.log('');

    } catch (error) {
        console.error('❌ Erreur during seeding:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });