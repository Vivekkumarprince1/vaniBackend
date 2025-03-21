// const mongoose = require('mongoose');
// const dotenv = require('dotenv');
// const User = require('../models/User');

// // Load environment variables
// dotenv.config();

// const fixEmailIndex = async () => {
//   try {
//     // Connect to MongoDB
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log('Connected to MongoDB');

//     // Get the User model's collection
//     const collection = User.collection;

//     // Drop the existing email index
//     try {
//       await collection.dropIndex('email_1');
//       console.log('Dropped existing email index');
//     } catch (err) {
//       console.log('No existing email index to drop');
//     }

//     // Create new sparse index
//     await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
//     console.log('Created new sparse index on email field');

//     // Update any existing null email values to undefined
//     const result = await collection.updateMany(
//       { email: null },
//       { $unset: { email: "" } }
//     );
//     console.log(`Updated ${result.modifiedCount} documents with null email values`);

//     console.log('Email index fix completed successfully');
//     process.exit(0);
//   } catch (err) {
//     console.error('Error fixing email index:', err);
//     process.exit(1);
//   }
// };

// // Run the fix
// fixEmailIndex(); 