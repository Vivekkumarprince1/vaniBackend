const axios = require('axios');

const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;
const AZURE_TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';

// Get supported languages from Azure Translator
exports.getLanguages = async (req, res) => {
    try {
        const response = await axios.get(`${AZURE_TRANSLATOR_ENDPOINT}/languages?api-version=3.0`, {
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
                'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION
            }
        });

        // Filter and format the languages
        const languages = {};
        Object.entries(response.data.translation).forEach(([code, details]) => {
            languages[code] = {
                name: details.name,
                nativeName: details.nativeName,
                dir: details.dir
            };
        });

        res.json(languages);
    } catch (error) {
        console.error('Error fetching languages from Azure:', error);
        res.status(500).json({ error: 'Failed to fetch languages from Azure Translator' });
    }
};

// Translate text using Azure Translator
exports.translateText = async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;

        if (!text || !targetLanguage) {
            return res.status(400).json({ error: 'Text and target language are required' });
        }

        const response = await axios.post(
            `${AZURE_TRANSLATOR_ENDPOINT}/translate?api-version=3.0&to=${targetLanguage}`,
            [{ text }],
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
                    'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json(response.data[0].translations[0]);
    } catch (error) {
        console.error('Error translating text:', error);
        res.status(500).json({ error: 'Failed to translate text' });
    }
}; 