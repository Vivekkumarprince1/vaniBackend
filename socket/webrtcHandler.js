/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
  socket.on('offer', async (data) => {
    const { offer, targetId, type, callerInfo } = data;
    
    console.log('Received offer from socket:', socket.id);
    console.log("type", type);
    console.log('Caller info:', callerInfo);
    
    if (!offer || !targetId) {
      console.error('Missing required offer data');
      return;
    }

    // Enrich caller info with socket user data
    const enrichedCallerInfo = {
      id: callerInfo?.id || socket.user?.userId,
      name: callerInfo?.name || socket.user?.username,
      socketId: socket.id,
      status: 'online',
      preferredLanguage: callerInfo?.preferredLanguage || 'en',
      avatar: callerInfo?.avatar || callerInfo?.name?.charAt(0).toUpperCase()
    };

    // Check if target socket exists
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
      console.error('Target socket not found:', targetId);
      socket.emit('callError', { message: 'User is not available' });
      return;
    }

    console.log('Emitting incomingCall to:', targetId);
    io.to(targetId).emit('incomingCall', {
      offer,
      from: socket.id,
      type,
      caller: enrichedCallerInfo
    });
  });
  
  // Enhanced answer handler
  socket.on('answer', (data) => {
    const { answer, targetId, receiverInfo } = data;
    
    // Include receiver info in the answer
    io.to(targetId).emit('answer', {
      answer,
      from: socket.id,
      receiverInfo: {
        id: socket.user.userId,
        name: socket.user.username,
        socketId: socket.id,
        preferredLanguage: receiverInfo?.preferredLanguage || 'en'
      }
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