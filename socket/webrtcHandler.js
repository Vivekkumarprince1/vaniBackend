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
      socket.emit('callError', { message: 'Missing offer or target ID' });
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
      
      // Log all active socket IDs for debugging
      const activeSocketIds = Array.from(io.sockets.sockets.keys());
      console.log('Active socket IDs:', activeSocketIds);
      
      socket.emit('callError', { message: 'User is not available' });
      return;
    }

    // Log full details of the event for debugging
    console.log('Emitting incomingCall to:', targetId, 'with data:', {
      from: socket.id,
      type,
      callerInfo: enrichedCallerInfo 
    });
    
    // Send an acknowledgement to the caller that the offer was sent
    socket.emit('offerSent', { targetId });
    
    // Emit the incoming call event to the target socket
    // Use a direct reference to the socket to avoid routing issues
    targetSocket.emit('incomingCall', {
      offer,
      from: socket.id,
      type,
      caller: enrichedCallerInfo
    });
    
    // Add delivery confirmation for debugging
    targetSocket.once('incomingCallReceived', (data) => {
      console.log('Target confirmed receipt of incoming call:', data);
      socket.emit('callDelivered', { targetId });
    });
  });
  
  // Enhanced answer handler
  socket.on('answer', (data) => {
    const { answer, targetId, receiverInfo } = data;
    
    if (!answer || !targetId) {
      console.error('Missing required answer data');
      socket.emit('callError', { message: 'Missing answer or target ID' });
      return;
    }

    // Check if target socket exists
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
      console.error('Target socket not found for answer:', targetId);
      socket.emit('callError', { message: 'Call target is no longer available' });
      return;
    }
    
    console.log('Sending answer from', socket.id, 'to', targetId);
    
    // Include receiver info in the answer
    targetSocket.emit('answer', {
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
    
    if (!candidate || !targetId) {
      console.error('Missing required ICE candidate data');
      return;
    }
    
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
      console.error('Target socket not found for ICE candidate:', targetId);
      return;
    }
    
    targetSocket.emit('iceCandidate', {
      candidate,
      from: socket.id
    });
  });

  // New event for call participant information exchange
  socket.on('callParticipantInfo', (data) => {
    const { targetId, participantInfo } = data;
    
    if (!targetId) {
      console.error('Missing target ID for call participant info');
      return;
    }
    
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
      console.error('Target socket not found for call participant info:', targetId);
      return;
    }
    
    targetSocket.emit('callParticipantInfo', {
      participantInfo,
      from: socket.id
    });
  });
};

module.exports = handleWebRTC;