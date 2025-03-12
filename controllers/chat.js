const Chat = require('../models/Chat');
const User = require('../models/User');
const { translateText } = require('../utils/translator');

// Get chat history between two users or in a room
const getChatHistory = async (req, res) => {
  try {
    const { userId, roomId } = req.query;
    let query = {};
    
    if (roomId) {
      // Group chat
      query = { room: roomId };
    } else if (userId) {
      // Direct message between two users
      query = {
        $or: [
          { sender: req.user.userId, receiver: userId },
          { sender: userId, receiver: req.user.userId }
        ],
        room: { $exists: false }
      };
    } else {
      return res.status(400).json({ error: 'Either userId or roomId is required' });
    }
    
    // Get current user's preferred language
    const currentUser = await User.findById(req.user.userId);
    const preferredLanguage = currentUser.preferredLanguage || 'en';
    
    const messages = await Chat.find(query)
      .sort({ timestamp: 1 })
      .populate('sender', 'username preferredLanguage')
      .populate('receiver', 'username preferredLanguage');
    
    // Check if messages need translation
    const messagesWithTranslation = messages.map(message => {
      const messageObj = message.toObject();
      
      // If the message has a translation in the user's preferred language, use it
      if (preferredLanguage !== 'en' && messageObj.translations && messageObj.translations.has(preferredLanguage)) {
        messageObj.content = messageObj.translations.get(preferredLanguage);
      } else if (preferredLanguage !== messageObj.originalLanguage) {
        // Mark for translation if not in user's preferred language
        messageObj.needsTranslation = true;
      }
      
      return messageObj;
    });
    
    res.json(messagesWithTranslation);
  } catch (err) {
    console.error('Error getting chat history:', err);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
};

// Save a new message
const saveMessage = async (req, res) => {
  try {
    const { receiverId, content, roomId } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    // Get sender's preferred language
    const sender = await User.findById(req.user.userId);
    const originalLanguage = sender.preferredLanguage || 'en';
    
    // Create new message
    const newMessage = new Chat({
      sender: req.user.userId,
      originalContent: content,
      content: content, // Initially, content is the same as originalContent
      originalLanguage,
      timestamp: new Date(),
      translations: new Map() // Initialize empty translations Map
    });
    
    // Set room or receiver
    if (roomId) {
      newMessage.room = roomId;
      newMessage.isGroupMessage = true;
      
      // Get all users in the room with their language preferences
      const roomUsers = await Chat.find({ room: roomId })
        .distinct('sender')
        .then(senderIds => User.find({ _id: { $in: senderIds } }).select('preferredLanguage'));
      
      // Translate message for each unique language
      for (const user of roomUsers) {
        const userLang = user.preferredLanguage;
        if (userLang && userLang !== originalLanguage && !newMessage.translations.has(userLang)) {
          try {
            const translated = await translateText(content, userLang);
            newMessage.translations.set(userLang, translated);
          } catch (err) {
            console.error(`Failed to translate to ${userLang}:`, err);
            // Continue with other translations even if one fails
          }
        }
      }
    } else if (receiverId) {
      newMessage.receiver = receiverId;
      
      // Get receiver's language preference
      const receiver = await User.findById(receiverId);
      if (receiver && receiver.preferredLanguage && receiver.preferredLanguage !== originalLanguage) {
        try {
          // Translate the message to receiver's language
          const translated = await translateText(content, receiver.preferredLanguage);
          newMessage.translations.set(receiver.preferredLanguage, translated);
        } catch (err) {
          console.error(`Failed to translate to ${receiver.preferredLanguage}:`, err);
          // Continue even if translation fails
        }
      }
    } else {
      return res.status(400).json({ error: 'Either receiverId or roomId is required' });
    }
    
    await newMessage.save();
    
    const populatedMessage = await Chat.findById(newMessage._id)
      .populate('sender', 'username preferredLanguage')
      .populate('receiver', 'username preferredLanguage');
      
    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error('Error saving message:', err);
    res.status(500).json({ error: 'Failed to save message' });
  }
};

// Translate a specific message
const translateMessage = async (req, res) => {
  try {
    const { messageId, targetLanguage } = req.body;
    
    if (!messageId || !targetLanguage) {
      return res.status(400).json({ error: 'Message ID and target language are required' });
    }
    
    const message = await Chat.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if translation already exists
    if (message.translations && message.translations.has(targetLanguage)) {
      return res.json({ 
        messageId, 
        translation: message.translations.get(targetLanguage) 
      });
    }
    
    // Handle legacy messages without originalContent field
    const textToTranslate = message.originalContent || message.content;
    
    // If no content to translate, return an error
    if (!textToTranslate) {
      return res.status(400).json({ error: 'No content to translate' });
    }
    
    // Translate the message
    const translatedText = await translateText(textToTranslate, targetLanguage);
    
    // Update message with new translation
    if (!message.translations) {
      message.translations = new Map();
    }
    
    message.translations.set(targetLanguage, translatedText);
    
    // Handle legacy messages by setting originalContent if it doesn't exist
    if (!message.originalContent && message.content) {
      message.originalContent = message.content;
      message.originalLanguage = message.originalLanguage || 'en';
    }
    
    await message.save();
    
    res.json({ messageId, translation: translatedText });
  } catch (err) {
    console.error('Error translating message:', err);
    res.status(500).json({ error: 'Failed to translate message' });
  }
};

// Get all chat rooms/groups a user is part of
const getUserRooms = async (req, res) => {
  try {
    const userRooms = await Chat.find({ 
      sender: req.user.userId, 
      room: { $exists: true, $ne: null } 
    })
    .distinct('room');
    
    res.json(userRooms);
  } catch (err) {
    console.error('Error getting user rooms:', err);
    res.status(500).json({ error: 'Failed to get user rooms' });
  }
};

module.exports = {
  getChatHistory,
  saveMessage,
  translateMessage,
  getUserRooms
}; 