const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { Readable } = require('stream');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

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
  'pa': 'pa-IN',
  // Indian languages
  'mr': 'mr-IN',  // Marathi
  'bn': 'bn-IN',  // Bengali
  'gu': 'gu-IN',  // Gujarati
  'kn': 'kn-IN',  // Kannada
  'ml': 'ml-IN',  // Malayalam
  'or': 'or-IN',  // Odia/Oriya
  'ta': 'ta-IN',  // Tamil
  'te': 'te-IN',  // Telugu
  'ur': 'ur-IN',  // Urdu
  'as': 'as-IN',  // Assamese
  'sa': 'sa-IN',  // Sanskrit
  'sd': 'sd-IN',  // Sindhi
  'ne': 'ne-NP',  // Nepali
  'si': 'si-LK',  // Sinhala
  'kok': 'kok-IN', // Konkani
  'doi': 'doi-IN', // Dogri
  'mai': 'mai-IN', // Maithili
  'bho': 'bho-IN', // Bhojpuri
};

// Cache for validated language codes
const validatedLanguageCache = new Map();

// Optimize WAV format validation with minimal checks
const isValidWavFormat = (buffer) => {
  return buffer.length >= 44 && 
         buffer.slice(0, 4).toString('ascii') === 'RIFF' && 
         buffer.slice(8, 12).toString('ascii') === 'WAVE';
};

// Validate and map language code
const getValidLanguageCode = (languageCode) => {
  // Check cache first
  if (validatedLanguageCache.has(languageCode)) {
    return validatedLanguageCache.get(languageCode);
  }
  
  const mappedCode = languageCodeMap[languageCode] || languageCode;
  
  try {
    // Only create config object if we need to validate - lightweight validation
    const tempConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    tempConfig.speechRecognitionLanguage = mappedCode;
    
    // Cache the result
    validatedLanguageCache.set(languageCode, mappedCode);
    return mappedCode;
  } catch (error) {
    throw new Error(`Unsupported language code: ${languageCode}`);
  }
};

const speechToText = async (audioData, sourceLanguage, maxRetries = 2) => {
  // Quick validation before any processing
  if (!audioData || audioData.length < 44) {
    throw new Error('Invalid audio data');
  }
  
  if (!isValidWavFormat(audioData)) {
    throw new Error('Invalid WAV format');
  }

  // Validate language code once
  try {
    sourceLanguage = getValidLanguageCode(sourceLanguage);
  } catch (error) {
    console.error('Language validation error:', error);
    throw error;
  }

  let attempts = 0;
  let lastError = null;
  const retryDelay = 100; // Reduced retry delay

  while (attempts < maxRetries) {
    let recognizer = null;
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = sourceLanguage;
      speechConfig.enableDictation();
      
      // Optimize audio configuration
      const pushStream = sdk.AudioInputStream.createPushStream();
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      
      recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      // Write audio data to stream with larger chunks for better performance
      const chunkSize = 16384; // Doubled chunk size
      let offset = 44; // Skip WAV header
      
      // Process in background to not block the main thread
      setTimeout(() => {
        for (let i = offset; i < audioData.length; i += chunkSize) {
          const chunk = audioData.slice(i, Math.min(i + chunkSize, audioData.length));
          pushStream.write(chunk);
        }
        pushStream.close();
      }, 0);

      const result = await new Promise((resolve, reject) => {
        let recognizedText = '';
        let recognitionTimeout;

        recognizer.recognized = (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            const text = e.result.text.trim();
            recognizedText += text ? ' ' + text : '';
          }
        };

        recognizer.canceled = (s, e) => {
          if (e.reason === sdk.CancellationReason.Error) {
            clearTimeout(recognitionTimeout);
            
            // Check for specific error conditions
            if (e.errorDetails.includes('language') || e.errorCode === 1007) {
              reject(new Error(`Unsupported language configuration: ${sourceLanguage}`));
            } else {
              reject(new Error(e.errorDetails));
            }
          }
          
          stopRecognition();
        };

        recognizer.sessionStopped = () => {
          stopRecognition();
        };

        function stopRecognition() {
          clearTimeout(recognitionTimeout);
          recognizer.stopContinuousRecognitionAsync(
            () => resolve(recognizedText.trim()),
            (err) => reject(err)
          );
        }

        // Start recognition
        recognizer.startContinuousRecognitionAsync(
          () => {
            // Set recognition timeout
            recognitionTimeout = setTimeout(() => {
              if (!recognizedText.trim()) {
                stopRecognition();
                reject(new Error('Recognition timeout - no speech detected'));
              } else {
                stopRecognition();
              }
            }, 4000); // Reduced timeout for faster processing
          },
          (err) => reject(err)
        );
      });

      return result;
    } catch (error) {
      lastError = error;
      attempts++;
      
      // Clean up resources properly
      if (recognizer) {
        await new Promise(resolve => {
          recognizer.close(resolve, resolve);
        });
      }
      
      if (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      throw lastError;
    }
  }
};

module.exports = { 
  speechToText,
  getValidLanguageCode
};