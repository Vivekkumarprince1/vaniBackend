const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Azure Translator configuration
const AZURE_TRANSLATOR_ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;

// Log configuration on startup
// console.log('Azure Translator Configuration:');
// console.log('Endpoint:', AZURE_TRANSLATOR_ENDPOINT);
// console.log('Region:', AZURE_TRANSLATOR_REGION);
// console.log('Key:', AZURE_TRANSLATOR_KEY ? '****' + AZURE_TRANSLATOR_KEY.slice(-4) : 'Not configured');

/**
 * Translates text to target language using Azure Translator
 * @param {string} text - Text to translate 
 * @param {string} targetLang - Target language code
 * @returns {Promise<string>} - Translated text
 */
const translateMessageText = async (text, targetLang) => {
  try {
    // Check if text is undefined or null
    if (!text) {
      return '';
    }
    
    // Skip translation if target language is English or if text is empty
    if (targetLang === 'en' || !text.trim()) {
      return text;
    }

    // Check if required credentials are available
    if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_REGION) {
      console.error('Azure Translator credentials not configured:', {
        key: AZURE_TRANSLATOR_KEY ? 'Present' : 'Missing',
        region: AZURE_TRANSLATOR_REGION ? 'Present' : 'Missing'
      });
      return text;
    }

    // Perform the translation
    const response = await axios({
      baseURL: AZURE_TRANSLATOR_ENDPOINT,
      url: '/translate',
      method: 'post',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
        'Content-type': 'application/json'
      },
      params: {
        'api-version': '3.0',
        'to': targetLang
      },
      data: [{
        'text': text
      }]
    });

    if (response.status === 401) {
      console.error('Authentication failed with Azure Translator. Please check your API key and region.');
      console.error('Request details:', {
        endpoint: AZURE_TRANSLATOR_ENDPOINT,
        region: AZURE_TRANSLATOR_REGION,
        keyLength: AZURE_TRANSLATOR_KEY ? AZURE_TRANSLATOR_KEY.length : 0
      });
      return text;
    }

    if (response.status !== 200) {
      console.error('Translation failed:', response.status, response.statusText);
      if (response.data && response.data.error) {
        console.error('Error details:', response.data.error);
      }
      return text;
    }

    const translation = response.data[0].translations[0].text;
    console.log(`Translated to ${targetLang}: "${translation}"`);
    return translation;

  } catch (error) {
    console.error('Translation error:', error.message || error);
    if (error.response) {
      console.error('Error details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    // Return original text if translation fails
    return text || '';
  }
};

module.exports = {
  translateMessageText
}; 