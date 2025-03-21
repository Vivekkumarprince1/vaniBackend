const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

// Import handler modules
const handleUserConnection = require('./userHandler');
const handleRooms = require('./roomHandler');
const { handleMessaging } = require('./messageHandler');
const handleWebRTC = require('./webrtcHandler');
const handleAudioTranslation = require('./audioHandler');
const handleDisconnect = require('./disconnectHandler');

// Store active users and their rooms
const users = {};
const rooms = {};

/**
 * Initialize Socket.IO with the HTTP server
 * @param {Object} server - HTTP server instance
 * @param {Array} allowedOrigins - CORS allowed origins
 * @returns {Object} - Configured Socket.IO instance
 */
const initializeSocket = (server, allowedOrigins) => {
  const io = socketIo(server, { 
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    }
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

  // Handle socket connections
  io.on('connection', async (socket) => {
    console.log('New client connected:', socket.id);
    
    // Handle user connection and status
    handleUserConnection(io, socket, users);
    
    // Handle room operations
    handleRooms(io, socket, rooms);
    
    // Handle messaging
    handleMessaging(io, socket, users);
    
    // Handle WebRTC signaling
    handleWebRTC(io, socket);
    
    // Handle audio translation
    handleAudioTranslation(io, socket, users);
    
    // Handle disconnect
    handleDisconnect(io, socket, users, rooms);
  });

  return io;
};

module.exports = { initializeSocket };