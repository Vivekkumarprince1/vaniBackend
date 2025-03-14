const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { register, login, getMe, getUsers, updateLanguage, getSupportedLanguages } = require('../controllers/auth');
const auth = require('../middleware/auth');

// Public routes
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password, preferredLanguage } = req.body;
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create new user
    user = new User({
      username,
      email,
      password,
      preferredLanguage: preferredLanguage || 'en'
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferredLanguage: user.preferredLanguage
      }
    });
  } catch (error) {
    next(error);
  }
});
router.post('/login', login);
router.get('/languages', getSupportedLanguages);

// Protected routes
router.get('/me', auth, getMe);
router.get('/users', auth, getUsers);
router.put('/language', auth, updateLanguage);
router.post('/update-language', auth, updateLanguage);

module.exports = router;