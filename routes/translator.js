const express = require('express');
const router = express.Router();
const { getLanguages, translateText } = require('../controllers/translator');
const auth = require('../middleware/auth');

// Get supported languages
router.get('/languages', auth, getLanguages);

// Translate text
router.post('/translate', auth, translateText);

module.exports = router; 