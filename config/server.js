const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Log important configurations on startup
const logConfig = () => {
  console.log('Environment Configuration:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);
};

// CORS configuration
const getCorsConfig = () => {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://vani.vercel.app', 'https://vani-git-main-vivekkumar.vercel.app', 'https://vani-eccnebbaapfcduav.centralindia-01.azurewebsites.net'] 
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:2000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:2000'];

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error('Origin not allowed:', origin);
        callback(new Error('Not allowed by CORS'));
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