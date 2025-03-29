/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
  socket.on('offer', async (data) => {
    const { offer, targetId, type, callerInfo } = data;
    
    // Ensure we have the complete user info from socket
    const enrichedCallerInfo = {
      id: socket.user.userId,
      name: socket.user.username || callerInfo.name,
      socketId: socket.id,
      status: 'online',
      preferredLanguage: callerInfo.preferredLanguage,
      avatar: socket.user.username?.charAt(0).toUpperCase()
    };

    console.log('Sending call offer with enriched caller info:', enrichedCallerInfo);
    
    io.to(targetId).emit('incomingCall', {
      offer,
      from: socket.id,
      type,
      caller: enrichedCallerInfo  // Send enriched caller info
    });
  });
  
  socket.on('answer', (data) => {
    const { answer, targetId, receiverInfo } = data;
    io.to(targetId).emit('answer', {
      answer,
      from: socket.id,
      receiverInfo
    });
  });
  
  socket.on('iceCandidate', (data) => {
    const { candidate, targetId } = data;
    io.to(targetId).emit('iceCandidate', {
      candidate,
      from: socket.id
    });
  });

  // New event for call participant information exchange
  socket.on('callParticipantInfo', (data) => {
    const { targetId, participantInfo } = data;
    io.to(targetId).emit('callParticipantInfo', {
      participantInfo,
      from: socket.id
    });
  });
};

module.exports = handleWebRTC;