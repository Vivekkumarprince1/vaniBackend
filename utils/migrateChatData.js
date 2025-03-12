const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Chat = require('../models/Chat');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection error:', err);
    process.exit(1);
  });

// Update old chat messages to include new fields
const migrateChatData = async () => {
  try {
    console.log('Starting migration of chat data...');
    
    // Find all chat messages that don't have originalContent
    const oldMessages = await Chat.find({ 
      $or: [
        { originalContent: { $exists: false } },
        { originalLanguage: { $exists: false } }
      ]
    });
    
    console.log(`Found ${oldMessages.length} messages to migrate`);
    
    // Update each message
    for (const message of oldMessages) {
      try {
        // Set originalContent to content if it doesn't exist
        if (!message.originalContent && message.content) {
          message.originalContent = message.content;
        }
        
        // Set originalLanguage to 'en' if it doesn't exist
        if (!message.originalLanguage) {
          message.originalLanguage = 'en';
        }
        
        // Initialize translations map if it doesn't exist
        if (!message.translations) {
          message.translations = new Map();
        }
        
        await message.save();
        console.log(`Migrated message: ${message._id}`);
      } catch (err) {
        console.error(`Error migrating message ${message._id}:`, err);
      }
    }
    
    console.log('Migration completed');
    process.exit(0);
  } catch (err) {
    console.error('Error during migration:', err);
    process.exit(1);
  }
};

// Run migration
migrateChatData(); 