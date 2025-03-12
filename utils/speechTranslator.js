const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { translateText } = require('./translator');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

/**
 * Converts speech to text using Azure Speech Services
 * @param {ArrayBuffer} audioData - Raw audio data
 * @param {string} sourceLanguage - Source language code
 * @returns {Promise<string>} - Transcribed text
 */
const speechToText = async (audioData, sourceLanguage) => {
  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechRecognitionLanguage = sourceLanguage;

    // Create push audio input stream
    const pushStream = sdk.AudioInputStream.createPushStream();
    
    // Push audio data to the stream
    pushStream.write(audioData);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        result => {
          if (result.text) {
            resolve(result.text);
          } else {
            resolve(''); // Return empty string if no speech detected
          }
          recognizer.close();
        },
        error => {
          console.error('Speech recognition error:', error);
          recognizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    console.error('Error in speech-to-text:', error);
    throw error;
  }
};

/**
 * Converts text to speech using Azure Speech Services
 * @param {string} text - Text to convert to speech
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<ArrayBuffer>} - Synthesized audio data
 */
const textToSpeech = async (text, targetLanguage) => {
  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechSynthesisLanguage = targetLanguage;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    return new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        result => {
          if (result.audioData) {
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
    // Convert speech to text
    const originalText = await speechToText(audioData, sourceLanguage);
    if (!originalText) return null;

    // Translate text
    const translatedText = await translateText(originalText, targetLanguage);
    if (!translatedText) return null;

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