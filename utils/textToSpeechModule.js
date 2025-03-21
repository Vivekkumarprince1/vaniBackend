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

/**
 * Converts text to speech using Azure Speech Services
 * @param {string} text - Text to convert to speech
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<ArrayBuffer>} - Synthesized audio data
 */
const textToSpeech = async (text, targetLanguage, maxRetries = 3) => {
  let attempts = 0;
  let lastError = null;

  // Exponential backoff delay calculation
  const getBackoffDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 8000);

  while (attempts < maxRetries) {
    try {
      console.log(`Text-to-speech attempt ${attempts + 1}/${maxRetries}...`, { targetLanguage, textLength: text.length });
      
      // Check if required credentials are available
      if (!SPEECH_KEY || !SPEECH_REGION) {
        throw new Error('Azure Speech Service credentials not configured');
      }
      
      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      speechConfig.speechSynthesisLanguage = targetLanguage;
      
      // Add connection timeout settings
      speechConfig.setProperty("Speech_ConnectionTimeout", "15"); // 15 seconds
      
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

      return await new Promise((resolve, reject) => {
        // Set a timeout for the entire operation
        const timeoutId = setTimeout(() => {
          console.error(`Text-to-speech timeout after 20 seconds (attempt ${attempts + 1}/${maxRetries})`);
          synthesizer.close();
          reject(new Error('Text-to-speech operation timed out'));
        }, 20000); // 20 second timeout
        
        console.log(`Processing text-to-speech for language: ${targetLanguage}`);
        
        synthesizer.speakTextAsync(
          text,
          result => {
            clearTimeout(timeoutId);
            if (result.audioData && result.audioData.length > 0) {
              console.log(`Speech synthesized successfully (attempt ${attempts + 1}/${maxRetries}). Audio data length: ${result.audioData.length}`);
              resolve(result.audioData);
            } else {
              console.error(`No audio data generated (attempt ${attempts + 1}/${maxRetries})`);
              reject(new Error('No audio data generated'));
            }
            synthesizer.close();
          },
          error => {
            clearTimeout(timeoutId);
            console.error(`Speech synthesis error (attempt ${attempts + 1}/${maxRetries}):`, error);
            synthesizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      lastError = error;
      attempts++;
      
      if (attempts < maxRetries) {
        // Calculate backoff delay based on attempt number
        const backoffDelay = getBackoffDelay(attempts);
        console.log(`Retrying text-to-speech after ${backoffDelay}ms (attempt ${attempts}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        console.error(`All ${maxRetries} text-to-speech attempts failed:`, error);
        throw lastError;
      }
    }
  }
  
  // This should not be reached, but just in case
  throw lastError || new Error('Text-to-speech failed after all attempts');
};

module.exports = {
  textToSpeech
};