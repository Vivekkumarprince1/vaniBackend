const sdk = require('microsoft-cognitiveservices-speech-sdk');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT || `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;

// Log configuration on startup (with masked key for security)
console.log('Azure Speech Service Configuration (Text-to-Speech):');
console.log('Region:', SPEECH_REGION);
console.log('Endpoint:', SPEECH_ENDPOINT);
console.log('Key:', SPEECH_KEY ? '****' + SPEECH_KEY.slice(-4) : 'Not configured');

// Validate credentials
if (!SPEECH_KEY || !SPEECH_REGION) {
  console.error('Azure Speech Service credentials not configured!');
}

// Language to voice mapping
const voiceMap = {
  'en': 'en-US-JennyNeural',
  'hi': 'hi-IN-MadhurNeural',
  'es': 'es-ES-ElviraNeural',
  'fr': 'fr-FR-DeniseNeural',
  'de': 'de-DE-KatjaNeural',
  'it': 'it-IT-ElsaNeural',
  'ja': 'ja-JP-NanamiNeural',
  'ko': 'ko-KR-SunHiNeural',
  'pt': 'pt-BR-FranciscaNeural',
  'ru': 'ru-RU-SvetlanaNeural',
  'zh': 'zh-CN-XiaoxiaoNeural'
};

/**
 * Get voice name based on language code
 * @param {string} languageCode - Language code
 * @returns {string|null} - Corresponding voice name or null if not found
 */
const getVoiceFromLanguage = (languageCode) => {
  const code = languageCode.toLowerCase().split('-')[0];
  return voiceMap[code] || null;
};

/**
 * Converts text to speech using Azure Speech Services
 * @param {string} text - Text to convert to speech
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<ArrayBuffer>} - Synthesized audio data
 */
const textToSpeech = async (text, targetLanguage, maxRetries = 3) => {
  // Input validation and normalization
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid or empty text input');
  }
  
  // Ensure text has meaningful content
  text = text.trim();
  if (text.length === 0) {
    throw new Error('Empty text input');
  }
  
  // For very short inputs, add a period to ensure proper synthesis
  if (text.length < 3 && !text.endsWith('.')) {
    text = text + '.';
  }

  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    try {
      console.log(`Text-to-speech attempt ${attempts + 1}/${maxRetries}:`, {
        targetLanguage,
        textLength: text.length,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : '')  // Log first 50 chars
      });

      if (!SPEECH_KEY || !SPEECH_REGION) {
        throw new Error('Azure Speech Service credentials not configured');
      }

      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      const voiceName = getVoiceFromLanguage(targetLanguage);
      
      if (!voiceName) {
        console.warn(`No voice found for language: ${targetLanguage}, falling back to English`);
        speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';
      } else {
        speechConfig.speechSynthesisVoiceName = voiceName;
      }
      
      // Use WAV format instead of MP3 for better compatibility
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
      
      // Create audio output config (file-based for debugging)
      const tempFileName = `temp_${Date.now()}.wav`;
      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(tempFileName);
      
      // Create synthesizer with audio output config
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          synthesizer.close();
          reject(new Error('Text-to-speech operation timed out'));
        }, 30000);

        // Use SSML for better control
        const ssml = `
          <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${targetLanguage}">
            <voice name="${speechConfig.speechSynthesisVoiceName}">
              ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </voice>
          </speak>
        `;

        synthesizer.speakSsmlAsync(
          ssml,
          result => {
            clearTimeout(timeoutId);
            synthesizer.close();
            
            if (result) {
              console.log('Synthesis result:', {
                resultId: result.resultId,
                audioLength: result.audioData?.length,
                reason: result.reason,
                state: result.privResult?.privSynthesisStatus
              });
            }

            // Read the audio file that was just created
            try {
              const fs = require('fs');
              if (fs.existsSync(tempFileName)) {
                const audioData = fs.readFileSync(tempFileName);
                console.log(`Audio synthesized successfully: ${audioData.length} bytes`);
                
                // Clean up the temporary file
                fs.unlinkSync(tempFileName);
                
                resolve(audioData);
              } else {
                console.error('Audio file was not created');
                reject(new Error('Audio file was not created'));
              }
            } catch (fileError) {
              console.error('Error reading audio file:', fileError);
              reject(fileError);
            }
          },
          error => {
            clearTimeout(timeoutId);
            console.error('Synthesis error details:', {
              name: error.name,
              message: error.message,
              code: error.code,
              details: error.details
            });
            synthesizer.close();
            reject(error);
          }
        );
      });

    } catch (error) {
      console.error(`Attempt ${attempts + 1} failed:`, {
        error: error.message,
        name: error.name,
        code: error.code,
        details: error.details
      });
      lastError = error;
      attempts++;

      if (attempts < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 8000);
        console.log(`Retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
      
      // If all attempts fail, return a default audio file instead of throwing an error
      try {
        const fs = require('fs');
        const path = require('path');
        const defaultAudioPath = path.join(__dirname, '../assets/default_message.wav');
        
        if (fs.existsSync(defaultAudioPath)) {
          console.log('Returning default audio file after failed synthesis');
          return fs.readFileSync(defaultAudioPath);
        } else {
          throw lastError;
        }
      } catch (fsError) {
        console.error('Could not load default audio:', fsError);
        throw lastError;
      }
    }
  }
};

module.exports = {
  textToSpeech
};