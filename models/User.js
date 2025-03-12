const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  mobileNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, sparse: true, unique: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  profilePic: { type: String, default: null },
  lastActive: { type: Date, default: Date.now },
  preferredLanguage: { type: String, default: 'en' }
});

module.exports = mongoose.model('User', userSchema);