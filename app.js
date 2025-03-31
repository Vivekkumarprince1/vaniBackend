const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const { logConfig, getCorsConfig, PORT } = require('./config/server');
const { initializeSocket } = require('./socket');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const { runHealthCheck } = require('./utils/healthCheck');

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Production optimizations
if (process.env.NODE_ENV === 'production') {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  
  // Compression
  app.use(compression());
  
  // Cache static assets
  app.use(express.static('public', {
    maxAge: '1d',
    etag: true
  }));
}

// Add request logging in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/translator', require('./routes/translator'));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const healthStatus = await runHealthCheck();
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'production' ? null : error.message 
    });
  }
});

// Simple status endpoint (for load balancers)
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? null : err.message
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found' });
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
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Let current requests finish, but don't accept new ones
  server.close(() => {
    process.exit(1);
  });
  // Force exit after 30 seconds if graceful shutdown fails
  setTimeout(() => {
    process.exit(1);
  }, 30000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Continue running - but log the issue
});

// Only export app for testing or other uses if needed
module.exports = app;