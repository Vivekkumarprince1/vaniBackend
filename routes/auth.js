const express = require('express');
const router = express.Router();
const { register, login, getMe, getUsers, updateLanguage, getSupportedLanguages } = require('../controllers/auth');
const auth = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.get('/languages', getSupportedLanguages);

// Protected routes
router.get('/me', auth, getMe);
router.get('/users', auth, getUsers);
router.put('/language', auth, updateLanguage);
router.post('/update-language', auth, updateLanguage);

module.exports = router;