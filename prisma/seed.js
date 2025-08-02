const { PrismaClient } = require('@prisma/client');
const seedAdmins = require('./seeders/admin-seeder');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Démarrage du seeding...');

    try {
        // Seeder des admins
        await seedAdmins();

        // Tu peux ajouter d'autres seeders ici
        // await seedMedecins();
        // await seedPatients();

        console.log('✨ Seeding terminé avec succès !');

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