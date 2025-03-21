const { speechToText } = require('./speechToTextModule');
const { textToSpeech } = require('./textToSpeechModule');
const { translateText } = require('./translator');

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

    // Convert speech to text with built-in retry mechanism
    const originalText = await speechToText(audioData, sourceLanguage);
    if (!originalText) {
      console.log('No speech detected or recognition failed');
      return {
        error: 'No speech detected or recognition failed',
        text: {
          original: '',
          translated: ''
        }
      };
    }

    // Skip translation if source and target languages are the same
    if (sourceLanguage === targetLanguage) {
      console.log('Source and target languages are the same, skipping translation');
      
      // Convert text to speech directly
      const audio = await textToSpeech(originalText, targetLanguage);
      
      return {
        text: {
          original: originalText,
          translated: originalText // Same as original
        },
        audio: audio
      };
    }

    // Translate text
    let translatedText;
    try {
      translatedText = await translateText(originalText, targetLanguage);
      if (!translatedText) {
        console.log('Translation returned empty result, using original text');
        translatedText = originalText;
      }
    } catch (translationError) {
      console.error('Translation error:', translationError);
      // Fall back to original text if translation fails
      translatedText = originalText;
    }

    // Convert translated text to speech
    let translatedAudio;
    try {
      translatedAudio = await textToSpeech(translatedText, targetLanguage);
    } catch (speechError) {
      console.error('Text-to-speech error:', speechError);
      return {
        error: 'Failed to convert translated text to speech',
        text: {
          original: originalText,
          translated: translatedText
        }
      };
    }

    return {
      text: {
        original: originalText,
        translated: translatedText
      },
      audio: translatedAudio
    };
  } catch (error) {
    console.error('Error in speech translation:', error);
    // Return a structured error response instead of throwing
    return {
      error: `Speech translation failed: ${error.message || 'Unknown error'}`,
      text: {
        original: '',
        translated: ''
      }
    };
  }
};

// Re-export all functions to maintain the same API 
module.exports = {   speechToText,   textToSpeech,   translateSpeech };