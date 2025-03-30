const { speechToText } = require('./speechToTextModule');
const { textToSpeech } = require('./textToSpeechModule');
const { translateText } = require('./translator');

/**
 * Translates speech from one language to another
 * @param {ArrayBuffer|Buffer} audioData - Raw audio data
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<{text: {original: string, translated: string}, audio: Buffer|null, error: string|null}>}
 */
const translateSpeech = async (audioData, sourceLanguage, targetLanguage) => {
  try {
    // Validate audio data
    if (!audioData) {
      return { 
        error: 'Missing audio data', 
        text: { original: '', translated: '' },
        audio: null
      };
    }
    
    // Ensure we have Buffer for Node.js
    let audioBuffer;
    if (audioData instanceof ArrayBuffer) {
      audioBuffer = Buffer.from(audioData);
    } else if (audioData instanceof Buffer) {
      audioBuffer = audioData;
    } else if (typeof audioData === 'string') {
      // Assume base64
      try {
        audioBuffer = Buffer.from(audioData, 'base64');
      } catch (e) {
        return {
          error: 'Invalid base64 audio data', 
          text: { original: '', translated: '' },
          audio: null
        };
      }
    } else {
      return {
        error: 'Unsupported audio data format', 
        text: { original: '', translated: '' },
        audio: null
      };
    }
    
    if (audioBuffer.length < 100) {
      return { 
        error: 'Audio data too small or corrupted', 
        text: { original: '', translated: '' },
        audio: null
      };
    }

    // Normalize language codes
    sourceLanguage = (sourceLanguage || '').toLowerCase().split('-')[0];
    targetLanguage = (targetLanguage || '').toLowerCase().split('-')[0];
    
    // Default to English if no language specified
    if (!sourceLanguage) sourceLanguage = 'en';
    if (!targetLanguage) targetLanguage = 'en';
    
    console.log(`Starting speech translation flow from ${sourceLanguage} to ${targetLanguage}...`);

    // 1. Convert speech to text
    let originalText;
    try {
      originalText = await speechToText(audioBuffer, sourceLanguage);
      
      if (!originalText || typeof originalText !== 'string') {
        return { 
          error: 'Speech-to-text returned invalid result', 
          text: { original: '', translated: '' },
          audio: null
        };
      }
      
      originalText = originalText.trim();
      
      if (!originalText) {
        return { 
          error: 'No speech detected or empty transcription', 
          text: { original: '', translated: '' },
          audio: null
        };
      }
      
      console.log('Speech to text result:', { originalText });
    } catch (speechToTextError) {
      console.error('Speech-to-text error:', speechToTextError);
      return { 
        error: `Speech-to-text failed: ${speechToTextError.message || 'Unknown error'}`, 
        text: { original: '', translated: '' },
        audio: null
      };
    }

    // 2. Translate text - always translate if languages are different
    let translatedText;
    
    if (sourceLanguage !== targetLanguage) {
      try {
        translatedText = await translateText(originalText, sourceLanguage, targetLanguage);
        
        if (!translatedText || typeof translatedText !== 'string' || !translatedText.trim()) {
          console.error('Translation returned empty result');
          return { 
            error: 'Translation failed - empty result', 
            text: { original: originalText, translated: '' },
            audio: null
          };
        }
        
        console.log('Translation result:', { translatedText });
      } catch (translationError) {
        console.error('Translation error:', translationError);
        return { 
          error: `Translation failed: ${translationError.message || 'Unknown error'}`, 
          text: { original: originalText, translated: '' },
          audio: null
        };
      }
    } else {
      // No translation needed if source and target languages are the same
      translatedText = originalText;
      console.log('No translation needed (same language)');
    }

    // 3. Convert translated text to speech
    let translatedAudio;
    try {
      // Check if text is too short for TTS - add a period if needed
      if (translatedText.length < 3 && !translatedText.match(/[.!?]$/)) {
        translatedText = translatedText + '.';
        console.log('Added period to short text for better TTS results');
      }
      
      translatedAudio = await textToSpeech(translatedText, targetLanguage);
      
      // Validate the generated audio
      if (!translatedAudio || !(translatedAudio instanceof Buffer) || translatedAudio.length < 44) {
        throw new Error('Generated audio is empty or invalid');
      }
      
      // Verify WAV header (first 4 bytes should be "RIFF")
      const header = translatedAudio.slice(0, 4).toString('ascii');
      if (header !== 'RIFF') {
        console.warn('Generated audio does not have a valid WAV header');
        
        // Create a minimal WAV header
        const sampleRate = 16000; // Azure TTS uses 16kHz
        const numChannels = 1;    // Mono
        const bitsPerSample = 16; // 16-bit PCM
        
        const wavHeader = Buffer.alloc(44);
        
        // "RIFF" chunk descriptor
        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36 + translatedAudio.length, 4);
        wavHeader.write('WAVE', 8);
        
        // "fmt " sub-chunk
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16); // fmt chunk size
        wavHeader.writeUInt16LE(1, 20);  // PCM format
        wavHeader.writeUInt16LE(numChannels, 22);
        wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
        wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
        wavHeader.writeUInt16LE(bitsPerSample, 34);
        
        // "data" sub-chunk
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(translatedAudio.length, 40);
        
        // Combine header and audio data
        translatedAudio = Buffer.concat([wavHeader, translatedAudio]);
        console.log('Fixed audio with proper WAV header');
      }
      
      console.log('Text-to-speech successful, audio size:', translatedAudio.length);
    } catch (speechError) {
      console.error('Text-to-speech error:', speechError);
      return { 
        error: `Failed to convert translated text to speech: ${speechError.message || 'Unknown error'}`, 
        text: { original: originalText, translated: translatedText },
        audio: null
      };
    }

    return { 
      text: { original: originalText, translated: translatedText }, 
      audio: translatedAudio,
      error: null
    };
  } catch (error) {
    console.error('Error in speech translation:', error);
    return { 
      error: `Speech translation failed: ${error.message || 'Unknown error'}`, 
      text: { original: '', translated: '' },
      audio: null
    };
  }
};

module.exports = {
  speechToText,
  textToSpeech,
  translateSpeech
};