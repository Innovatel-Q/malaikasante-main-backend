const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedDisponibilites() {
    console.log('📅 Création des disponibilités des médecins...');

    try {
        // Récupérer tous les médecins créés avec leurs cliniques
        const medecins = await prisma.medecin.findMany({
            include: {
                user: { select: { nom: true, prenom: true } },
                clinique: { select: { id: true, nom: true } }
            }
        });

        if (medecins.length === 0) {
            throw new Error('Aucun médecin trouvé. Veuillez d\'abord exécuter le seeder des médecins.');
        }

        console.log(`👨‍⚕️ ${medecins.length} médecin(s) trouvé(s) pour créer les disponibilités.`);

        // Supprimer les anciennes disponibilités
        const existingDispos = await prisma.disponibilite.count();
        if (existingDispos > 0) {
            console.log(`⚠️  ${existingDispos} disponibilité(s) déjà existante(s). Suppression...`);
            await prisma.disponibilite.deleteMany();
        }

        // Types de consultation disponibles
        const typesConsultation = ['CLINIQUE', 'DOMICILE', 'TELECONSULTATION'];
        
        // Jours de la semaine
        const joursSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
        
        // Créneaux horaires typiques pour chaque type
        const creneauxHoraires = {
            matin: { debut: '08:00', fin: '12:00' },
            apres_midi: { debut: '14:00', fin: '18:00' },
            soir: { debut: '18:00', fin: '20:00' },
            samedi: { debut: '09:00', fin: '15:00' }
        };

        const disponibilitesCreated = [];

        // Pour chaque médecin, créer des disponibilités réalistes
        for (const medecin of medecins) {
            const medecinDispos = [];

            // Déterminer les types de consultation que ce médecin propose
            const typesDisponibles = [];
            if (medecin.accepteclinique) typesDisponibles.push('CLINIQUE');
            if (medecin.accepteDomicile) typesDisponibles.push('DOMICILE');
            if (medecin.accepteTeleconsultation) typesDisponibles.push('TELECONSULTATION');

            // Pour chaque type de consultation disponible
            for (const typeConsultation of typesDisponibles) {
                
                // Générer disponibilités selon le profil du médecin
                if (typeConsultation === 'CLINIQUE') {
                    // Consultations en clinique : 5-6 jours par semaine
                    const joursClinice = joursSemaine.slice(0, Math.random() > 0.3 ? 6 : 5);
                    
                    for (const jour of joursClinice) {
                        if (jour === 'SAMEDI') {
                            // Samedi : horaires réduits
                            medecinDispos.push({
                                medecinId: medecin.id,
                                jourSemaine: jour,
                                heureDebut: creneauxHoraires.samedi.debut,
                                heureFin: creneauxHoraires.samedi.fin,
                                typeConsultation: typeConsultation,
                                cliniqueId: medecin.cliniqueId,
                                dureeCreneauMinutes: 30,
                                recurrent: true
                            });
                        } else {
                            // Lundi à Vendredi : matin + après-midi (ou juste après-midi)
                            const aMatin = Math.random() > 0.2; // 80% ont le matin
                            const aApresMidi = Math.random() > 0.1; // 90% ont l'après-midi
                            
                            if (aMatin) {
                                medecinDispos.push({
                                    medecinId: medecin.id,
                                    jourSemaine: jour,
                                    heureDebut: creneauxHoraires.matin.debut,
                                    heureFin: creneauxHoraires.matin.fin,
                                    typeConsultation: typeConsultation,
                                    cliniqueId: medecin.cliniqueId,
                                    dureeCreneauMinutes: 30,
                                    recurrent: true
                                });
                            }
                            
                            if (aApresMidi) {
                                medecinDispos.push({
                                    medecinId: medecin.id,
                                    jourSemaine: jour,
                                    heureDebut: creneauxHoraires.apres_midi.debut,
                                    heureFin: creneauxHoraires.apres_midi.fin,
                                    typeConsultation: typeConsultation,
                                    cliniqueId: medecin.cliniqueId,
                                    dureeCreneauMinutes: 30,
                                    recurrent: true
                                });
                            }
                        }
                    }
                }

                if (typeConsultation === 'DOMICILE') {
                    // Consultations à domicile : horaires plus flexibles, moins de jours
                    const joursDomicile = joursSemaine.slice(0, Math.floor(Math.random() * 3) + 3); // 3-5 jours
                    
                    for (const jour of joursDomicile) {
                        if (jour !== 'SAMEDI') {
                            // Créneaux pour domicile (généralement après-midi ou soir)
                            const creneauDomicile = Math.random() > 0.5 ? 'apres_midi' : 'soir';
                            
                            medecinDispos.push({
                                medecinId: medecin.id,
                                jourSemaine: jour,
                                heureDebut: creneauxHoraires[creneauDomicile].debut,
                                heureFin: creneauxHoraires[creneauDomicile].fin,
                                typeConsultation: typeConsultation,
                                cliniqueId: null, // Pas de clinique pour domicile
                                dureeCreneauMinutes: 45, // Plus long pour le domicile
                                recurrent: true
                            });
                        }
                    }
                }

                if (typeConsultation === 'TELECONSULTATION') {
                    // Téléconsultations : très flexibles, souvent en soirée
                    const joursTele = joursSemaine; // Tous les jours
                    
                    for (const jour of joursTele) {
                        if (jour === 'SAMEDI') {
                            // Samedi matin seulement
                            medecinDispos.push({
                                medecinId: medecin.id,
                                jourSemaine: jour,
                                heureDebut: '10:00',
                                heureFin: '13:00',
                                typeConsultation: typeConsultation,
                                cliniqueId: null,
                                dureeCreneauMinutes: 20, // Plus courts pour télé
                                recurrent: true
                            });
                        } else {
                            // Soirée pour téléconsultations
                            medecinDispos.push({
                                medecinId: medecin.id,
                                jourSemaine: jour,
                                heureDebut: creneauxHoraires.soir.debut,
                                heureFin: creneauxHoraires.soir.fin,
                                typeConsultation: typeConsultation,
                                cliniqueId: null,
                                dureeCreneauMinutes: 20,
                                recurrent: true
                            });
                        }
                    }
                }
            }

            // Créer les disponibilités pour ce médecin
            if (medecinDispos.length > 0) {
                await prisma.disponibilite.createMany({
                    data: medecinDispos
                });
                
                disponibilitesCreated.push({
                    medecin: `Dr ${medecin.user.prenom} ${medecin.user.nom}`,
                    clinique: medecin.clinique?.nom || 'N/A',
                    disponibilites: medecinDispos.length,
                    types: [...new Set(medecinDispos.map(d => d.typeConsultation))]
                });
            }
        }

        console.log('✅ Disponibilités créées avec succès !');
        console.log('');
        console.log('📋 Récapitulatif des disponibilités :');
        console.log('');

        disponibilitesCreated.forEach(item => {
            console.log(`👨‍⚕️ ${item.medecin}`);
            console.log(`   Clinique      : ${item.clinique}`);
            console.log(`   Disponibilités: ${item.disponibilites} créneaux`);
            console.log(`   Types         : ${item.types.join(', ')}`);
            console.log('');
        });

        // Statistiques globales
        const totalDispos = await prisma.disponibilite.count();
        const statsTypes = await prisma.disponibilite.groupBy({
            by: ['typeConsultation'],
            _count: { typeConsultation: true }
        });

        console.log('📊 Statistiques globales :');
        console.log(`   Total disponibilités : ${totalDispos}`);
        statsTypes.forEach(stat => {
            console.log(`   ${stat.typeConsultation.padEnd(15)} : ${stat._count.typeConsultation} créneaux`);
        });
        console.log('');

        return { 
            count: totalDispos,
            parMedecin: disponibilitesCreated
        };

    } catch (error) {
        console.error('❌ Erreur lors de la création des disponibilités:', error);
        throw error;
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    seedDisponibilites()
        .then((result) => {
            console.log(`🎉 ${result.count} disponibilité(s) créée(s) !`);
        })
        .catch((error) => {
            console.error('💥 Erreur fatale:', error);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}

module.exports = seedDisponibilites;