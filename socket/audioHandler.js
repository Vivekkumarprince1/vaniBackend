/**
 * Handle audio translation functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 */
const { translateSpeech } = require('../utils/speechTranslator');

const handleAudioTranslation = (io, socket, users) => {
  socket.on('translateAudio', async (data) => {
    try {
      const { audio, sourceLanguage, targetLanguage, userId } = data;
      console.log('Received audio translation request:', { 
        sourceLanguage, 
        targetLanguage, 
        userId,
        audioDataLength: audio ? audio.length : 0 
      });
  
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('error', { message: 'Invalid audio data' });
        return;
      }
  
      // Find receiver's socket ID
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
  
      if (!receiverSocketId) {
        console.error('Receiver not found or not online socket:', userId);
        socket.emit('error', { message: 'Receiver not found or not online' });
        return;
      }
  
      // Convert base64 to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error decoding audio data:', err);
        socket.emit('error', { message: 'Invalid audio data format' });
        return;
      }
  
      // Use the translateSpeech function which handles the entire workflow
      const result = await translateSpeech(audioBuffer, sourceLanguage, targetLanguage);
      
      if (result.error) {
        console.error('Speech translation error:', result.error);
        socket.emit('error', { message: result.error });
        return;
      }
  
      if (!result.text.original || !result.text.original.trim()) {
        console.log('No speech detected or empty transcription');
        socket.emit('error', { message: 'No speech detected' });
        return;
      }
  
      // Send original transcription to both parties
      socket.emit('audioTranscript', {
        text: result.text.original,
        isLocal: true
      });
      
      io.to(receiverSocketId).emit('audioTranscript', {
        text: result.text.original,
        isLocal: false
      });
  
      // Send the translated audio and text to the receiver
      io.to(receiverSocketId).emit('translatedAudio', {
        text: {
          original: result.text.original,
          translated: result.text.translated
        },
        audio: result.audio ? result.audio.toString('base64') : null
      });
      
      console.log('Translation completed successfully:', {
        originalLength: result.text.original.length,
        translatedLength: result.text.translated.length,
        audioSize: result.audio ? result.audio.length : 0
      });
      
    } catch (error) {
      console.error('Error in translateAudio handler:', error);
      socket.emit('error', { message: 'Translation failed: ' + (error.message || 'Unknown error') });
    }
  });

  // Add handler for remote audio translation
  socket.on('translateRemoteAudio', async (data) => {
    try {
      const { audio, sourceLanguage, targetLanguage, userId } = data;
      console.log('Received remote audio translation request:', { 
        sourceLanguage, 
        targetLanguage, 
        userId,
        audioDataLength: audio ? audio.length : 0 
      });
  
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('error', { message: 'Invalid audio data' });
        return;
      }
  
      // Find receiver's socket ID (in this case, it's the original caller)
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
  
      if (!receiverSocketId) {
        console.error('Receiver not found or not online:', userId);
        socket.emit('error', { message: 'Receiver not found or not online' });
        return;
      }
  
      // Convert base64 to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error decoding audio data:', err);
        socket.emit('error', { message: 'Invalid audio data format' });
        return;
      }
  
      // Use the translateSpeech function which handles the entire workflow
      const result = await translateSpeech(audioBuffer, sourceLanguage, targetLanguage);
      
      if (result.error) {
        console.error('Speech translation error:', result.error);
        socket.emit('error', { message: result.error });
        return;
      }
  
      if (!result.text.original || !result.text.original.trim()) {
        console.log('No speech detected or empty transcription');
        socket.emit('error', { message: 'No speech detected' });
        return;
      }
  
      // Send original transcription to both parties
      socket.emit('audioTranscript', {
        text: result.text.original,
        isLocal: true
      });
      
      io.to(receiverSocketId).emit('audioTranscript', {
        text: result.text.original,
        isLocal: false
      });
  
      // Send the translated audio and text to the receiver
      io.to(receiverSocketId).emit('translatedAudio', {
        text: {
          original: result.text.original,
          translated: result.text.translated
        },
        audio: result.audio ? result.audio.toString('base64') : null
      });
      
      console.log('Remote translation completed successfully:', {
        originalLength: result.text.original.length,
        translatedLength: result.text.translated.length,
        audioSize: result.audio ? result.audio.length : 0
      });
      
    } catch (error) {
      console.error('Error in translateRemoteAudio handler:', error);
      socket.emit('error', { message: 'Translation failed: ' + (error.message || 'Unknown error') });
    }
  });
};

module.exports = handleAudioTranslation;