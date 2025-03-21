/**
 * Handle room operations (join/leave)
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} rooms - Active rooms object
 */
const handleRooms = (io, socket, rooms) => {
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
};

module.exports = handleRooms;