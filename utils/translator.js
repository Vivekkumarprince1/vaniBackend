const axios = require('axios');
const dotenv = require('dotenv');
// Load environment variables once during initialization
dotenv.config();

// Azure Translator configuration - store in constants to avoid repeatedly accessing process.env
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;
const TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';

// Create a reusable axios instance with common configuration
const translatorClient = axios.create({
  baseURL: TRANSLATOR_ENDPOINT,
  headers: {
    'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
    'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
    'Content-type': 'application/json',
  },
  // Add reasonable timeouts to prevent hanging requests
  timeout: 10000
});

// Cache translation results for identical requests
const translationCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const CACHE_MAX_SIZE = 1000; // Maximum cache entries

/**
 * Clears expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, { timestamp }] of translationCache.entries()) {
    if (now - timestamp > CACHE_TTL) {
      translationCache.delete(key);
    }
  }
}

// Schedule periodic cache cleaning
setInterval(cleanCache, CACHE_TTL);

/**
 * Generate cache key for translation requests
 */
function getCacheKey(text, sourceLanguage, targetLanguage) {
  return `${sourceLanguage}:${targetLanguage}:${text}`;
}

/**
 * Manages the cache size by removing oldest entries when needed
 */
function ensureCacheSize() {
  if (translationCache.size > CACHE_MAX_SIZE) {
    // Convert to array to sort by timestamp
    const entries = Array.from(translationCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 10% of entries
    const removeCount = Math.ceil(CACHE_MAX_SIZE * 0.1);
    for (let i = 0; i < removeCount && i < entries.length; i++) {
      translationCache.delete(entries[i][0]);
    }
  }
}

/**
 * Validates if translation is required (returns original if same language)
 */
function validateTranslationRequest(text, sourceLanguage, targetLanguage) {
  // Skip translation if source and target languages are the same
  if (sourceLanguage === targetLanguage) {
    return text;
  }
  
  // Skip translation for empty text
  if (!text || text.trim().length === 0) {
    return text;
  }
  
  return null; // Indicates translation is needed
}

/**
 * Translates text from source language to target language
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} - Translated text
 */
const translateText = async (text, sourceLanguage, targetLanguage) => {
  // Validate required configuration early to fail fast
  if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_REGION) {
    throw new Error('Azure Translator credentials not configured');
  }
  
  // Early return for cases where translation isn't needed
  const skipResult = validateTranslationRequest(text, sourceLanguage, targetLanguage);
  if (skipResult !== null) {
    return skipResult;
  }
  
  // Check cache first
  const cacheKey = getCacheKey(text, sourceLanguage, targetLanguage);
  if (translationCache.has(cacheKey)) {
    const { result, timestamp } = translationCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log('Translation cache hit');
      return result;
    }
    // Expired cache entry
    translationCache.delete(cacheKey);
  }
  
  try {
    // For very short texts, use a simpler request structure
    const payload = [{ text }];
    
    const response = await translatorClient.post('/translate', 
      payload,
      {
        params: {
          'api-version': '3.0',
          'from': sourceLanguage,
          'to': targetLanguage
        }
      }
    );
    
    // Use optional chaining for more concise error handling
    const result = response.data?.[0]?.translations?.[0]?.text;
    if (!result) {
      throw new Error('Invalid translation response');
    }
    
    // Cache the result
    translationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    ensureCacheSize();
    
    return result;
  } catch (error) {
    // Handle rate limiting specially with backoff
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 1;
      console.log(`Rate limited, retrying after ${retryAfter} seconds`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return translateText(text, sourceLanguage, targetLanguage);
    }
    
    // Improved error handling with more useful error information
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error('Translation error:', errorMessage);
    throw new Error(`Translation failed: ${errorMessage}`);
  }
};

/**
 * Batch translates multiple texts at once
 * @param {string[]} texts - Array of texts to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string[]>} - Array of translated texts
 */
const translateBatch = async (texts, sourceLanguage, targetLanguage) => {
  if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_REGION) {
    throw new Error('Azure Translator credentials not configured');
  }
  
  // Early return for same languages
  if (sourceLanguage === targetLanguage) {
    return texts;
  }
  
  // Filter out empty texts and prepare cache lookups
  const textsToTranslate = [];
  const cacheResults = [];
  const indices = [];
  
  texts.forEach((text, i) => {
    if (!text || text.trim().length === 0) {
      cacheResults[i] = text;
      return;
    }
    
    const cacheKey = getCacheKey(text, sourceLanguage, targetLanguage);
    if (translationCache.has(cacheKey)) {
      const { result, timestamp } = translationCache.get(cacheKey);
      if (Date.now() - timestamp < CACHE_TTL) {
        cacheResults[i] = result;
        return;
      }
      translationCache.delete(cacheKey);
    }
    
    textsToTranslate.push(text);
    indices.push(i);
  });
  
  // If all texts were cached or empty, return early
  if (textsToTranslate.length === 0) {
    return cacheResults;
  }
  
  try {
    // Prepare payload - optimized data structure
    const data = textsToTranslate.map(text => ({ text }));
    
    // Split into chunks if needed (API typically has size limits)
    const MAX_BATCH_SIZE = 100;
    const results = [];
    
    for (let i = 0; i < data.length; i += MAX_BATCH_SIZE) {
      const chunk = data.slice(i, i + MAX_BATCH_SIZE);
      
      const response = await translatorClient.post('/translate',
        chunk,
        {
          params: {
            'api-version': '3.0',
            'from': sourceLanguage,
            'to': targetLanguage
          }
        }
      );
      
      const translations = response.data.map(item => item.translations[0].text);
      results.push(...translations);
      
      // Cache each translation
      chunk.forEach((item, idx) => {
        const cacheKey = getCacheKey(item.text, sourceLanguage, targetLanguage);
        translationCache.set(cacheKey, {
          result: translations[idx],
          timestamp: Date.now()
        });
      });
    }
    
    // Ensure cache doesn't grow too large
    ensureCacheSize();
    
    // Reconstruct the original array with translations
    const finalResults = [...cacheResults];
    indices.forEach((originalIndex, resultIndex) => {
      finalResults[originalIndex] = results[resultIndex];
    });
    
    return finalResults;
  } catch (error) {
    // Handle rate limiting specially
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 1;
      console.log(`Rate limited, retrying after ${retryAfter} seconds`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return translateBatch(texts, sourceLanguage, targetLanguage);
    }
    
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error('Batch translation error:', errorMessage);
    throw new Error(`Batch translation failed: ${errorMessage}`);
  }
};

module.exports = { translateText, translateBatch };