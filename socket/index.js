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
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["x-auth-token"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 30000,
    path: '/socket.io',
    // Add Azure-specific settings
    maxHttpBufferSize: 1e8, // 100MB for larger payloads
    upgradeTimeout: 30000, // Longer upgrade timeout for Azure
    allowUpgrades: true,
    perMessageDeflate: {
      threshold: 1024 // Compress data for efficiency
    }
  });

  // Socket activity monitoring
  setInterval(() => {
    const connectedSockets = io.sockets.sockets.size;
    console.log(`[Socket Monitor] Active connections: ${connectedSockets}`);
  }, 60000);

  // Socket.IO middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.error('No token provided for socket:', socket.id);
      return next(new Error('Authentication required'));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        userId: decoded.userId,
        username: decoded.username,
        preferredLanguage: decoded.preferredLanguage
      };
      console.log('Socket authenticated:', socket.id, 'for user:', decoded.userId);
      next();
    } catch (err) {
      console.error('Socket auth error:', err);
      // Only send a specific authentication error to client, not the full error
      next(new Error('Invalid authentication'));
    }
  });

  // Additional error handling
  io.engine.on("connection_error", (err) => {
    console.error('Socket connection error:', err);
  });

  // Handle socket connections
  io.on('connection', async (socket) => {
    console.log('New client connected:', socket.id, 'User:', socket.user?.username || 'Unknown');
    
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
    
    // Send connection acknowledgment to client
    socket.emit('connectionAcknowledged', { 
      userId: socket.user.userId,
      socketId: socket.id,
      timestamp: new Date().toISOString() 
    });
    
    // Add ping/pong mechanism for connection keep-alive
    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback({
          status: 'ok',
          time: new Date().toISOString(),
          socketId: socket.id
        });
      } else {
        socket.emit('pong', {
          status: 'ok',
          time: new Date().toISOString()
        });
      }
    });
  });

  return io;
};

module.exports = { initializeSocket };