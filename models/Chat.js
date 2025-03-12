const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  receiver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  originalContent: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  originalLanguage: {
    type: String,
    default: 'en'
  },
  translations: {
    type: Map,
    of: String,
    default: new Map()
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  room: { 
    type: String
  },
  isGroupMessage: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Chat', chatSchema); 