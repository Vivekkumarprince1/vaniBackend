const sdk = require("microsoft-cognitiveservices-speech-sdk");

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT || `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;

// Log configuration on startup (with masked key for security)
console.log('Azure Speech Service Configuration (Speech-to-Text):')
console.log('Region:', SPEECH_REGION);
console.log('Endpoint:', SPEECH_ENDPOINT);
console.log('Key:', SPEECH_KEY ? '****' + SPEECH_KEY.slice(-4) : 'Not configured');

// Validate credentials
if (!SPEECH_KEY || !SPEECH_REGION) {
  console.error('Azure Speech Service credentials not configured!');
}

/**
 * Converts speech to text using Azure Speech Services
 * @param {ArrayBuffer} audioData - Raw audio data
 * @param {string} sourceLanguage - Source language code
 * @returns {Promise<string>} - Transcribed text
 */
const speechToText = async (audioData, sourceLanguage, maxRetries = 3) => {

  // Retry mechanism
  let attempts = 0;
  let lastError = null;

  // Exponential backoff delay calculation
  const getBackoffDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 8000);

  while (attempts < maxRetries) {
    try {
    //   console.log(`Speech-to-text attempt ${attempts + 1}/${maxRetries}...`, { sourceLanguage, dataLength: audioData.length });
      
      // Validate WAV header
      if (!isValidWavFormat(audioData)) {
        console.error('Invalid WAV format');
        throw new Error('Invalid audio format');
      }

      // Validate source language
      if (!audioData) {
        console.error('audioData not provided');
        throw new Error('audioData not provided');
      } 

      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = sourceLanguage;
      
      // Configure for optimal speech recognition
      speechConfig.setProperty("SpeechServiceResponse_Detailed_Result", "true");
      speechConfig.setProfanity(sdk.ProfanityOption.Raw);
      speechConfig.enableAudioLogging();
      
      // Add connection timeout and retry settings
      speechConfig.setProperty("Speech_ConnectionTimeout", "15"); // 15 seconds
      speechConfig.setProperty("Speech_InitialSilenceTimeoutMs", "5000"); // 5 seconds
      speechConfig.setProperty("Speech_EndSilenceTimeoutMs", "5000"); // 5 seconds
      
      const pushStream = sdk.AudioInputStream.createPushStream();
      
      // Write audio data in chunks
      const chunkSize = 4096;
      for (let i = 44; i < audioData.length; i += chunkSize) { // Skip WAV header
        const chunk = audioData.slice(i, i + chunkSize);
        pushStream.write(chunk);
      }
      pushStream.close();
      
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      const result = await new Promise((resolve, reject) => {
        let finalText = '';
        let recognitionStarted = false;
        let timeoutHandle;
        
        recognizer.recognized = (_, event) => {
          if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
            const text = event.result.text.trim();
            if (text) {
              finalText += ' ' + text;
              console.log('Recognized text:', text);
            }
          }
        };

        recognizer.canceled = (_, event) => {
          clearTimeout(timeoutHandle);
          if (event.reason === sdk.CancellationReason.Error) {
            console.error(`Recognition error details (attempt ${attempts + 1}/${maxRetries}):`, {
              errorCode: event.errorCode,
              errorDetails: event.errorDetails
            });
            
            // Check for specific error codes that might benefit from retry
            const shouldRetry = [
              4, // Connection error
              1006, // Server error
              400, // Bad request
              503 // Service unavailable
            ].includes(event.errorCode) || event.errorDetails.includes('Unable to contact server');
            
            if (shouldRetry && attempts < maxRetries - 1) {
              reject(new Error(`Recognition error: ${event.errorDetails}`));
            } else {
              // If this is the last attempt, try to return any partial text we might have
              if (finalText.trim()) {
                console.log('Returning partial text despite error:', finalText);
                resolve(finalText.trim());
              } else {
                reject(new Error(`Recognition error: ${event.errorDetails}`));
              }
            }
          } else {
            console.log('Recognition canceled normally');
            resolve(finalText.trim());
          }
          recognizer.stopContinuousRecognitionAsync();
        };

        recognizer.sessionStarted = () => {
          recognitionStarted = true;
          console.log(`Recognition session started (attempt ${attempts + 1}/${maxRetries})`);
        };

        recognizer.sessionStopped = () => {
          clearTimeout(timeoutHandle);
          console.log(`Recognition completed (attempt ${attempts + 1}/${maxRetries}). Final text:`, finalText);
          recognizer.stopContinuousRecognitionAsync();
          resolve(finalText.trim());
        };

        // Start recognition with timeout
        recognizer.startContinuousRecognitionAsync(
          () => {
            timeoutHandle = setTimeout(() => {
              if (!finalText.trim() && recognitionStarted) {
                console.log(`Recognition timeout - stopping (attempt ${attempts + 1}/${maxRetries})`);
                recognizer.stopContinuousRecognitionAsync();
              }
            }, 15000); // 15 second timeout (increased from 10)
          },
          (error) => {
            console.error(`Could not start recognition (attempt ${attempts + 1}/${maxRetries}):`, error);
            reject(error);
          }
        );
      });
      
      // If we got here, recognition was successful
      return result;
      
    } catch (error) {
      lastError = error;
      attempts++;
      
      if (attempts < maxRetries) {
        // Calculate backoff delay based on attempt number
        const backoffDelay = getBackoffDelay(attempts);
        console.log(`Retrying speech recognition after ${backoffDelay}ms (attempt ${attempts}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        console.error(`All ${maxRetries} speech-to-text attempts failed:`, error);
        throw lastError;
      }
    }
  }
  
  // This should not be reached, but just in case
//   throw lastError || new Error('Speech recognition failed after all attempts');
};

// Helper function to validate WAV format
function isValidWavFormat(buffer) {
  if (buffer.length < 44) return false; // WAV header is 44 bytes

  // Check RIFF header
  const header = buffer.slice(0, 4).toString('ascii');
  if (header !== 'RIFF') {
    console.error('Invalid RIFF header:', header);
    return false;
  }

  // Check WAVE format
  const format = buffer.slice(8, 12).toString('ascii');
  if (format !== 'WAVE') {
    console.error('Invalid WAVE format:', format);
    return false;
  }

  return true;
}

module.exports = {
  speechToText
};