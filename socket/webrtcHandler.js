/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
  // Add handler for getCallParticipantInfo
  socket.on('getCallParticipantInfo', async (data) => {
    const { userId } = data;
    if (!userId) {
      socket.emit('callError', { message: 'Invalid user ID' });
      return;
    }

    // Create participant info object
    const participantInfo = {
      id: socket.user.userId,
      name: socket.user.username,
      socketId: socket.id,
      status: 'online',
      preferredLanguage: socket.user.preferredLanguage || 'en',
      avatar: socket.user.username?.charAt(0).toUpperCase()
    };

    // Emit participant info back to requester
    socket.emit('callParticipantInfo', { participantInfo });
  });

  socket.on('offer', async (data) => {
    const { offer, targetId, type, callerInfo } = data;
    
    console.log('WebRTC Offer Details:', {
      from: socket.id,
      target: targetId,
      callerInfo,
      socketUser: socket.user
    });

    if (!targetId || !offer) {
      socket.emit('callError', { message: 'Invalid offer data' });
      return;
    }

    // Add better caller info enrichment with fallbacks
    const enrichedCallerInfo = {
      id: callerInfo?.id || socket.user?.userId,
      name: callerInfo?.name || socket.user?.username,
      socketId: socket.id,
      status: 'online',
      preferredLanguage: callerInfo?.preferredLanguage || socket.user?.preferredLanguage || 'en',
      avatar: callerInfo?.avatar || socket.user?.username?.charAt(0).toUpperCase()
    };

    // Log the enriched caller info
    console.log('Enriched caller info:', enrichedCallerInfo);
    console.log('Recipient socket ID:', targetId);

    try {
      // First check if the target socket exists
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket) {
        console.error(`Target socket ${targetId} not found in active connections`);
        socket.emit('callError', { message: 'User is not available for calls' });
        return;
      }

      console.log(`Emitting incomingCall event to ${targetId}`);
      
      // Emit to target with enriched caller info
      io.to(targetId).emit('incomingCall', {
        offer,
        from: socket.id,
        type,
        caller: enrichedCallerInfo
      });
      
      // Acknowledge successful offer sending
      console.log(`Offer sent to ${targetId} successfully`);
      
    } catch (error) {
      console.error('Error sending offer:', error);
      socket.emit('callError', { message: 'Failed to send call offer' });
    }
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