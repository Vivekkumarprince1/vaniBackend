const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Chat = require('./models/Chat');
const { translateText } = require('./utils/translator');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection error:', err);
    process.exit(1);
  });

// Test message translation between English and Hindi users
const testMessageTranslation = async () => {
  try {
    console.log('\n===== Message Translation Test =====\n');
    
    // Find or create two test users using updateOne to bypass validation
    const englishUserData = {
      username: 'english_test_user',
      mobileNumber: '1234567890',
      password: '$2a$10$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', // Dummy hashed password
      preferredLanguage: 'en',
      email: 'english_test@example.com' // Adding unique email
    };
    
    const hindiUserData = {
      username: 'hindi_test_user',
      mobileNumber: '9876543210',
      password: '$2a$10$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', // Dummy hashed password
      preferredLanguage: 'hi',
      email: 'hindi_test@example.com' // Adding unique email
    };
    
    // Upsert English user
    await User.updateOne(
      { username: 'english_test_user' },
      { $set: englishUserData },
      { upsert: true }
    );
    console.log('Created/updated English test user');
    
    // Upsert Hindi user
    await User.updateOne(
      { username: 'hindi_test_user' },
      { $set: hindiUserData },
      { upsert: true }
    );
    console.log('Created/updated Hindi test user');
    
    // Get user references
    const englishUser = await User.findOne({ username: 'english_test_user' });
    const hindiUser = await User.findOne({ username: 'hindi_test_user' });
    
    console.log('\nTest users:');
    console.log(`English User: ${englishUser._id} (${englishUser.username})`);
    console.log(`Hindi User: ${hindiUser._id} (${hindiUser.username})`);
    
    // Test messages
    const testMessages = [
      "Hello, how are you today?",
      "I am doing well, thanks for asking.",
      "Would you like to have a video call?",
      "Yes, that sounds good. Let's do it later.",
      "I like this chat app with translation feature.",
      "Goodbye, talk to you later!"
    ];
    
    console.log('\n--- English to Hindi Translation ---');
    
    // Simulate English user sending messages to Hindi user
    for (const message of testMessages) {
      console.log(`\nOriginal (English): "${message}"`);
      
      // Translate from English to Hindi
      const translatedMessage = await translateText(message, 'hi');
      console.log(`Translated (Hindi): "${translatedMessage}"`);
      
      // Create a message in the database
      const chatMessage = new Chat({
        sender: englishUser._id,
        receiver: hindiUser._id,
        originalContent: message,
        content: message,
        originalLanguage: 'en',
        translations: new Map([['hi', translatedMessage]])
      });
      
      await chatMessage.save();
      console.log(`Message saved with ID: ${chatMessage._id}`);
    }
    
    console.log('\n--- Hindi to English Translation ---');
    
    // Hindi test messages
    const hindiTestMessages = [
      "नमस्ते, आप कैसे हैं?",
      "मैं अच्छा हूं, धन्यवाद",
      "क्या आप वीडियो कॉल करना चाहेंगे?",
      "हां, यह अच्छा लगता है",
      "मुझे अनुवाद के साथ यह चैट ऐप पसंद है",
      "अलविदा, बाद में बात करेंगे!"
    ];
    
    // Simulate Hindi user sending messages to English user
    for (const message of hindiTestMessages) {
      console.log(`\nOriginal (Hindi): "${message}"`);
      
      // Here we would normally translate, but since we don't have Hindi to English
      // translation in our mock function, we'll add a prefix
      const translatedMessage = `[Translated from Hindi] ${message}`;
      console.log(`English User would see: "${translatedMessage}"`);
      
      // Create a message in the database
      const chatMessage = new Chat({
        sender: hindiUser._id,
        receiver: englishUser._id,
        originalContent: message,
        content: message,
        originalLanguage: 'hi',
        translations: new Map([['en', translatedMessage]])
      });
      
      await chatMessage.save();
      console.log(`Message saved with ID: ${chatMessage._id}`);
    }
    
    console.log('\n===== Test Completed =====');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
};

// Run the test
testMessageTranslation(); 