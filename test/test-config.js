const Consts = require('../config/const');

console.log('🔧 Test Configuration');
console.log('App Name:', Consts.APP_NAME);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', Consts.getPort());
console.log('JWT Secret:', Consts.JWT_SECRET ? '✅ Configuré' : '❌ Manquant');
console.log('SMS Config:', Consts.SMS_CONFIG.baseUrl ? '✅ Configuré' : '❌ Manquant');
console.log('Date Lib:', Consts.getDateLib()().format('YYYY-MM-DD HH:mm:ss'));

// Configuration pour les tests
const BASE_URL = `http://localhost:${Consts.getPort()}/v1`;

console.log('Base URL Tests:', BASE_URL);

module.exports = {
    BASE_URL,
    PORT: Consts.getPort(),
    JWT_SECRET: Consts.JWT_SECRET,
    APP_NAME: Consts.APP_NAME
};