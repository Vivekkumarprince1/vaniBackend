const express = require('express');
const router = express.Router();
const { getChatHistory, saveMessage, getUserRooms, translateMessage } = require('../controllers/chat');
const { translateText } = require('../utils/translator');
const auth = require('../middleware/auth');

// Apply auth middleware to all chat routes
router.use(auth);

// Get chat history
router.get('/history', getChatHistory);

// Save a new message
router.post('/message', saveMessage);

// Get user's rooms/groups
router.get('/rooms', getUserRooms);

// Translate text (for both messages and UI)
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    
    if (!text || !targetLang) {
      return res.status(400).json({ error: 'Text and target language are required' });
    }

    const translation = await translateText(text, targetLang);
    res.json({ translation });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

module.exports = router;