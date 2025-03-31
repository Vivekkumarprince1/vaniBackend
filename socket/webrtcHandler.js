/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
  socket.on('offer', async (data) => {
    const { offer, targetId, type, callerInfo } = data;
    
    console.log('Received offer from socket:', socket.id);
    console.log('Target socket:', targetId);
    console.log('Caller info:', callerInfo);
    console.log('Socket user info:', socket.user ? JSON.stringify(socket.user) : 'undefined');
    
    if (!offer || !targetId) {
      console.error('Missing required offer data');
      return;
    }

    // Enrich caller info with socket user data - add more defensive coding
    const enrichedCallerInfo = {
      id: callerInfo?.id || (socket.user ? socket.user.userId : 'unknown'),
      name: callerInfo?.name || (socket.user ? socket.user.username : 'Unknown User'),
      socketId: socket.id,
      status: 'online',
      preferredLanguage: callerInfo?.preferredLanguage || 'en',
      avatar: callerInfo?.avatar || (callerInfo?.name ? callerInfo.name.charAt(0).toUpperCase() : 'U')
    };

    console.log('Enriched caller info:', JSON.stringify(enrichedCallerInfo));

    // Check if target socket exists
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
      console.error('Target socket not found:', targetId);
      socket.emit('callError', { message: 'User is not available' });
      return;
    }

    console.log('Emitting incomingCall to:', targetId);
    
    // Store what we're sending for debugging
    const callData = {
      offer,
      from: socket.id,
      type,
      caller: enrichedCallerInfo
    };
    
    console.log('Emitting incomingCall data:', JSON.stringify(callData));
    
    io.to(targetId).emit('incomingCall', callData);
  });
  
  // Enhanced answer handler
  socket.on('answer', (data) => {
    const { answer, targetId, receiverInfo } = data;
    
    console.log('Received answer from socket:', socket.id);
    console.log('Target socket for answer:', targetId);
    console.log('Receiver info:', receiverInfo);
    console.log('Socket user info for answer:', socket.user ? JSON.stringify(socket.user) : 'undefined');
    
    // More defensive coding for the answer
    const enrichedReceiverInfo = {
      id: socket.user ? socket.user.userId : 'unknown',
      name: socket.user ? socket.user.username : 'Unknown User',
      socketId: socket.id,
      preferredLanguage: receiverInfo?.preferredLanguage || 'en'
    };
    
    console.log('Enriched receiver info:', JSON.stringify(enrichedReceiverInfo));
    
    // Include receiver info in the answer
    const answerData = {
      answer,
      from: socket.id,
      receiverInfo: enrichedReceiverInfo
    };
    
    console.log('Emitting answer data:', JSON.stringify(answerData));
    io.to(targetId).emit('answer', answerData);
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