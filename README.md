# Vani Backend

Backend API and WebSocket server for the Vani chat application with real-time translation.

## Environment Setup

Create a `.env` file with the following variables:

```
# Azure Translator Configuration
AZURE_TRANSLATOR_KEY=your_azure_translator_key
AZURE_TRANSLATOR_REGION=your_region
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com/

# Microsoft Azure Speech to Text Configuration
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_region
AZURE_SPEECH_ENDPOINT=https://your_region.api.cognitive.microsoft.com/sts/v1.0/issuetoken

# Database and Authentication
JWT_SECRET=your_jwt_secret
PORT=2000
MONGO_URI=your_mongodb_connection_string
```

## Deployment Instructions

### Vercel Deployment

1. Make sure you have the Vercel CLI installed:
   ```
   npm install -g vercel
   ```

2. Add environment variables in the Vercel dashboard or via CLI:
   ```
   vercel secrets add jwt-secret your_jwt_secret
   vercel secrets add mongodb-uri your_mongodb_uri
   ```

3. Deploy to Vercel:
   ```
   vercel --prod
   ```

4. After deployment, update the frontend environment variable `VITE_API_URL` to point to your Vercel deployment URL.

### Azure Web App Deployment

1. Create an Azure Web App for Node.js.

2. Set up deployment from GitHub or use Azure CLI to deploy.

3. Configure the following Application Settings in Azure:
   - NODE_ENV: production
   - All the secrets listed in the .env file

4. Enable Web Sockets in the Configuration settings.

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

## Production Build

Start the server in production mode:
```
npm start
```

## Troubleshooting

### CORS Issues
- Check the CORS configuration in `config/server.js`
- Ensure all frontend origins are listed

### Socket Connection Issues
- Verify the WebSocket connections are enabled in your hosting provider
- Check authentication token is being passed correctly
- Check network for any firewall blocking WebSocket connections

### Database Connection Issues
- Verify MongoDB connection string and credentials
- Check network connectivity to the database server

## Health Check

Access `/health` endpoint to verify the server is running properly.

## API Documentation

The main API endpoints are:
- `/api/auth` - Authentication endpoints
- `/api/chat` - Chat related endpoints
- `/api/translator` - Translation services 