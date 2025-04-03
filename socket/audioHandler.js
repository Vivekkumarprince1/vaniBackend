/**
 * Handle audio translation functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 */
const { translateSpeech } = require('../utils/speechTranslator');

const handleAudioTranslation = (io, socket, users) => {
  // Add event listener for client-side ready state
  socket.on('audioSystemReady', (data) => {
    console.log('Client audio system ready:', data);
    socket.audioSystemReady = true;
  });
  
  socket.on('translateAudio', async (data) => {
    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId } = data;
      console.log('Received audio translation request:', { 
        sourceLanguage, 
        targetLanguage, 
        userId,
        requestId: requestId || 'none',
        audioDataLength: audio ? audio.length : 0 
      });
      
      // ADDED: Debug log for socket IDs
      console.log('Active socket IDs:', Object.keys(users));
      console.log('Current socket ID:', socket.id);
  
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('error', { 
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
  
      // Find receiver's socket ID
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
  
      if (!receiverSocketId) {
        console.error('Receiver not found or not online socket:', userId);
        socket.emit('error', { 
          message: 'Receiver not found or not online',
          requestId
        });
        return;
      }
      
      // ADDED: Debug log for receiver info
      console.log('Receiver found:', {
        receiverSocketId,
        receiverUserId: users[receiverSocketId].userId,
        isReceiverConnected: io.sockets.sockets.has(receiverSocketId)
      });
  
      // Check if receiver's audio system is ready
      const receiverSocket = io.sockets.sockets.get(receiverSocketId);
      const isReceiverReady = receiverSocket && receiverSocket.audioSystemReady === true;
      console.log(`Receiver audio system ready: ${isReceiverReady}`);
  
      // Convert base64 to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error decoding audio data:', err);
        socket.emit('error', { 
          message: 'Invalid audio data format',
          requestId
        });
        return;
      }
  
      // Use the translateSpeech function which handles the entire workflow
      const result = await translateSpeech(audioBuffer, sourceLanguage, targetLanguage);
      
      if (result.error) {
        console.error('Speech translation error:', result.error);
        socket.emit('error', { 
          message: result.error,
          requestId
        });
        return;
      }
  
      if (!result.text.original || !result.text.original.trim()) {
        console.log('No speech detected or empty transcription');
        socket.emit('error', { 
          message: 'No speech detected',
          requestId
        });
        return;
      }
  
      // Send original transcription to both parties
      socket.emit('audioTranscript', {
        text: result.text.original,
        isLocal: true,
        requestId
      });
      
      io.to(receiverSocketId).emit('audioTranscript', {
        text: result.text.original,
        isLocal: false,
        requestId
      });
  
      // Validate audio data before sending
      let audioBase64 = null;
      if (result.audio && result.audio instanceof Buffer) {
        // Ensure we have a valid WAV file with proper header
        if (result.audio.length >= 44) {
          // Check for RIFF header
          const header = result.audio.slice(0, 4).toString('ascii');
          if (header === 'RIFF') {
            audioBase64 = result.audio.toString('base64');
            console.log('Valid audio data prepared for sending, size:', result.audio.length);
            
            // ADDED: Debug the first 20 characters of the base64 audio data
            console.log('Audio data sample:', audioBase64.substring(0, 20) + '...');
          } else {
            console.error('Invalid WAV header in audio data');
          }
        } else {
          console.error('Audio data too small to be valid WAV');
        }
      } else {
        console.warn('No valid audio data available to send');
      }
      
      // Send the translated audio and text to the receiver
      const audioPayload = {
        text: {
          original: result.text.original,
          translated: result.text.translated
        },
        audio: audioBase64,
        requestId,
        timestamp: Date.now()
      };
      
      // ADDED: Debug the payload size
      console.log('Sending translatedAudio event to receiver:', {
        receiverSocketId,
        textLength: JSON.stringify(audioPayload.text).length,
        audioLength: audioBase64 ? audioBase64.length : 0,
        totalPayloadSize: JSON.stringify(audioPayload).length
      });
      
      // Try both direct socket and room-based emission
      // First try direct socket reference
      if (receiverSocket) {
        console.log('Sending directly to receiver socket');
        receiverSocket.emit('translatedAudio', audioPayload);
      }
      
      // Also try room-based transmission as backup
      console.log('Sending to receiver via room');
      io.to(receiverSocketId).emit('translatedAudio', audioPayload);
      
      // Send acknowledgment to sender
      socket.emit('translationComplete', {
        success: true,
        requestId,
        timestamp: Date.now()
      });
      
      console.log('Translation completed successfully:', {
        originalLength: result.text.original.length,
        translatedLength: result.text.translated.length,
        audioSize: result.audio ? result.audio.length : 0,
        requestId
      });
      
    } catch (error) {
      console.error('Error in translateAudio handler:', error);
      socket.emit('error', { 
        message: 'Translation failed: ' + (error.message || 'Unknown error'),
        requestId: data?.requestId
      });
    }
  });

  // Add handler for remote audio translation
  socket.on('translateRemoteAudio', async (data) => {
    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId } = data;
      console.log('Received remote audio translation request:', { 
        sourceLanguage, 
        targetLanguage, 
        userId,
        requestId: requestId || 'none',
        audioDataLength: audio ? audio.length : 0 
      });
  
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('error', { 
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
  
      // Find receiver's socket ID (in this case, it's the original caller)
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
  
      if (!receiverSocketId) {
        console.error('Receiver not found or not online:', userId);
        socket.emit('error', { 
          message: 'Receiver not found or not online',
          requestId
        });
        return;
      }
  
      // Convert base64 to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error decoding audio data:', err);
        socket.emit('error', { 
          message: 'Invalid audio data format',
          requestId
        });
        return;
      }
  
      // Use the translateSpeech function which handles the entire workflow
      const result = await translateSpeech(audioBuffer, sourceLanguage, targetLanguage);
      
      if (result.error) {
        console.error('Speech translation error:', result.error);
        socket.emit('error', { 
          message: result.error,
          requestId
        });
        return;
      }
  
      if (!result.text.original || !result.text.original.trim()) {
        console.log('No speech detected or empty transcription');
        socket.emit('error', { 
          message: 'No speech detected',
          requestId
        });
        return;
      }
  
      // Send original transcription to both parties
      socket.emit('audioTranscript', {
        text: result.text.original,
        isLocal: true,
        requestId
      });
      
      io.to(receiverSocketId).emit('audioTranscript', {
        text: result.text.original,
        isLocal: false,
        requestId
      });
  
      // Validate audio data before sending
      let audioBase64 = null;
      if (result.audio && result.audio instanceof Buffer) {
        // Ensure we have a valid WAV file with proper header
        if (result.audio.length >= 44) {
          // Check for RIFF header
          const header = result.audio.slice(0, 4).toString('ascii');
          if (header === 'RIFF') {
            audioBase64 = result.audio.toString('base64');
            console.log('Valid audio data prepared for sending, size:', result.audio.length);
          } else {
            console.error('Invalid WAV header in audio data');
          }
        } else {
          console.error('Audio data too small to be valid WAV');
        }
      } else {
        console.warn('No valid audio data available to send');
      }
      
      // Send the translated audio and text to the receiver
      io.to(receiverSocketId).emit('translatedAudio', {
        text: {
          original: result.text.original,
          translated: result.text.translated
        },
        audio: audioBase64,
        requestId,
        timestamp: Date.now()
      });
      
      // Send acknowledgment to sender
      socket.emit('translationComplete', {
        success: true,
        requestId,
        timestamp: Date.now()
      });
      
      console.log('Remote translation completed successfully:', {
        originalLength: result.text.original.length,
        translatedLength: result.text.translated.length,
        audioSize: result.audio ? result.audio.length : 0,
        requestId
      });
      
    } catch (error) {
      console.error('Error in translateRemoteAudio handler:', error);
      socket.emit('error', { 
        message: 'Translation failed: ' + (error.message || 'Unknown error'),
        requestId: data?.requestId
      });
    }
  });
  
  // Add a ping/pong mechanism to check client audio system readiness
  socket.on('pingAudioSystem', () => {
    socket.emit('pongAudioSystem', { timestamp: Date.now() });
  });
};

module.exports = handleAudioTranslation;