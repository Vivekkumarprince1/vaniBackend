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
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Add WebRTC specific headers
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add a health check endpoint for Azure
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Add a socket.io test endpoint
app.get('/api/socket-test', (req, res) => {
  res.json({
    socketConnections: io.engine?.clientsCount || 0,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/translator', require('./routes/translator'));

// Connect to database and start server
connectDB()
  .then(() => {
    server.listen(PORT,'0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Access it at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
  });

// Only export app for testing or other uses if needed
module.exports = app;