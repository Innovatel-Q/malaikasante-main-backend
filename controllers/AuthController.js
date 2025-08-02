const express = require('express');
const router = express.Router();

const otpSendRoute = require('../routes/auth/otp-send');
const otpVerifyRoute = require('../routes/auth/otp-verify');
const registerPatientRoute = require('../routes/auth/register-patient');
const registerMedecinRoute = require('../routes/auth/register-medecin')
const loginRoute = require('../routes/auth/login');
const refreshRoute = require('../routes/auth/refresh');
const logoutRoute = require('../routes/auth/logout');
const meRoute = require('../routes/auth/me');
const passwordRoute = require('../routes/auth/password-forgot');
const sessionsRoute = require('../routes/auth/sessions');



// Organisation des routes OTP
router.use('/otp/send', otpSendRoute);
router.use('/otp/verify', otpVerifyRoute);

// Routes d'inscription
router.use('/register/patient', registerPatientRoute);
router.use('/register/medecin', registerMedecinRoute);

// Route de connexion
router.use('/login', loginRoute);

// Route de rafraîchissement
router.use('/refresh', refreshRoute);

// Route de déconnexion
router.use('/logout', logoutRoute);

// Route pour obtenir les informations de l'utilisateur connecté
router.use('/me', meRoute);

// Route pour la gestion du mot de passe oublié
router.use('/password', passwordRoute);

// Route pour lister les sessions actives
router.use('/sessions', sessionsRoute);

module.exports = router;