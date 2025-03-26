const sdk = require("microsoft-cognitiveservices-speech-sdk");
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

// Log configuration on startup (with masked key for security)
console.log('Azure Speech Service Configuration:');
console.log('Region:', SPEECH_REGION);
console.log('Key:', SPEECH_KEY ? '****' + SPEECH_KEY.slice(-4) : 'Not configured');

// Language code mapping for Azure Speech Service
const languageCodeMap = {
  'en': 'en-US',
  'hi': 'hi-IN',
  'es': 'es-ES',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'it': 'it-IT',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'pt': 'pt-BR',
  'ru': 'ru-RU',
  'zh': 'zh-CN',
  // Add more mappings as needed
};

// Validate and map language code
const getValidLanguageCode = (languageCode) => {
  const mappedCode = languageCodeMap[languageCode] || languageCode;
  // Verify if the language is supported by creating a temp config
  try {
    const tempConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    tempConfig.speechRecognitionLanguage = mappedCode;
    return mappedCode;
  } catch (error) {
    throw new Error(`Unsupported language code: ${languageCode}`);
  }
};

// Add proper WAV format validation
const isValidWavFormat = (buffer) => {
  if (buffer.length < 44) return false;
  const header = buffer.slice(0, 4).toString('ascii');
  const format = buffer.slice(8, 12).toString('ascii');
  return header === 'RIFF' && format === 'WAVE';
};

const speechToText = async (audioData, sourceLanguage, maxRetries = 3) => {
  let attempts = 0;
  let lastError = null;

  // Validate audio format first
  if (!isValidWavFormat(audioData)) {
    throw new Error('Invalid WAV format');
  }

  // Validate and map language code first
  try {
    sourceLanguage = getValidLanguageCode(sourceLanguage);
  } catch (error) {
    console.error('Language validation error:', error);
    throw error;
  }

  while (attempts < maxRetries) {
    try {
      console.log(`Attempt ${attempts + 1}: Processing audio for language ${sourceLanguage}`);

      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = sourceLanguage;
      speechConfig.enableDictation();  // Enable better recognition for longer sentences
      
      const pushStream = sdk.AudioInputStream.createPushStream();
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      
      // Create recognizer with proper configuration
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      // Write audio data to stream
      const chunkSize = 4096;
      let offset = 44; // Skip WAV header
      for (let i = offset; i < audioData.length; i += chunkSize) {
        const chunk = audioData.slice(i, Math.min(i + chunkSize, audioData.length));
        pushStream.write(chunk);
      }
      pushStream.close();

      return new Promise((resolve, reject) => {
        let recognizedText = '';

        recognizer.recognizing = (s, e) => {
          console.log(`RECOGNIZING: ${e.result.text}`);
        };

        recognizer.recognized = (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            const text = e.result.text.trim();
            console.log(`RECOGNIZED: ${text}`);
            recognizedText += ' ' + text;
          } else if (e.result.reason === sdk.ResultReason.NoMatch) {
            console.log(`NOMATCH: Speech could not be recognized: ${sdk.NoMatchDetails.fromResult(e.result)}`);
          }
        };

        recognizer.canceled = (s, e) => {
          console.log(`CANCELED: Reason=${e.reason}`);
          if (e.reason === sdk.CancellationReason.Error) {
            console.error(`CANCELED: ErrorCode=${e.errorCode}`);
            console.error(`CANCELED: ErrorDetails=${e.errorDetails}`);
            
            // Check for specific language-related errors
            if (e.errorDetails.includes('language') || e.errorCode === 1007) {
              reject(new Error(`Unsupported language configuration: ${sourceLanguage}`));
            } else {
              reject(new Error(e.errorDetails));
            }
          }
          recognizer.stopContinuousRecognitionAsync(
            () => {
              resolve(recognizedText.trim());
            },
            (err) => {
              console.error('Error stopping recognition:', err);
              reject(err);
            }
          );
        };

        recognizer.sessionStopped = (s, e) => {
          console.log('Session stopped');
          recognizer.stopContinuousRecognitionAsync(
            () => {
              resolve(recognizedText.trim());
            },
            (err) => {
              console.error('Error stopping recognition:', err);
              reject(err);
            }
          );
        };

        // Start recognition
        recognizer.startContinuousRecognitionAsync(
          () => console.log('Recognition started'),
          (err) => {
            console.error('Recognition error:', err);
            reject(err);
          }
        );

        // Set timeout with proper cleanup
        setTimeout(() => {
          if (!recognizedText.trim()) {
            recognizer.stopContinuousRecognitionAsync(
              () => reject(new Error('Recognition timeout - no speech detected')),
              (err) => reject(err)
            );
          }
        }, 10000);
      });

    } catch (error) {
      console.error(`Attempt ${attempts + 1} failed:`, error);
      lastError = error;
      attempts++;
      
      if (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw lastError;
    }
  }
};

module.exports = { 
  speechToText,
  getValidLanguageCode // Export for use in other modules
};