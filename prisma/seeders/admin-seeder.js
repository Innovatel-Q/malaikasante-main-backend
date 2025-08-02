const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seedAdmins() {
    console.log('🔧 Création des comptes administrateurs...');

    try {
        // Vérifier si des admins existent déjà
        const existingAdmins = await prisma.user.count({
            where: { role: 'ADMIN' }
        });

        if (existingAdmins > 0) {
            console.log(`⚠️  ${existingAdmins} administrateur(s) déjà existant(s). Suppression et recréation...`);

            // Supprimer les anciens admins
            await prisma.user.deleteMany({
                where: { role: 'ADMIN' }
            });
        }

        // Hasher les mots de passe
        const password1 = await bcrypt.hash('Admin123!@#', 12);
        const password2 = await bcrypt.hash('SuperAdmin456!@#', 12);

        // Créer les deux administrateurs
        const admins = await prisma.user.createMany({
            data: [
                {
                    email: 'admin@medecins-patients.ci',
                    telephone: '0700000001',
                    nom: 'ADMIN',
                    prenom: 'Principal',
                    password: password1,
                    role: 'ADMIN',
                    statut: 'ACTIF',
                    canalCommunicationPrefere: 'EMAIL'
                },
                {
                    email: 'superadmin@medecins-patients.ci',
                    telephone: '0700000002',
                    nom: 'SUPER',
                    prenom: 'Administrateur',
                    password: password2,
                    role: 'ADMIN',
                    statut: 'ACTIF',
                    canalCommunicationPrefere: 'EMAIL'
                }
            ]
        });

        console.log('✅ Administrateurs créés avec succès !');
        console.log('');
        console.log('📋 Comptes créés :');
        console.log('');
        console.log('👤 Admin Principal :');
        console.log('   Email    : admin@medecins-patients.ci');
        console.log('   Password : Admin123!@#');
        console.log('   Téléphone: 0700000001');
        console.log('');
        console.log('👤 Super Administrateur :');
        console.log('   Email    : superadmin@medecins-patients.ci');
        console.log('   Password : SuperAdmin456!@#');
        console.log('   Téléphone: 0700000002');
        console.log('');
        console.log('🔐 Connexion via POST /v1/auth/login');

        return { count: admins.count };

    } catch (error) {
        console.error('❌ Erreur lors de la création des admins:', error);
        throw error;
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    seedAdmins()
        .then((result) => {
            console.log(`🎉 ${result.count} administrateur(s) créé(s) !`);
        })
        .catch((error) => {
            console.error('💥 Erreur fatale:', error);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}

module.exports = seedAdmins;