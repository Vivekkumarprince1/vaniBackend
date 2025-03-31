const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Set up mongoose connection options
    const options = {
      serverSelectionTimeoutMS: 30000, // Timeout after 30 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4 // Use IPv4, skip trying IPv6
    };

    // Attempt to connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, options);
    
    console.log('MongoDB connected successfully');
    
    // Add event listeners for connection issues
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected successfully');
    });
    
    // Handle application termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
    
  } catch (err) {
    console.error('MongoDB connection error:', err);
    // Don't exit the process, let it retry if possible
    console.log('Will attempt to reconnect to MongoDB...');
  }
};

module.exports = connectDB;