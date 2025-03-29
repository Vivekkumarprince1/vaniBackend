const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Azure Translator configuration
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;
const TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';

/**
 * Translates text from source language to target language
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} - Translated text
 */
const translateText = async (text, sourceLanguage, targetLanguage) => {
  try {
    if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_REGION) {
      throw new Error('Azure Translator credentials not configured');
    }

    const response = await axios({
      baseURL: TRANSLATOR_ENDPOINT,
      url: '/translate',
      method: 'post',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
        'Content-type': 'application/json',
      },
      params: {
        'api-version': '3.0',
        'from': sourceLanguage,
        'to': targetLanguage
      },
      data: [{
        'text': text
      }],
    });

    if (response.data && response.data[0] && response.data[0].translations && response.data[0].translations[0]) {
      return response.data[0].translations[0].text;
    } else {
      throw new Error('Invalid translation response');
    }
  } catch (error) {
    console.error('Translation error:', error.response?.data || error.message);
    throw new Error(`Translation failed: ${error.message}`);
  }
};

module.exports = { translateText };
