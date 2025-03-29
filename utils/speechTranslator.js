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
    if (!audioData || audioData.length < 44) {
      return {
        error: 'Invalid audio data',
        text: { original: '', translated: '' }
      };
    }

    // Normalize language codes
    sourceLanguage = sourceLanguage.toLowerCase().split('-')[0];
    targetLanguage = targetLanguage.toLowerCase().split('-')[0];

    console.log(`Starting speech translation flow from ${sourceLanguage} to ${targetLanguage}...`);

    // 1. Convert speech to text
    const originalText = await speechToText(audioData, sourceLanguage);
    if (!originalText || !originalText.trim()) {
      return {
        error: 'No speech detected',
        text: { original: '', translated: '' }
      };
    }

    console.log('Speech to text result:', { originalText });

    // 2. Translate text - always translate if languages are different
    let translatedText;
    if (sourceLanguage !== targetLanguage) {
      try {
        translatedText = await translateText(originalText, sourceLanguage, targetLanguage);
        console.log('Translation result:', { translatedText });
        
        if (!translatedText) {
          console.error('Translation returned empty result');
          return {
            error: 'Translation failed - empty result',
            text: { original: originalText, translated: '' }
          };
        }
      } catch (translationError) {
        console.error('Translation error:', translationError);
        return {
          error: `Translation failed: ${translationError.message}`,
          text: { original: originalText, translated: '' }
        };
      }
    } else {
      translatedText = originalText;
    }

    // 3. Convert translated text to speech
    let translatedAudio;
    try {
      translatedAudio = await textToSpeech(translatedText, targetLanguage);
      if (!translatedAudio || translatedAudio.length === 0) {
        throw new Error('Generated audio is empty');
      }
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
    return {
      error: `Speech translation failed: ${error.message || 'Unknown error'}`,
      text: { original: '', translated: '' }
    };
  }
};

// Re-export all functions to maintain the same API 
module.exports = {   speechToText,   textToSpeech,   translateSpeech };