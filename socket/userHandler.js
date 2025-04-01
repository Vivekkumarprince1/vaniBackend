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
          // Check if socket is still connected before updating status
          if (socket.connected) {
            await User.findByIdAndUpdate(socket.user.userId, {
              lastActive: Date.now(),
              status: 'online'
            });
          }
        } catch (err) {
          console.error('Heartbeat error:', err);
        }
      }, 30000); // Every 30 seconds

      // Add handler for temporary disconnects that shouldn't change status
      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Reconnection attempt ${attemptNumber} for user ${socket.user.userId}`);
      });

      socket.on('reconnect', async () => {
        console.log(`User ${socket.user.userId} reconnected`);
        try {
          await User.findByIdAndUpdate(socket.user.userId, {
            socketId: socket.id,
            status: 'online',
            lastActive: Date.now()
          });

          socket.broadcast.emit('userStatusChanged', {
            userId: socket.user.userId,
            socketId: socket.id,
            status: 'online',
            lastActive: Date.now()
          });
        } catch (err) {
          console.error('Error updating user status on reconnect:', err);
        }
      });

      socket.on('disconnect', async (reason) => {
        clearInterval(heartbeatInterval);
        console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
        
        // Only mark as offline for permanent disconnects
        // Transport close and ping timeout are permanent disconnects
        const isPermanentDisconnect = ['transport close', 'ping timeout'].includes(reason);
        
        try {
          if (isPermanentDisconnect) {
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
          } else {
            // For temporary disconnects, don't change status yet
            console.log(`Temporary disconnect for user ${socket.user.userId}, reason: ${reason}`);
          }
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
    // console.log('Updated active users:', users);
  } else {
    console.error('Socket connected without user data:', socket.id);
  }
};

module.exports = handleUserConnection;