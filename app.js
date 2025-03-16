const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const socketIo = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');
const Chat = require('./models/Chat');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const { translateText } = require('./utils/translator');
const translatorRoutes = require('./routes/translator');
const { translateSpeech } = require('./utils/speechTranslator');

// Load environment variables
dotenv.config();

// Log important configurations on startup
console.log('Environment Configuration:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MongoDB URI:', process.env.MONGO_URI ? '****' + process.env.MONGO_URI.slice(-10) : 'Not configured');
console.log('Azure Translator Region:', process.env.AZURE_TRANSLATOR_REGION);
console.log('Azure Translator Key:', process.env.AZURE_TRANSLATOR_KEY ? '****' + process.env.AZURE_TRANSLATOR_KEY.slice(-4) : 'Not configured');

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://vani-frontend.vercel.app', 'https://vani-git-main-vivekkumar.vercel.app', 'https://vani.vercel.app'] 
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:2000'];

const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Origin', 'Accept'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());

// Database connection
const connectDB = async () => {
  try {
      await mongoose.connect(process.env.MONGO_URI)
      console.log('MongoDB database is connected') 
  } catch (err) {
      console.log('MongoDB database is connection failed', err)
  }
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/translator', translatorRoutes);

// Update Socket.IO CORS config
const io = socketIo(server, { 
    cors: corsOptions
});

// Socket.IO middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    console.error('No token provided for socket connection');
    return next(new Error('Authentication error: No token provided'));
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    console.log('Socket authenticated for user:', decoded.userId);
    next();
  } catch (err) {
    console.error('Socket authentication error:', err.message);
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Store active users and their rooms
const users = {};
const rooms = {};

// WebSocket
io.on('connection', async (socket) => {
  console.log('New client connected:', socket.id);
  
  // Store user information and update their socketId in DB
  if (socket.user) {
    try {
      await User.findByIdAndUpdate(socket.user.userId, {
        socketId: socket.id,
        status: 'online'
      });
      
      // Broadcast to other users that this user is online
      socket.broadcast.emit('userStatusChanged', {
        userId: socket.user.userId,
        socketId: socket.id,
        status: 'online'
      });
      
      // Add disconnect handler
      socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.user.userId);
        await User.findByIdAndUpdate(socket.user.userId, {
          socketId: null,
          status: 'offline',
          lastSeen: new Date()
        });
        
        socket.broadcast.emit('userStatusChanged', {
          userId: socket.user.userId,
          socketId: null,
          status: 'offline'
        });
      });
    } catch (err) {
      console.error('Error updating user socket ID:', err);
    }
  }
  
  // Store user information
  if (socket.user) {
    users[socket.id] = {
      userId: socket.user.userId,
      socketId: socket.id
    };
    console.log('Updated active users:', users);
  } else {
    console.error('Socket connected without user data:', socket.id);
  }
  
  // Join a room
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // Add user to room if not already in
    if (!rooms[roomId].includes(socket.id)) {
      rooms[roomId].push(socket.id);
    }
    
    // Notify others in the room that a new user joined
    socket.to(roomId).emit('userJoined', { 
      userId: socket.user ? socket.user.userId : null,
      socketId: socket.id 
    });
  });
  
  // Leave a room
  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }
    
    // Notify others in the room that a user left
    socket.to(roomId).emit('userLeft', { 
      userId: socket.user ? socket.user.userId : null,
      socketId: socket.id 
    });
  });
  
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
        console.log('Processing room message. Room ID:', roomId);
        newMessage.room = roomId;
        newMessage.isGroupMessage = true;
        
        // Get all users in the room with their language preferences
        const roomUsers = await User.find({ 
          _id: { $ne: socket.user.userId }
        }).select('_id preferredLanguage');
        
        console.log(`Room message from ${socket.user.userId} to ${roomUsers.length} users`);
        
        // Get unique languages needed for translation
        const uniqueLangs = [...new Set(roomUsers.map(u => u.preferredLanguage || 'en'))];
        
        // Translate for each unique language
        await Promise.all(uniqueLangs.map(async (targetLang) => {
          if (targetLang && targetLang !== originalLanguage && !translations.has(targetLang)) {
            try {
              console.log(`Translating from ${originalLanguage} to ${targetLang}`);
              const translated = await translateText(message, targetLang);
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
        
      } else if (receiverId) {
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
            const translated = await translateText(message, receiverLang);
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
      }
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // WebRTC Signaling
  socket.on('offer', (data) => {
    const { offer, targetId } = data;
    io.to(targetId).emit('offer', {
      offer,
      from: socket.id
    });
  });
  
  socket.on('answer', (data) => {
    const { answer, targetId } = data;
    io.to(targetId).emit('answer', {
      answer,
      from: socket.id
    });
  });
  
  socket.on('iceCandidate', (data) => {
    const { candidate, targetId } = data;
    io.to(targetId).emit('iceCandidate', {
      candidate,
      from: socket.id
    });
  });
  
  // Handle audio translation
  socket.on('translateAudio', async (data) => {
    try {
      const { audio, sourceLanguage, targetLanguage, userId } = data;

      // Get receiver's socket ID
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );

      if (!receiverSocketId) {
        console.error('Receiver not found:', userId);
        return;
      }

      // Translate the audio
      const result = await translateSpeech(audio, sourceLanguage, targetLanguage);
      
      if (result) {
        // Send translated audio and text to receiver
        io.to(receiverSocketId).emit('translatedAudio', {
          text: {
            original: result.text,
            translated: result.translatedText
          },
          audio: result.audio
        });
      }
    } catch (error) {
      console.error('Error translating audio:', error);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id);
    console.log('Disconnect reason:', reason);
    
    if (users[socket.id]) {
      console.log('User disconnected:', users[socket.id].userId);
    }
    
    // Remove user from all rooms
    for (const roomId in rooms) {
      if (rooms[roomId].includes(socket.id)) {
        console.log(`Removing user from room ${roomId}`);
        rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
        
        // Remove empty rooms
        if (rooms[roomId].length === 0) {
          console.log(`Deleting empty room: ${roomId}`);
          delete rooms[roomId];
        }
      }
    }
    
    // Remove user from active users
    delete users[socket.id];
    console.log('Updated active users:', users);
  });
});

// Server startup
const PORT = process.env.PORT || 2000;

// Connect to database and start server
connectDB()
  .then(() => {
    server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
      console.log(`Access it at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
  });

// Only export app for testing or other uses if needed
module.exports = app;