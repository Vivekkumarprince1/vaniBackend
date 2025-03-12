const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection error:', err);
    process.exit(1);
  });

// Update user data to ensure language preferences are set
const migrateUserData = async () => {
  try {
    console.log('Starting migration of user data...');
    
    // Find all users without a preferred language
    const users = await User.find({ 
      $or: [
        { preferredLanguage: { $exists: false } },
        { preferredLanguage: null }
      ]
    });
    
    console.log(`Found ${users.length} users without language preferences`);
    
    // Update each user using updateOne to bypass validation
    for (const user of users) {
      try {
        await User.updateOne(
          { _id: user._id },
          { $set: { preferredLanguage: 'en' } }
        );
        console.log(`Updated user ${user._id} with default language: en`);
      } catch (err) {
        console.error(`Error updating user ${user._id}:`, err);
      }
    }
    
    // Find users without mobile numbers
    const usersWithoutMobile = await User.find({ mobileNumber: { $exists: false } });
    console.log(`Found ${usersWithoutMobile.length} users without mobile numbers`);
    
    // Add dummy mobile numbers
    for (const user of usersWithoutMobile) {
      try {
        // Generate random 10 digit mobile number
        const randomMobile = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        
        await User.updateOne(
          { _id: user._id },
          { $set: { mobileNumber: randomMobile } }
        );
        console.log(`Added mobile number to user ${user._id}: ${randomMobile}`);
      } catch (err) {
        console.error(`Error updating mobile for user ${user._id}:`, err);
      }
    }
    
    console.log('User data migration completed');
    process.exit(0);
  } catch (err) {
    console.error('Error during user data migration:', err);
    process.exit(1);
  }
};

// Run migration
migrateUserData(); 