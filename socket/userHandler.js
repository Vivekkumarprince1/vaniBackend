const User = require('../models/User');

/**
 * Handle user connection and status updates
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 */
const handleUserConnection = async (io, socket, users) => {
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
};

module.exports = handleUserConnection;