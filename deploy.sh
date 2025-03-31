#!/bin/bash

# Vani Backend Deployment Script

echo "🚀 Starting Vani Backend Deployment..."

# Check for Vercel CLI
if ! command -v vercel &> /dev/null
then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Build the project
echo "📦 Building project..."
npm install
npm run lint || echo "Linting skipped"

# Ensure environment variables are set up
echo "🔒 Checking environment variables..."
if [ ! -f .env ]; then
    echo "⚠️ No .env file found! Creating from template..."
    cp .env.example .env
    echo "⚠️ Please update the .env file with your credentials before deploying"
    exit 1
fi

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment completed!"
echo ""
echo "📝 Don't forget to update the frontend to use the new backend URL:"
echo "   1. Update VITE_API_URL in frontend/.env"
echo "   2. Redeploy the frontend"
echo ""
echo "🔍 To test the backend health, visit: https://your-backend-url/health" 