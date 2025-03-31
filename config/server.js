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
  const allowedOrigins = [
    // Production domains
    'https://vani-frontend.vercel.app',
    'https://vani.azurewebsites.net',
    'https://vani-frontend.vercel.app',
    // Development domains
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:2000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:2000'
  ];

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl requests)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('Origin rejected by CORS policy:', origin);
        console.log('Allowed origins:', allowedOrigins);
        callback(null, true); // Temporarily allow all origins in case of misconfiguration
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