const { speechToText } = require('./speechToTextModule');
const { textToSpeech } = require('./textToSpeechModule');
const { translateText, translateBatch } = require('./translator');

// Cache frequently used regex patterns
const PUNCTUATION_REGEX = /[.!?]$/;
const VALID_WAV_HEADER = 'RIFF';

// Reusable empty default result object
const DEFAULT_RESULT = Object.freeze({
  text: { original: '', translated: '' },
  audio: null,
  error: null
});

/**
 * Translates speech from one language to another with optimized performance
 * @param {ArrayBuffer|Buffer|string} audioData - Raw audio data (Buffer, ArrayBuffer, or base64 string)
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<{text: {original: string, translated: string}, audio: Buffer|null, error: string|null}>}
 */
const translateSpeech = async (audioData, sourceLanguage, targetLanguage) => {
  // Early validation to fail fast
  if (!audioData) {
    return { ...DEFAULT_RESULT, error: 'Invalid or missing audio data' };
  }

  try {
    // Process inputs in parallel where possible - use Promise.all for better performance
    const [audioBuffer, normalizedSourceLang, normalizedTargetLang] = await Promise.all([
      Promise.resolve(normalizeAudioData(audioData)),
      Promise.resolve(normalizeLanguage(sourceLanguage) || 'en'),
      Promise.resolve(normalizeLanguage(targetLanguage) || 'en')
    ]);

    // Fast-fail checks
    if (!audioBuffer) {
      return { ...DEFAULT_RESULT, error: 'Invalid or missing audio data' };
    }

    if (audioBuffer.length < 100) {
      return { ...DEFAULT_RESULT, error: 'Audio data too small or corrupted' };
    }

    // Skip processing if source and target languages are the same
    const isSameLanguage = normalizedSourceLang === normalizedTargetLang;
    
    // 1. Speech to text - run only once
    const { text: originalText, error: sttError } = await performSpeechToText(audioBuffer, normalizedSourceLang);
    
    if (sttError) {
      return { ...DEFAULT_RESULT, error: sttError };
    }
    
    if (!originalText) {
      return { ...DEFAULT_RESULT, error: 'No speech detected or empty transcription' };
    }

    // Only perform translation if languages differ
    let translatedText = originalText;
    let translationError = null;
    
    if (!isSameLanguage) {
      // 2. Translation
      const translationResult = await performTranslation(originalText, normalizedSourceLang, normalizedTargetLang);
      translatedText = translationResult.text;
      translationError = translationResult.error;
      
      if (translationError) {
        return {
          ...DEFAULT_RESULT,
          text: { original: originalText, translated: '' },
          error: translationError
        };
      }
    } else {
      console.log('Skipping translation (same language)');
    }

    // 3. Text to speech
    const { audio: translatedAudio, error: ttsError } = 
      await performTextToSpeech(translatedText, normalizedTargetLang);
    
    if (ttsError) {
      return {
        ...DEFAULT_RESULT,
        text: { original: originalText, translated: translatedText },
        error: ttsError
      };
    }

    // Success
    return {
      text: { original: originalText, translated: translatedText },
      audio: translatedAudio,
      error: null
    };
  } catch (error) {
    console.error('Unexpected error in speech translation:', error);
    return {
      ...DEFAULT_RESULT,
      error: `Speech translation failed: ${error.message || 'Unknown error'}`
    };
  }
};

/**
 * Batch processes multiple audio files for translation with improved parallelism
 * @param {Array<{audioData: Buffer|ArrayBuffer|string, id: string}>} audioItems 
 * @param {string} sourceLanguage 
 * @param {string} targetLanguage 
 * @returns {Promise<Array<{id: string, result: Object}>>}
 */
const batchTranslateSpeech = async (audioItems, sourceLanguage, targetLanguage) => {
  if (!Array.isArray(audioItems) || audioItems.length === 0) {
    throw new Error('Invalid or empty batch input');
  }

  // Normalize languages once for the entire batch
  const normalizedSourceLang = normalizeLanguage(sourceLanguage) || 'en';
  const normalizedTargetLang = normalizeLanguage(targetLanguage) || 'en';
  const isSameLanguage = normalizedSourceLang === normalizedTargetLang;
  
  // Pre-normalize all audio buffers in parallel
  const normalizedAudioItems = await Promise.all(
    audioItems.map(async item => ({
      id: item.id,
      buffer: await Promise.resolve(normalizeAudioData(item.audioData))
    }))
  );
  
  // Filter valid audio before processing
  const validAudioItems = normalizedAudioItems.filter(item => 
    item.buffer && item.buffer.length >= 100
  );
  
  // Create error results for invalid audio
  const invalidResults = audioItems
    .filter(item => !validAudioItems.some(valid => valid.id === item.id))
    .map(item => ({
      id: item.id,
      result: {
        text: { original: '', translated: '' },
        audio: null,
        error: 'Invalid audio data'
      }
    }));
  
  if (validAudioItems.length === 0) {
    return invalidResults;
  }
  
  // Process all speech-to-text in parallel
  const transcriptionPromises = validAudioItems.map(item => 
    performSpeechToText(item.buffer, normalizedSourceLang)
      .then(result => ({ id: item.id, ...result }))
  );
  
  const transcriptionResults = await Promise.all(transcriptionPromises);
  
  // Filter valid transcriptions for batch translation
  const validTranscriptions = [];
  const transcriptionMap = new Map();
  
  transcriptionResults.forEach(result => {
    if (result.text && !result.error) {
      validTranscriptions.push(result.text);
      transcriptionMap.set(result.text, result.id);
    }
  });
  
  // Create error results for failed transcriptions
  const failedTranscriptionResults = transcriptionResults
    .filter(result => !result.text || result.error)
    .map(result => ({
      id: result.id,
      result: {
        text: { original: result.text || '', translated: '' },
        audio: null,
        error: result.error || 'Transcription failed'
      }
    }));
  
  if (validTranscriptions.length === 0) {
    return [...invalidResults, ...failedTranscriptionResults];
  }
  
  // Skip translation if languages are the same
  let translations = [];
  try {
    if (isSameLanguage) {
      translations = validTranscriptions;
    } else {
      // Batch translate all texts at once - more efficient
      translations = await translateBatch(validTranscriptions, normalizedSourceLang, normalizedTargetLang);
    }
  } catch (error) {
    // If translation fails, return what we have so far
    const results = [...invalidResults, ...failedTranscriptionResults];
    
    // Add translation error results
    validTranscriptions.forEach(original => {
      const id = transcriptionMap.get(original);
      results.push({
        id,
        result: {
          text: { original, translated: '' },
          audio: null,
          error: `Translation failed: ${error.message}`
        }
      });
    });
    
    return results;
  }
  
  // Map original texts to their translations
  const translationMap = new Map();
  validTranscriptions.forEach((original, index) => {
    translationMap.set(transcriptionMap.get(original), { 
      original, 
      translated: translations[index] 
    });
  });
  
  // Process TTS for all translations in parallel with concurrency limit
  // This avoids overwhelming the TTS service
  const CONCURRENCY_LIMIT = 5;
  const ttsResults = new Map();
  
  const processTTSBatch = async (batch) => {
    const promises = batch.map(async id => {
      const texts = translationMap.get(id);
      if (!texts) return { id, audio: null, error: 'Missing translation data' };
      
      const result = await performTextToSpeech(texts.translated, normalizedTargetLang);
      return { id, ...result };
    });
    
    return Promise.all(promises);
  };
  
  // Process TTS in controlled batches
  const ids = Array.from(translationMap.keys());
  for (let i = 0; i < ids.length; i += CONCURRENCY_LIMIT) {
    const batch = ids.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await processTTSBatch(batch);
    
    batchResults.forEach(result => {
      ttsResults.set(result.id, { audio: result.audio, error: result.error });
    });
  }
  
  // Compile final results
  const successResults = Array.from(translationMap.entries()).map(([id, texts]) => {
    const ttsResult = ttsResults.get(id) || { audio: null, error: 'TTS processing failed' };
    
    return {
      id,
      result: {
        text: { original: texts.original, translated: texts.translated },
        audio: ttsResult.audio,
        error: ttsResult.error
      }
    };
  });
  
  return [...invalidResults, ...failedTranscriptionResults, ...successResults];
};

/**
 * Normalizes audio data to Buffer format - optimized with type checking
 * @param {ArrayBuffer|Buffer|string} audioData
 * @returns {Buffer|null}
 */
function normalizeAudioData(audioData) {
  if (!audioData) return null;
  
  try {
    // Direct type checks for performance
    if (audioData instanceof Buffer) {
      return audioData;
    }
    
    if (audioData instanceof ArrayBuffer) {
      return Buffer.from(audioData);
    }
    
    if (typeof audioData === 'string') {
      return Buffer.from(audioData, 'base64');
    }
    
    return null;
  } catch (e) {
    console.error('Error normalizing audio data:', e);
    return null;
  }
}

/**
 * Normalizes language code - optimized with caching
 * @param {string} language
 * @returns {string}
 */
// Use a small cache for language normalization
const langNormalizeCache = new Map();
function normalizeLanguage(language) {
  if (!language || typeof language !== 'string') return '';
  
  // Check cache first
  if (langNormalizeCache.has(language)) {
    return langNormalizeCache.get(language);
  }
  
  const normalized = language.toLowerCase().split('-')[0];
  langNormalizeCache.set(language, normalized);
  return normalized;
}

/**
 * Performs speech-to-text conversion - optimized
 * @param {Buffer} audioBuffer
 * @param {string} language
 * @returns {Promise<{text: string, error: string|null}>}
 */
async function performSpeechToText(audioBuffer, language) {
  try {
    const originalText = await speechToText(audioBuffer, language);
    
    // Fast validation
    if (!originalText || typeof originalText !== 'string') {
      return { text: '', error: 'Speech-to-text returned invalid result' };
    }
    
    const trimmedText = originalText.trim();
    if (!trimmedText) {
      return { text: '', error: 'No speech detected or empty transcription' };
    }
    
    return { text: trimmedText, error: null };
  } catch (error) {
    console.error('Speech-to-text error:', error);
    return {
      text: '',
      error: `Speech-to-text failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Performs text translation - optimized to use batch when appropriate
 * @param {string} text
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {Promise<{text: string, error: string|null}>}
 */
async function performTranslation(text, sourceLanguage, targetLanguage) {
  // Skip translation if languages are the same
  if (sourceLanguage === targetLanguage) {
    return { text, error: null };
  }
  
  try {
    // Check if text contains multiple segments that could benefit from batch translation
    // Use a more efficient split approach
    const segments = text.split(/[.!?]\s+/);
    const validSegments = segments.filter(s => s.trim().length > 0);
    
    let translatedText;
    
    if (validSegments.length > 1 && validSegments.length <= 50) { // Batch translation for multiple segments
      // Ensure proper punctuation for better translation quality
      const segmentsWithPunctuation = validSegments.map(segment => {
        const trimmed = segment.trim();
        return PUNCTUATION_REGEX.test(trimmed) ? trimmed : trimmed + '.';
      });
      
      const translatedSegments = await translateBatch(segmentsWithPunctuation, sourceLanguage, targetLanguage);
      translatedText = translatedSegments.join(' ');
    } else {
      translatedText = await translateText(text, sourceLanguage, targetLanguage);
    }
    
    if (!translatedText || typeof translatedText !== 'string' || !translatedText.trim()) {
      return { text: '', error: 'Translation failed - empty result' };
    }
    
    return { text: translatedText, error: null };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      text: '',
      error: `Translation failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Performs text-to-speech conversion with optimized retry logic
 * @param {string} text
 * @param {string} language
 * @returns {Promise<{audio: Buffer|null, error: string|null}>}
 */
async function performTextToSpeech(text, language) {
  const maxAttempts = 2;
  let lastError = null;
  
  // Ensure text ends with punctuation for better TTS results - using cached regex
  if (text.length > 0 && !PUNCTUATION_REGEX.test(text)) {
    text += '.';
  }
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const audio = await textToSpeech(text, language);
      
      // Quick validation
      if (!audio || !(audio instanceof Buffer) || audio.length < 44) {
        throw new Error(`Generated audio invalid or too small: ${audio?.length || 0} bytes`);
      }
      
      // Verify and fix WAV header if needed - only if necessary
      const validatedAudio = audio.slice(0, 4).toString('ascii') !== VALID_WAV_HEADER
        ? validateAudioFormat(audio)
        : audio;
      
      return { audio: validatedAudio, error: null };
    } catch (error) {
      console.error(`Text-to-speech attempt ${attempt + 1} failed:`, error);
      lastError = error;
      
      if (attempt < maxAttempts - 1) {
        // Wait before retry using a more efficient setTimeout approach
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  return {
    audio: null,
    error: `Failed to convert text to speech after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
  };
}

/**
 * Validates and fixes audio format if needed - optimized with precomputed values
 * @param {Buffer} audioBuffer
 * @returns {Buffer}
 */
// Precomputed constants for WAV header
const WAV_SAMPLE_RATE = 16000; // 16kHz
const WAV_NUM_CHANNELS = 1; // Mono
const WAV_BITS_PER_SAMPLE = 16; // 16-bit PCM
const WAV_BYTE_RATE = WAV_SAMPLE_RATE * WAV_NUM_CHANNELS * WAV_BITS_PER_SAMPLE / 8;
const WAV_BLOCK_ALIGN = WAV_NUM_CHANNELS * WAV_BITS_PER_SAMPLE / 8;

function validateAudioFormat(audioBuffer) {
  // Check for valid WAV header using the cached constant
  const header = audioBuffer.slice(0, 4).toString('ascii');
  if (header === VALID_WAV_HEADER) {
    return audioBuffer; // Already valid
  }
  
  // Create a minimal WAV header using precomputed constants
  const wavHeader = Buffer.alloc(44);
  
  // Write header data - direct byte operations are faster
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + audioBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(WAV_NUM_CHANNELS, 22);
  wavHeader.writeUInt32LE(WAV_SAMPLE_RATE, 24);
  wavHeader.writeUInt32LE(WAV_BYTE_RATE, 28);
  wavHeader.writeUInt16LE(WAV_BLOCK_ALIGN, 32);
  wavHeader.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(audioBuffer.length, 40);
  
  return Buffer.concat([wavHeader, audioBuffer]);
}

module.exports = {
  translateSpeech,
  batchTranslateSpeech,
  // Export internal functions for testing
  _internal: {
    normalizeAudioData,
    normalizeLanguage,
    performSpeechToText,
    performTranslation,
    performTextToSpeech,
    validateAudioFormat
  }
};