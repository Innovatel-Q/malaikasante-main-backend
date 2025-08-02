const ApiResponse = require('../services/ApiResponse');
const TokenService = require('../services/TokenService');
const SmsService = require('../services/SmsService');

console.log('🧪 Test des Services');

// Test ApiResponse
console.log('\n📨 Test ApiResponse:');
const mockRes = {
    status: (code) => ({
        json: (data) => {
            console.log(`Status: ${code}`, data);
            return data;
        }
    })
};

ApiResponse.success(mockRes, 'Test réussi', { userId: '123' });

// Test TokenService
console.log('\n🔑 Test TokenService:');
const mockUser = { id: '123', role: 'PATIENT' };
const token = TokenService.generateToken(mockUser);
console.log('Token généré:', token.substring(0, 50) + '...');

const verification = TokenService.checkToken(token);
console.log('Vérification token:', verification.isValid ? '✅ Valide' : '❌ Invalide');

// Test SmsService
console.log('\n📱 Test SmsService:');
const otp = SmsService.generateOtp();
console.log('OTP généré:', otp);
console.log('Type OTP:', typeof otp, '- Longueur:', otp.length);