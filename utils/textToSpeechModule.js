const sdk = require('microsoft-cognitiveservices-speech-sdk');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT || `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;

// Log configuration on startup (with masked key for security)
console.log('Azure Speech Service Configuration (Text-to-Speech):');
console.log('Region:', SPEECH_REGION);
console.log('Endpoint:', SPEECH_ENDPOINT);
console.log('Key:', SPEECH_KEY ? '****' + SPEECH_KEY.slice(-4) : 'Not configured');

// Validate credentials
if (!SPEECH_KEY || !SPEECH_REGION) {
  console.error('Azure Speech Service credentials not configured!');
}

// Updated language to voice mapping with more voices
const voiceMap = {
  'en': 'en-US-JennyNeural',
  'hi': 'hi-IN-SwaraNeural',
  'es': 'es-ES-ElviraNeural',
  'fr': 'fr-FR-DeniseNeural',
  'de': 'de-DE-KatjaNeural',
  'it': 'it-IT-ElsaNeural',
  'ja': 'ja-JP-NanamiNeural',
  'ko': 'ko-KR-SunHiNeural',
  'pt': 'pt-BR-FranciscaNeural',
  'ru': 'ru-RU-SvetlanaNeural',
  'zh': 'zh-CN-XiaoxiaoNeural',
  'ar': 'ar-SA-ZariyahNeural',
  'cs': 'cs-CZ-VlastaNeural',
  'da': 'da-DK-ChristelNeural',
  'nl': 'nl-NL-ColetteNeural',
  'fi': 'fi-FI-NooraNeural',
  'el': 'el-GR-AthinaNeural',
  'he': 'he-IL-HilaNeural',
  'hu': 'hu-HU-NoemiNeural',
  'id': 'id-ID-GadisNeural',
  'ms': 'ms-MY-YasminNeural',
  'nb': 'nb-NO-IselinNeural',
  'pl': 'pl-PL-ZofiaNeural',
  'ro': 'ro-RO-AlinaNeural',
  'sk': 'sk-SK-ViktoriaNeural',
  'sl': 'sl-SI-PetraNeural',
  'sv': 'sv-SE-SofieNeural',
  'ta': 'ta-IN-PallaviNeural',
  'te': 'te-IN-ShrutiNeural',
  'th': 'th-TH-AcharaNeural',
  'tr': 'tr-TR-EmelNeural',
  'uk': 'uk-UA-PolinaNeural',
  'vi': 'vi-VN-HoaiMyNeural',
  'af': 'af-ZA-AdriNeural',
  'bg': 'bg-BG-KalinaNeural',
  'fil': 'fil-PH-BlessicaNeural',
  'ca': 'ca-ES-AlbaNeural',
  'cy': 'cy-GB-NiaNeural'
};

/**
 * Get voice name based on language code
 * @param {string} languageCode - Language code
 * @returns {string|null} - Corresponding voice name or null if not found
 */
const getVoiceFromLanguage = (languageCode) => {
  if (!languageCode) return null;
  
  // Extract the first part of the language code (e.g., 'en' from 'en-US')
  const code = languageCode.toLowerCase().split('-')[0];
  return voiceMap[code] || null;
};

/**
 * Testing the Azure Speech Service connection
 * Returns true if connection is successful, false otherwise
 */
const testAzureSpeechConnection = async () => {
  try {
    if (!SPEECH_KEY || !SPEECH_REGION) {
      console.error('Azure Speech Service credentials not configured for connection test');
      return false;
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';
    
    // Create a simple test synthesizer
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    
    // Test with a very short text
    const result = await new Promise((resolve, reject) => {
      synthesizer.speakTextAsync('Test', 
        result => {
          synthesizer.close();
          resolve(result);
        },
        error => {
          synthesizer.close();
          reject(error);
        }
      );
    });
    
    return result && result.reason === sdk.ResultReason.SynthesizingAudioCompleted;
  } catch (error) {
    console.error('Azure Speech Service connection test failed:', error);
    return false;
  }
};

/**
 * Converts text to speech using Azure Speech Services
 * @param {string} text - Text to convert to speech
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<ArrayBuffer>} - Synthesized audio data
 */
const textToSpeech = async (text, targetLanguage, maxRetries = 3) => {
  // Input validation and normalization
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid or empty text input');
  }
  
  // Ensure text has meaningful content
  text = text.trim();
  if (text.length === 0) {
    throw new Error('Empty text input');
  }
  
  // For very short inputs, add a period to ensure proper synthesis
  if (text.length < 3 && !text.endsWith('.')) {
    text = text + '.';
  }

  let attempts = 0;
  let lastError = null;

  // Pre-test Azure connection if this is the first attempt
  if (attempts === 0) {
    try {
      const connectionOk = await testAzureSpeechConnection();
      if (!connectionOk) {
        console.warn('Azure Speech Service connection test failed before synthesis');
      } else {
        console.log('Azure Speech Service connection test successful');
      }
    } catch (error) {
      console.error('Error testing Azure connection:', error);
    }
  }

  while (attempts < maxRetries) {
    try {
      console.log(`Text-to-speech attempt ${attempts + 1}/${maxRetries}:`, {
        targetLanguage,
        textLength: text.length,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : '')  // Log first 50 chars
      });

      if (!SPEECH_KEY || !SPEECH_REGION) {
        throw new Error('Azure Speech Service credentials not configured');
      }

      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      
      // Explicitly use the global endpoint to avoid region-specific issues
      speechConfig.setServiceProperty(
        "endpoint", 
        SPEECH_ENDPOINT,
        sdk.ServicePropertyChannel.UriQueryParameter
      );
      
      // Standardize the target language code (to support both 'en' and 'en-US' formats)
      const standardizedLanguage = targetLanguage || 'en-US';
      const voiceName = getVoiceFromLanguage(standardizedLanguage);
      
      if (!voiceName) {
        console.warn(`No voice found for language: ${standardizedLanguage}, falling back to English`);
        speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';
      } else {
        speechConfig.speechSynthesisVoiceName = voiceName;
      }
      
      // Set audio format to WAV (more reliable)
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;
      
      // Create temp file with unique name in the OS temp directory
      const tempDir = os.tmpdir();
      const tempFileName = path.join(tempDir, `tts_temp_${Date.now()}.wav`);
      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(tempFileName);
      
      // Create synthesizer
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          synthesizer.close();
          reject(new Error('Text-to-speech operation timed out'));
        }, 30000);

        // Determine the SSML language code
        const ssmlLangCode = standardizedLanguage.includes('-') ? 
                           standardizedLanguage : 
                           (standardizedLanguage + '-' + standardizedLanguage.toUpperCase());

        // Use simpler SSML for better compatibility
        const ssml = `
          <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${ssmlLangCode}">
            <voice name="${speechConfig.speechSynthesisVoiceName}">
              ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </voice>
          </speak>
        `;

        // Log SSML for debugging
        console.log('Using SSML:', ssml.trim());
        
        // Register listeners for detailed diagnostics
        synthesizer.synthesisStarted = (s, e) => {
          console.log('Synthesis started:', e);
        };
        
        synthesizer.synthesizing = (s, e) => {
          console.log('Synthesizing...', e?.audioLength || 0, 'bytes processed');
        };
        
        synthesizer.synthesisCompleted = (s, e) => {
          console.log('Synthesis completed:', e?.audioLength || 0, 'bytes total');
        };

        synthesizer.speakSsmlAsync(
          ssml,
          result => {
            clearTimeout(timeoutId);
            
            if (result) {
              console.log('Synthesis result:', {
                resultId: result.resultId,
                reason: result.reason,
                resultReason: sdk.ResultReason[result.reason],
                audioLength: result.audioData?.length || 0,
                state: result.privResult?.privSynthesisStatus
              });
            }

            synthesizer.close();

            // Read the audio file that was just created
            try {
              if (fs.existsSync(tempFileName)) {
                const stats = fs.statSync(tempFileName);
                console.log(`Temp file created: ${tempFileName}, size: ${stats.size} bytes`);
                
                if (stats.size === 0) {
                  fs.unlinkSync(tempFileName);
                  reject(new Error('Generated audio file is empty (0 bytes)'));
                  return;
                }
                
                const audioData = fs.readFileSync(tempFileName);
                console.log(`Audio synthesized successfully: ${audioData.length} bytes`);
                
                // Clean up the temporary file
                fs.unlinkSync(tempFileName);
                
                // Only resolve if we actually have audio data
                if (audioData && audioData.length > 0) {
                  resolve(audioData);
                } else {
                  reject(new Error('Generated audio data is empty after reading file'));
                }
              } else {
                console.error('Audio file was not created:', tempFileName);
                reject(new Error(`Audio file was not created at ${tempFileName}`));
              }
            } catch (fileError) {
              console.error('Error reading audio file:', fileError);
              reject(fileError);
            }
          },
          error => {
            clearTimeout(timeoutId);
            console.error('Synthesis error details:', {
              name: error.name,
              message: error.message,
              code: error.code,
              details: error.details
            });
            synthesizer.close();
            
            // Try to clean up temp file if it exists
            try {
              if (fs.existsSync(tempFileName)) {
                fs.unlinkSync(tempFileName);
              }
            } catch (e) {
              console.error('Error cleaning up temp file:', e);
            }
            
            reject(error);
          }
        );
      });

    } catch (error) {
      console.error(`Attempt ${attempts + 1} failed:`, {
        error: error.message,
        name: error.name,
        code: error.code,
        details: error.details
      });
      lastError = error;
      attempts++;

      if (attempts < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 8000);
        console.log(`Retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        throw lastError || new Error('Text-to-speech failed after multiple attempts');
      }     
    }
  }
};

module.exports = {
  textToSpeech,
  testAzureSpeechConnection
};