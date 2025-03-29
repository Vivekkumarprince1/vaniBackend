const User = require('../models/User');
const Chat = require('../models/Chat');
const { translateMessageText } = require('../utils/messageTranslator');

/**
 * @param {Object} io 
 * @param {Object} socket
 * @param {Object} newMessage 
 * @param {String} roomId 
 * @param {String} message 
 * @param {String} originalLanguage 
 * @param {Map} translations 
 * @param {Object} users 
 */
const handleRoomMessage = async (io, socket, newMessage, roomId, message, originalLanguage, translations, users) => {
  console.log('Processing room message. Room ID:', roomId);
  newMessage.room = roomId;
  newMessage.isGroupMessage = true;
  
  const roomUsers = await User.find({ 
    _id: { $ne: socket.user.userId }
  }).select('_id preferredLanguage');
  
  console.log(`Room message from ${socket.user.userId} to ${roomUsers.length} users`);
  
  //languages needed for translation
  const uniqueLangs = [...new Set(roomUsers.map(u => u.preferredLanguage || 'en'))];
  
  // Translate for each unique language
  await Promise.all(uniqueLangs.map(async (targetLang) => {
    if (targetLang && targetLang !== originalLanguage && !translations.has(targetLang)) {
      try {
        console.log(`Translating from ${originalLanguage} to ${targetLang}`);
        const translated = await translateMessageText(message, targetLang);
        if (translated) {
          translations.set(targetLang, translated);
          console.log(`Translation result for ${targetLang}: "${translated}"`);
        }
      } catch (err) {
        console.error(`Failed to translate to ${targetLang}:`, err);
      }
    }
  }));
  
  newMessage.translations = translations;
  await newMessage.save();
  console.log('Message saved to database:', newMessage._id);
  
  // Send to everyone in the room
  for (const roomUser of roomUsers) {
    const userSocketId = Object.keys(users).find(
      key => users[key].userId === roomUser._id.toString()
    );
    
    if (userSocketId) {
      const userLang = roomUser.preferredLanguage || 'en';
      const messageToSend = {
        _id: newMessage._id,
        sender: socket.user.userId,
        content: translations.get(userLang) || message,
        originalContent: message,
        originalLanguage,
        translations: Object.fromEntries(translations),
        room: roomId,
        isGroupMessage: true,
        timestamp: newMessage.timestamp
      };
      
      io.to(userSocketId).emit('receiveMessage', messageToSend);
    }
  }
  
  // Send back to sender
  socket.emit('receiveMessage', {
    _id: newMessage._id,
    sender: socket.user.userId,
    content: message,
    originalContent: message,
    originalLanguage,
    translations: Object.fromEntries(translations),
    room: roomId,
    isGroupMessage: true,
    timestamp: newMessage.timestamp
  });
};

/**
 * Handle direct messages
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} newMessage - New message object
 * @param {String} receiverId - Receiver ID
 * @param {String} message - Original message
 * @param {String} originalLanguage - Original language
 * @param {Map} translations - Translations map
 * @param {Object} users - Active users object
 */
const handleDirectMessage = async (io, socket, newMessage, receiverId, message, originalLanguage, translations, users) => {
  console.log('Processing direct message. Receiver ID:', receiverId);
  
  // Get receiver's language preference
  const receiver = await User.findById(receiverId).select('preferredLanguage');
  if (!receiver) {
    console.error('Receiver not found:', receiverId);
    socket.emit('error', { message: 'Receiver not found' });
    return;
  }
  
  const receiverLang = receiver.preferredLanguage || 'en';
  console.log(`Direct message from ${socket.user.userId} to ${receiverId}. Original language: ${originalLanguage}, receiver language: ${receiverLang}`);
  
  // Translate message if receiver uses a different language
  if (receiverLang !== originalLanguage) {
    try {
      console.log(`Translating from ${originalLanguage} to ${receiverLang}`);
      const translated = await translateMessageText(message, receiverLang);
      if (translated) {
        translations.set(receiverLang, translated);
        console.log(`Translation result: "${translated}"`);
      }
    } catch (err) {
      console.error(`Failed to translate to ${receiverLang}:`, err);
    }
  }
  
  newMessage.receiver = receiverId;
  newMessage.translations = translations;
  await newMessage.save();
  
  // Find receiver's socket id
  const receiverSocketId = Object.keys(users).find(
    key => users[key].userId === receiverId
  );
  
  // Message object for sending
  const messageToSend = {
    _id: newMessage._id,
    sender: socket.user.userId,
    receiver: receiverId,
    content: translations.get(receiverLang) || message,
    originalContent: message,
    originalLanguage,
    translations: Object.fromEntries(translations),
    timestamp: newMessage.timestamp
  };
  
  // Send to receiver if online
  if (receiverSocketId) {
    io.to(receiverSocketId).emit('receiveMessage', messageToSend);
  }
  
  // Send back to sender
  socket.emit('receiveMessage', {
    ...messageToSend,
    content: message // Sender sees original message
  });
};

/**
 * Handle messaging functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 */
const handleMessaging = (io, socket, users) => {
  // Handle text messages
  socket.on('sendMessage', async (data) => {
    try {
      console.log('Received message data:', data);
      const { message, roomId, receiverId } = data;
      
      if (!socket.user) {
        console.error('Message received from unauthenticated socket:', socket.id);
        socket.emit('error', { message: 'Authentication required' });
        return;
      }
      
      // Ensure message is not undefined or null
      if (!message) {
        console.error('Empty message received from user:', socket.user.userId);
        socket.emit('error', { message: 'Message content is required' });
        return;
      }
      
      // Get sender's preferred language
      const sender = await User.findById(socket.user.userId);
      if (!sender) {
        console.error('Sender not found in database:', socket.user.userId);
        socket.emit('error', { message: 'User not found' });
        return;
      }
      
      const originalLanguage = sender.preferredLanguage || 'en';
      console.log('Sender language:', originalLanguage);
      
      // Create translations map
      const translations = new Map();
      translations.set(originalLanguage, message); // Store original message in its language
      
      // Create a new chat message in the database
      const newMessage = new Chat({
        sender: socket.user.userId,
        originalContent: message,
        content: message,
        originalLanguage,
        timestamp: new Date(),
        translations: translations
      });
      
      if (roomId) {
        await handleRoomMessage(io, socket, newMessage, roomId, message, originalLanguage, translations, users);
      } else if (receiverId) {
        await handleDirectMessage(io, socket, newMessage, receiverId, message, originalLanguage, translations, users);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
};

module.exports = {
  handleMessaging,
  handleRoomMessage,
  handleDirectMessage
};