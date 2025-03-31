/**
 * Handle WebRTC signaling functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 */
const handleWebRTC = (io, socket) => {
  // Add connection state tracking
  let isConnected = false;

  socket.on('connect', () => {
    console.log('WebRTC socket connected:', socket.id);
    isConnected = true;
  });

  socket.on('disconnect', () => {
    console.log('WebRTC socket disconnected:', socket.id);
    isConnected = false;
  });

  socket.on('offer', async (data) => {
    if (!isConnected) {
      console.error('Socket not connected, cannot process offer');
      return;
    }

    const { offer, targetId, type, callerInfo } = data;
    
    console.log('Received offer from socket:', socket.id);
    console.log("type", type);
    console.log('Caller info:', callerInfo);
    
    if (!offer || !targetId) {
      console.error('Missing required offer data');
      socket.emit('callError', { message: 'Missing required offer data' });
      return;
    }

    try {
      // Validate and enrich caller info
      const enrichedCallerInfo = {
        id: callerInfo?.id || socket.user?.userId || socket.id,
        name: callerInfo?.name || socket.user?.username || 'Unknown',
        socketId: socket.id,
        status: 'online',
        preferredLanguage: callerInfo?.preferredLanguage || socket.user?.preferredLanguage || 'en',
        avatar: callerInfo?.avatar || (callerInfo?.name || socket.user?.username || '?').charAt(0).toUpperCase()
      };

      console.log('Enriched caller info:', enrichedCallerInfo);

      // Check if target socket exists
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket) {
        console.error('Target socket not found:', targetId);
        socket.emit('callError', { message: 'User is not available' });
        return;
      }

      // Validate target socket connection
      if (!targetSocket.connected) {
        console.error('Target socket exists but is not connected:', targetId);
        socket.emit('callError', { message: 'User is not connected' });
        return;
      }

      console.log('Emitting incomingCall to:', targetId);
      
      // Send the offer with caller info in a separate event first
      targetSocket.emit('callerInfo', enrichedCallerInfo, (acknowledgement) => {
        if (acknowledgement?.error) {
          console.error('Error sending caller info:', acknowledgement.error);
          socket.emit('callError', { message: 'Failed to send caller info' });
          return;
        }
      });

      // Then send the offer
      targetSocket.emit('incomingCall', {
        offer,
        from: socket.id,
        type: type || 'video'
      }, (acknowledgement) => {
        if (acknowledgement?.error) {
          console.error('Error sending incomingCall:', acknowledgement.error);
          socket.emit('callError', { message: 'Failed to send call request' });
        }
      });

    } catch (error) {
      console.error('Error processing offer:', error);
      socket.emit('callError', { message: 'Error processing call request' });
    }
  });
  
  socket.on('answer', (data) => {
    if (!isConnected) {
      console.error('Socket not connected, cannot process answer');
      return;
    }

    const { answer, targetId, receiverInfo } = data;
    
    if (!answer || !targetId) {
      console.error('Missing required answer data');
      return;
    }

    try {
      // Include receiver info in the answer
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket) {
        console.error('Target socket not found for answer:', targetId);
        return;
      }

      targetSocket.emit('answer', {
        answer,
        from: socket.id,
        receiverInfo: {
          id: socket.user?.userId || socket.id,
          name: socket.user?.username || 'Unknown',
          socketId: socket.id,
          preferredLanguage: receiverInfo?.preferredLanguage || 'en'
        }
      });
    } catch (error) {
      console.error('Error processing answer:', error);
    }
  });
  
  socket.on('iceCandidate', (data) => {
    if (!isConnected) {
      console.error('Socket not connected, cannot process ICE candidate');
      return;
    }

    const { candidate, targetId } = data;
    
    if (!candidate || !targetId) {
      console.error('Missing required ICE candidate data');
      return;
    }

    try {
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket) {
        console.error('Target socket not found for ICE candidate:', targetId);
        return;
      }

      targetSocket.emit('iceCandidate', {
        candidate,
        from: socket.id
      });
    } catch (error) {
      console.error('Error processing ICE candidate:', error);
    }
  });

  socket.on('callParticipantInfo', (data) => {
    if (!isConnected) {
      console.error('Socket not connected, cannot process participant info');
      return;
    }

    const { targetId, participantInfo } = data;
    
    if (!targetId || !participantInfo) {
      console.error('Missing required participant info data');
      return;
    }

    try {
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket) {
        console.error('Target socket not found for participant info:', targetId);
        return;
      }

      targetSocket.emit('callParticipantInfo', {
        participantInfo,
        from: socket.id
      });
    } catch (error) {
      console.error('Error processing participant info:', error);
    }
  });
};

module.exports = handleWebRTC;