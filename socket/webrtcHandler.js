/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
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
};

module.exports = handleWebRTC;