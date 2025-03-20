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
const { translateSpeech, speechToText } = require('./utils/speechTranslator');
const translatorRoutes = require('./routes/translator');

// Load environment variables
dotenv.config();

// Log important configurations on startup
console.log('Environment Configuration:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MongoDB URI:', process.env.MONGO_URI ? '****' + process.env.MONGO_URI.slice(-10) : 'Not configured');
console.log('Azure Translator Region:', process.env.AZURE_TRANSLATOR_REGION);
console.log('Azure Translator Key:', process.env.AZURE_TRANSLATOR_KEY ? '****' + process.env.AZURE_TRANSLATOR_KEY.slice(-4) : 'Not configured');

// Increase timeout and add body size limits
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add timeout middleware
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(504).send('Request Timeout');
  });
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR'
    }
  });
});

const server = http.createServer(app);

// Updated allowed origins
const allowedOrigins = [
  'https://vani-frontend.vercel.app',
  'https://vani.vercel.app',
  'https://vani-git-main-vivekkumar.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174'
];

// Single CORS configuration for both Express and Socket.IO
const corsConfig = {
  origin: '*',  // temporarily allow all origins for testing
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'X-CSRF-Token',
    'X-Requested-With',
    'Accept',
    'Accept-Version',
    'Content-Length',
    'Content-MD5',
    'Content-Type',
    'Date',
    'X-Api-Version',
    'Authorization',
    'x-auth-token',
    'Origin'
  ],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Initialize Socket.IO with updated config
const io = socketIo(server, {
  path: '/socket.io/',
  serveClient: false,
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false,
  cors: {
    origin: "https://vani-frontend.vercel.app",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  connectTimeout: 45000
});

// Add WebSocket health check
app.get('/socket.io/', (req, res) => {
  res.send('Socket.IO is running');
});

// Apply CORS middleware to Express
app.use(cors(corsConfig));

// Pre-flight requests
app.options('*', cors(corsConfig));

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

// Add health check route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
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
  
  if (socket.user) {
    try {
      // Update user status and socket ID
      const user = await User.findByIdAndUpdate(
        socket.user.userId,
        {
          socketId: socket.id,
          status: 'online',
          lastActive: Date.now()
        },
        { new: true }
      );

      // Broadcast to all connected clients
      socket.broadcast.emit('userStatusChanged', {
        userId: user._id,
        socketId: socket.id,
        status: 'online',
        lastActive: user.lastActive
      });

      // Set up heartbeat to maintain online status
      const heartbeatInterval = setInterval(async () => {
        try {
          await User.findByIdAndUpdate(socket.user.userId, {
            lastActive: Date.now(),
            status: 'online'
          });
        } catch (err) {
          console.error('Heartbeat error:', err);
        }
      }, 30000); // Every 30 seconds

      socket.on('disconnect', async () => {
        clearInterval(heartbeatInterval);
        console.log('Client disconnected:', socket.id);
        
        try {
          await User.findByIdAndUpdate(socket.user.userId, {
            socketId: null,
            status: 'offline',
            lastActive: Date.now()
          });

          socket.broadcast.emit('userStatusChanged', {
            userId: socket.user.userId,
            socketId: null,
            status: 'offline',
            lastActive: Date.now()
          });
        } catch (err) {
          console.error('Error updating user status on disconnect:', err);
        }
      });
    } catch (err) {
      console.error('Error in socket connection:', err);
    }
  }
  
  // Store user information and update their socketId in DB
  if (socket.user) {
    try {
      // Update user status and socket ID
      const updatedUser = await User.findByIdAndUpdate(
        socket.user.userId, 
        {
          socketId: socket.id,
          status: 'online',
          lastActive: Date.now()
        },
        { new: true }
      ).select('-password');
      
      // Broadcast to other users that this user is online
      socket.broadcast.emit('userStatusChanged', {
        userId: socket.user.userId,
        socketId: socket.id,
        status: 'online',
        lastActive: updatedUser.lastActive
      });

      // Set up heartbeat to keep user status updated
      const heartbeat = setInterval(async () => {
        try {
          await User.findByIdAndUpdate(socket.user.userId, {
            lastActive: Date.now()
          });
        } catch (err) {
          console.error('Heartbeat update failed:', err);
        }
      }, 30000); // Every 30 seconds

      // Add disconnect handler
      socket.on('disconnect', async () => {
        clearInterval(heartbeat);
        console.log('User disconnected:', socket.user.userId);
        await User.findByIdAndUpdate(socket.user.userId, {
          socketId: null,
          status: 'offline',
          lastActive: Date.now()
        });
        
        socket.broadcast.emit('userStatusChanged', {
          userId: socket.user.userId,
          socketId: null,
          status: 'offline',
          lastActive: Date.now()
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
  
  // Handle audio translation - remove old handler and replace with this one
  // Handle audio translation
socket.on('translateAudio', async (data) => {
  try {
    const { audio, sourceLanguage, targetLanguage, userId } = data;
    console.log('Received audio translation request:', { 
      sourceLanguage, 
      targetLanguage, 
      userId,
      audioDataLength: audio ? audio.length : 0 
    });

    if (!audio || audio.length < 100) {
      console.warn('Invalid audio data received');
      socket.emit('error', { message: 'Invalid audio data' });
      return;
    }

    const receiverSocketId = Object.keys(users).find(
      key => users[key].userId === userId
    );

    if (!receiverSocketId) {
      console.error('Receiver not found or not online:', userId);
      socket.emit('error', { message: 'Receiver not found or not online' });
      return;
    }

    // Convert base64 to buffer with error handling
    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audio, 'base64');
    } catch (err) {
      console.error('Error decoding audio data:', err);
      socket.emit('error', { message: 'Invalid audio data format' });
      return;
    }

    // Retry speech-to-text up to 3 times
    let transcribedText;
    let attempts = 0;
    while (attempts < 3 && !transcribedText) {
      try {
        transcribedText = await speechToText(audioBuffer, sourceLanguage);
        if (transcribedText && transcribedText.trim()) {
          break;
        }
      } catch (err) {
        console.error(`Speech-to-text attempt ${attempts + 1} failed:`, err);
        attempts++;
        if (attempts === 3) {
          socket.emit('error', { message: 'Speech recognition failed' });
          return;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Send transcription to both parties
    socket.emit('audioTranscript', {
      text: transcribedText,
      isLocal: true
    });
    
    io.to(receiverSocketId).emit('audioTranscript', {
      text: transcribedText,
      isLocal: false
    });

    // Only translate if languages are different
    if (sourceLanguage !== targetLanguage) {
      try {
        // First translate the text
        const translatedText = await translateText(transcribedText, targetLanguage);
        console.log('Translated text:', translatedText);
        
        // Then convert translated text to speech
        const translatedAudio = await textToSpeech(translatedText, targetLanguage);
        
        // Send the complete result
        io.to(receiverSocketId).emit('translatedAudio', {
          text: {
            original: transcribedText,
            translated: translatedText
          },
          audio: translatedAudio.toString('base64')
        });
      } catch (translationError) {
        console.error('Translation error:', translationError);
        socket.emit('error', { message: 'Translation failed' });
      }
    }
  } catch (error) {
    console.error('Error in translateAudio handler:', error);
    socket.emit('error', { message: 'Internal server error' });
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