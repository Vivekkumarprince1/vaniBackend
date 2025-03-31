/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
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

    try {
      // Emit to target with enriched caller info
      io.to(targetId).emit('incomingCall', {
        offer,
        from: socket.id,
        type,
        caller: enrichedCallerInfo
      });
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