const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const register = async (req, res) => {
  const { username, mobileNumber, password } = req.body;

  try {
    // Check if mobile number already exists
    const existingMobile = await User.findOne({ mobileNumber });
    if (existingMobile) {
      return res.status(400).json({ error: 'Mobile number already registered' });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user with email explicitly set to undefined
    const user = new User({ 
      username, 
      mobileNumber, 
      password: hashedPassword,
      email: undefined  // Explicitly set to undefined to avoid null
    });
    
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  const { mobileNumber, password } = req.body;
  
  try {
    // Find user by mobile number
    const user = await User.findOne({ mobileNumber });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Generate and send token
    const token = jwt.sign(
      { userId: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    // Update last active timestamp
    user.lastActive = Date.now();
    await user.save();
    
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update last active timestamp
    user.lastActive = Date.now();
    await user.save();
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all users
const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update user's language preference
const updateLanguage = async (req, res) => {
    try {
        const { language } = req.body;
        
        if (!language) {
            return res.status(400).json({ error: 'Language is required' });
        }
        
        // Update user's language preference
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { preferredLanguage: language },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ message: 'Language preference updated', language: user.preferredLanguage });
    } catch (err) {
        console.error('Error updating language preference:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get supported languages
const getSupportedLanguages = async (req, res) => {
  try {
    const { getSupportedLanguages } = require('../utils/translator');
    const languages = await getSupportedLanguages();
    res.json(languages);
  } catch (err) {
    console.error('Error getting supported languages:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { register, login, getMe, getUsers, updateLanguage, getSupportedLanguages };