/**
 * Health Check Utility for Vani Backend
 * 
 * This script monitors the health of essential backend services
 * and dependencies. It can be run as a standalone script or
 * integrated into the API to report system status.
 */

const mongoose = require('mongoose');
const axios = require('axios');
const os = require('os');

/**
 * Check MongoDB connection status
 * @returns {Promise<Object>} Connection status object
 */
const checkMongoDB = async () => {
  try {
    const status = mongoose.connection.readyState;
    const statusMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      status: status === 1 ? 'healthy' : 'unhealthy',
      state: statusMap[status] || 'unknown',
      error: null
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      state: 'error',
      error: error.message
    };
  }
};

/**
 * Check Azure Translator service status
 * @returns {Promise<Object>} Service status object
 */
const checkAzureTranslator = async () => {
  try {
    // Simple check to see if credentials are configured
    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;
    
    if (!key || !region) {
      return {
        status: 'unhealthy',
        state: 'not_configured',
        error: 'Translator credentials not configured'
      };
    }
    
    // Optional: Make a test API call to verify connection
    // This is commented out to avoid unnecessary API charges during health checks
    /*
    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
    const response = await axios.post(
      `${endpoint}/translate`,
      [{ text: 'hello' }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json'
        },
        params: {
          'api-version': '3.0',
          'to': 'es'
        }
      }
    );
    
    return {
      status: response.status === 200 ? 'healthy' : 'unhealthy',
      state: 'connected',
      error: null
    };
    */
    
    return {
      status: 'healthy',
      state: 'configured',
      error: null
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      state: 'error',
      error: error.message
    };
  }
};

/**
 * Check system resources
 * @returns {Object} System resource status
 */
const checkSystemResources = () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
  
  return {
    status: usedMemoryPercent < 90 ? 'healthy' : 'warning',
    cpuLoad: os.loadavg(),
    memory: {
      total: Math.round(totalMemory / (1024 * 1024 * 1024) * 100) / 100 + ' GB',
      free: Math.round(freeMemory / (1024 * 1024 * 1024) * 100) / 100 + ' GB',
      usedPercent: Math.round(usedMemoryPercent * 100) / 100 + '%'
    },
    uptime: Math.round(os.uptime() / 3600) + ' hours'
  };
};

/**
 * Run all health checks
 * @returns {Promise<Object>} Complete health status
 */
const runHealthCheck = async () => {
  const mongoStatus = await checkMongoDB();
  const translatorStatus = await checkAzureTranslator();
  const systemStatus = checkSystemResources();
  
  // Overall status is healthy only if all checks are healthy
  const overallStatus = 
    mongoStatus.status === 'healthy' && 
    translatorStatus.status === 'healthy' && 
    systemStatus.status !== 'unhealthy'
      ? 'healthy'
      : 'unhealthy';
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    services: {
      mongodb: mongoStatus,
      translator: translatorStatus,
      system: systemStatus
    }
  };
};

// If run directly as a script
if (require.main === module) {
  // Load env variables
  require('dotenv').config();
  
  // Connect to MongoDB for testing
  const connectDB = require('../config/db');
  
  connectDB()
    .then(async () => {
      const healthStatus = await runHealthCheck();
      console.log(JSON.stringify(healthStatus, null, 2));
      
      // Exit with appropriate code
      process.exit(healthStatus.status === 'healthy' ? 0 : 1);
    })
    .catch(err => {
      console.error('Health check failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runHealthCheck,
  checkMongoDB,
  checkAzureTranslator,
  checkSystemResources
}; 