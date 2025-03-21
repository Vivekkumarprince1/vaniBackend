/**
 * Handle user disconnect functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 * @param {Object} rooms - Active rooms object
 */
const handleDisconnect = (io, socket, users, rooms) => {
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
};

module.exports = handleDisconnect;