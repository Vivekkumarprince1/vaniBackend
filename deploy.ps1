# Azure App Service Deployment Script

# Variables
$appName = "vani"
$resourceGroup = "vani-resources"
$webSocketsEnabled = $true

# Display current WebSocket setting
Write-Host "Checking current WebSocket configuration..."
$webConfig = az webapp config show --name $appName --resource-group $resourceGroup --query "webSocketsEnabled" -o tsv
Write-Host "WebSockets currently: $webConfig"

# Enable WebSockets if needed
if ($webConfig -ne $webSocketsEnabled) {
    Write-Host "Enabling WebSockets..."
    az webapp config set --name $appName --resource-group $resourceGroup --web-sockets-enabled $webSocketsEnabled
    
    # Verify the change
    $newConfig = az webapp config show --name $appName --resource-group $resourceGroup --query "webSocketsEnabled" -o tsv
    Write-Host "WebSockets now: $newConfig"
} else {
    Write-Host "WebSockets already enabled."
}

# Restart the app to apply changes
Write-Host "Restarting the app to apply changes..."
az webapp restart --name $appName --resource-group $resourceGroup

Write-Host "Deployment completed successfully!" 