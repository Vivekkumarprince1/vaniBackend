const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { translateText } = require('./translator');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT || `https://${SPEECH_REGION}.api.cognitive.microsoft.com/`;

if (!SPEECH_KEY || !SPEECH_REGION) {
  console.error('Azure Speech Service credentials not configured!');
}

/**
 * Converts speech to text using Azure Speech Services
 * @param {ArrayBuffer} audioData - Raw audio data
 * @param {string} sourceLanguage - Source language code
 * @returns {Promise<string>} - Transcribed text
 */
const speechToText = async (audioData, sourceLanguage) => {
  try {
    console.log('Starting speech-to-text conversion...', { sourceLanguage, dataLength: audioData.length });
    
    // Validate WAV header
    if (!isValidWavFormat(audioData)) {
      console.error('Invalid WAV format');
      throw new Error('Invalid audio format');
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechRecognitionLanguage = sourceLanguage;
    
    // Configure for optimal speech recognition
    speechConfig.setProperty("SpeechServiceResponse_Detailed_Result", "true");
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);
    speechConfig.enableAudioLogging();
    
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

    return new Promise((resolve, reject) => {
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
          console.error('Recognition error details:', {
            errorCode: event.errorCode,
            errorDetails: event.errorDetails
          });
          reject(new Error(`Recognition error: ${event.errorDetails}`));
        } else {
          console.log('Recognition canceled normally');
          resolve(finalText.trim());
        }
        recognizer.stopContinuousRecognitionAsync();
      };

      recognizer.sessionStarted = () => {
        recognitionStarted = true;
        console.log('Recognition session started');
      };

      recognizer.sessionStopped = () => {
        clearTimeout(timeoutHandle);
        console.log('Recognition completed. Final text:', finalText);
        recognizer.stopContinuousRecognitionAsync();
        resolve(finalText.trim());
      };

      // Start recognition with timeout and retry
      const startRecognition = () => {
        recognizer.startContinuousRecognitionAsync(
          () => {
            timeoutHandle = setTimeout(() => {
              if (!finalText.trim() && recognitionStarted) {
                console.log('Recognition timeout - stopping');
                recognizer.stopContinuousRecognitionAsync();
              }
            }, 10000); // 10 second timeout
          },
          (error) => {
            console.error('Could not start recognition:', error);
            reject(error);
          }
        );
      };

      startRecognition();
    });
  } catch (error) {
    console.error('Error in speech-to-text:', error);
    throw error;
  }
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

/**
 * Converts text to speech using Azure Speech Services
 * @param {string} text - Text to convert to speech
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<ArrayBuffer>} - Synthesized audio data
 */
const textToSpeech = async (text, targetLanguage) => {
  try {
    console.log('Starting text-to-speech conversion...');
    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechSynthesisLanguage = targetLanguage;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    return new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        result => {
          if (result.audioData) {
            console.log('Speech synthesized successfully');
            resolve(result.audioData);
          } else {
            reject(new Error('No audio data generated'));
          }
          synthesizer.close();
        },
        error => {
          console.error('Speech synthesis error:', error);
          synthesizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    console.error('Error in text-to-speech:', error);
    throw error;
  }
};

/**
 * Translates speech from one language to another
 * @param {ArrayBuffer} audioData - Raw audio data
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<{text: {original: string, translated: string}, audio: ArrayBuffer}>} - Translated text and audio
 */
const translateSpeech = async (audioData, sourceLanguage, targetLanguage) => {
  try {
    console.log(`Translating speech from ${sourceLanguage} to ${targetLanguage}...`);

    // Convert speech to text
    const originalText = await speechToText(audioData, sourceLanguage);
    if (!originalText) {
      console.log('No speech detected');
      return null;
    }

    // Translate text
    const translatedText = await translateText(originalText, targetLanguage);
    if (!translatedText) {
      console.log('Translation failed');
      return null;
    }

    // Convert translated text to speech
    const translatedAudio = await textToSpeech(translatedText, targetLanguage);

    return {
      text: {
        original: originalText,
        translated: translatedText
      },
      audio: translatedAudio
    };
  } catch (error) {
    console.error('Error in speech translation:', error);
    throw error;
  }
};

module.exports = {
  speechToText,
  textToSpeech,
  translateSpeech
};