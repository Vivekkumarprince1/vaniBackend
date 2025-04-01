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
  console.log('Initializing Socket.IO with allowed origins:', allowedOrigins);
  
  const io = socketIo(server, { 
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          console.warn(`Origin ${origin} not allowed by Socket.IO CORS policy`);
          // In production, we'll allow all origins and rely on other security measures
          callback(null, true);
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
    },
    // Connection settings - adjusted for Azure
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    upgradeTimeout: 30000, // Increased from 20000 to allow more time for upgrades
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || 60000), // Increased from 30000
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || 25000),
    maxHttpBufferSize: 5e6, // 5MB
    // Enable for Azure web app
    perMessageDeflate: {
      threshold: 32768 // Only compress messages larger than this
    },
    connectTimeout: 45000, // Increased from 30000
    // Disable serving client code (client should bring its own)
    serveClient: false
  });

  // Socket.IO middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
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
    
    // Log transport used for debugging
    console.log(`Client transport: ${socket.conn.transport.name}`);

    // Add error handling for socket events
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
    
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

  // Periodically clean up stale connections (every 5 minutes)
  setInterval(() => {
    console.log('Cleaning up stale connections');
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      // Check if socket is still connected
      const socket = io.sockets.sockets.get(user?.socketId);
      if (!socket) {
        console.log(`Removing stale user: ${userId}`);
        delete users[userId];
      }
    });
  }, 5 * 60 * 1000);

  return io;
};

module.exports = { initializeSocket };