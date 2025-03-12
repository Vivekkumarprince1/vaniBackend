const { translateText, getSupportedLanguages } = require('./utils/translator');

// Test translation functionality
const testTranslation = async () => {
  try {
    console.log('Supported languages:', getSupportedLanguages());
    
    const textToTranslate = "Hello, how are you today?";
    console.log(`\nOriginal text: "${textToTranslate}"`);
    
    // Try translating to a few different languages
    const languages = ['es', 'fr', 'hi', 'de'];
    
    for (const lang of languages) {
      console.log(`\nTranslating to ${lang}...`);
      try {
        const translatedText = await translateText(textToTranslate, lang);
        console.log(`Translated text: "${translatedText}"`);
      } catch (err) {
        console.error(`Error translating to ${lang}:`, err.message || err);
      }
    }
    
    // Test error handling with undefined text
    console.log('\nTesting with undefined text:');
    const undefinedResult = await translateText(undefined, 'es');
    console.log(`Result: "${undefinedResult}"`);
    
    // Test with empty text
    console.log('\nTesting with empty text:');
    const emptyResult = await translateText('', 'es');
    console.log(`Result: "${emptyResult}"`);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Run the test
testTranslation(); 