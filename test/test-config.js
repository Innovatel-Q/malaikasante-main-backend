const Consts = require('../config/const');

console.log('🔧 Test Configuration');
console.log('App Name:', Consts.APP_NAME);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', Consts.getPort());
console.log('JWT Secret:', Consts.JWT_SECRET ? '✅ Configuré' : '❌ Manquant');
console.log('SMS Config:', Consts.SMS_CONFIG.baseUrl ? '✅ Configuré' : '❌ Manquant');
console.log('Date Lib:', Consts.getDateLib()().format('YYYY-MM-DD HH:mm:ss'));