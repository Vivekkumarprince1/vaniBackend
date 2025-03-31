# Vani Backend Deployment Guide

This guide provides instructions for deploying the Vani backend service to various environments.

## Prerequisites

- Node.js (v16 or higher)
- MongoDB database
- Azure account (for Azure deployment)
- Azure Translator API keys
- Azure Speech API keys

## Environment Variables

Before deployment, ensure the following environment variables are set:

```
# Azure Translator Configuration
AZURE_TRANSLATOR_KEY=your-key-here
AZURE_TRANSLATOR_REGION=centralindia
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com/

# Microsoft Azure Speech to Text Configuration
AZURE_SPEECH_KEY=your-key-here
AZURE_SPEECH_REGION=centralindia
AZURE_SPEECH_ENDPOINT=https://centralindia.api.cognitive.microsoft.com/sts/v1.0/issuetoken

# Server Configuration
NODE_ENV=production
PORT=2000
JWT_SECRET=your-secret-key
JWT_EXPIRY=86400000

# MongoDB Connection
MONGO_URI=your-mongodb-connection-string

# CORS Configuration
ALLOWED_ORIGINS=https://vani-frontend.vercel.app,https://vani.azurewebsites.net
```

## Deployment to Azure App Service

1. Create an App Service in Azure
   - Runtime: Node.js 16 LTS or higher
   - Plan: At least B1 (or higher for production)
   - Region: Preferably same as your Azure Translator region

2. Configure App Settings
   - In the Azure Portal, navigate to your App Service
   - Go to Configuration > Application Settings
   - Add all the environment variables listed above

3. Deploy via GitHub Actions (Recommended)
   - Set up a GitHub Actions workflow using the `.github/workflows/deploy.yml` file
   - Add the necessary secrets to your GitHub repository

4. Manual Deployment
   - Build the application locally: `npm run build`
   - Zip the application: `zip -r deployment.zip . -x "node_modules/*" ".*"`
   - Deploy using the Azure CLI: `az webapp deployment source config-zip --resource-group <group-name> --name <app-name> --src deployment.zip`

## Deployment to Other Platforms

### Heroku

1. Install the Heroku CLI and log in
2. In your project directory, run:
   ```
   heroku create vani-backend
   heroku config:set NODE_ENV=production
   heroku config:set AZURE_TRANSLATOR_KEY=your-key
   # Set all other environment variables
   git push heroku main
   ```

### Digital Ocean App Platform

1. Create a new app on Digital Ocean App Platform
2. Connect your GitHub repository
3. Set the environment variables in the app settings
4. Deploy the application

## Verifying Deployment

After deployment, verify the application is working correctly by:

1. Checking the health endpoint: `https://your-deployed-app.com/health`
2. Verifying API endpoints are accessible: `https://your-deployed-app.com/api/auth/me`
3. Testing socket connections via a client application

## Troubleshooting

If you encounter issues:

1. Check application logs in your deployment platform
2. Verify all environment variables are set correctly
3. Ensure MongoDB connection is working properly
4. Verify CORS settings allow your frontend domain
5. Check for firewall or network restrictions
6. Ensure Azure API keys are valid and have sufficient quota

## Production Recommendations

1. **Security**:
   - Use a dedicated database user with limited permissions
   - Store secrets in Azure Key Vault or similar service
   - Enable HTTPS with valid SSL certificates
   - Implement rate limiting for API endpoints

2. **Performance**:
   - Configure auto-scaling based on CPU usage
   - Use a CDN for static assets
   - Consider using Azure Cache for Redis for session storage

3. **Monitoring**:
   - Set up Azure Application Insights
   - Configure alerts for critical errors
   - Monitor resource usage and scale appropriately

4. **Backup**:
   - Enable automatic backups for your MongoDB database
   - Implement regular logging and error reporting

## Support

For deployment issues or questions, contact the development team or refer to the Azure documentation. 