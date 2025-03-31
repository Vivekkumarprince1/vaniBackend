const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Log important configurations on startup
const logConfig = () => {
  console.log('Environment Configuration:');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('PORT:', process.env.PORT || 2000);
  console.log('MongoDB:', process.env.MONGO_URI ? 'Configured' : 'Not Configured');
  console.log('Azure Translator:', process.env.AZURE_TRANSLATOR_KEY ? 'Configured' : 'Not Configured');
  console.log('Azure Speech:', process.env.AZURE_SPEECH_KEY ? 'Configured' : 'Not Configured');
};

// CORS configuration
const getCorsConfig = () => {
  // Define base allowed origins - add any new domains here
  const baseAllowedOrigins = [
    'https://vani-frontend.vercel.app',
    'https://vani.azurewebsites.net',
    'http://localhost:5173', 
    'http://localhost:5174', 
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ];
  
  // Process environment variable with additional origins if defined
  let additionalOrigins = [];
  if (process.env.ALLOWED_ORIGINS) {
    try {
      additionalOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
      console.log('Additional origins:', additionalOrigins);
    } catch (error) {
      console.error('Error parsing ALLOWED_ORIGINS:', error);
    }
  }
  
  // Combine all origins
  const allowedOrigins = [...baseAllowedOrigins, ...additionalOrigins];
  console.log('Allowed origins:', allowedOrigins);

  const corsOptions = {
    origin: (origin, callback) => {
      // In production, we should strictly check origins
      if (process.env.NODE_ENV === 'production') {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`CORS blocked request from origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      } else {
        // In development, we're more permissive
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
  };

  return { allowedOrigins, corsOptions };
};

module.exports = {
  logConfig,
  getCorsConfig,
  PORT: process.env.PORT || 2000
};