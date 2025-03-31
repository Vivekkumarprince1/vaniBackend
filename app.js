const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const { logConfig, getCorsConfig, PORT } = require('./config/server');
const { initializeSocket } = require('./socket');

// Log important configurations on startup
logConfig();

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Get CORS configuration
const { allowedOrigins, corsOptions } = getCorsConfig();

// Initialize Socket.IO
const io = initializeSocket(server, allowedOrigins);

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint to confirm the API is running
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Vani API is running',
    version: '1.0.0',
    endpoints: ['/api/auth', '/api/chat', '/api/translator']
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/translator', require('./routes/translator'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'SERVER_ERROR'
    }
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({ 
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND'
    }
  });
});

// Connect to database and start server
connectDB()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Access it at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application should continue running despite unhandled promise rejections
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Application should continue running despite uncaught exceptions
});

// Only export app for testing or other uses if needed
module.exports = app;