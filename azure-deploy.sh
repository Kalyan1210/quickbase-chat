#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# AZURE DEPLOYMENT SCRIPT
# Run this script to deploy the QuickBase Chat application to Azure
# ═══════════════════════════════════════════════════════════════════════════════

# Configuration - UPDATE THESE VALUES
RESOURCE_GROUP="quickbase-chat-rg"
LOCATION="eastus"
APP_NAME="quickbase-chat"
ACR_NAME="quickbasechatacr"  # Must be globally unique, lowercase, no special chars
DB_SERVER_NAME="quickbase-chat-db"
DB_NAME="quickbasechat"
DB_ADMIN_USER="dbadmin"
DB_ADMIN_PASSWORD="CHANGE_ME_SecurePassword123!"  # CHANGE THIS!

echo "🚀 Starting Azure Deployment..."

# Login to Azure (if not already logged in)
echo "📝 Checking Azure login..."
az account show &> /dev/null || az login

# Create Resource Group
echo "📦 Creating Resource Group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
echo "🐳 Creating Container Registry..."
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# Get ACR credentials
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query "username" -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Build and push Docker image
echo "🔨 Building Docker image..."
az acr build \
  --registry $ACR_NAME \
  --image quickbase-chat:latest \
  .

# Create PostgreSQL Flexible Server
echo "🗄️ Creating PostgreSQL Database..."
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --location $LOCATION \
  --admin-user $DB_ADMIN_USER \
  --admin-password $DB_ADMIN_PASSWORD \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 15 \
  --yes

# Create database
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $DB_SERVER_NAME \
  --database-name $DB_NAME

# Allow Azure services to access the database
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Get database connection string
DB_HOST="$DB_SERVER_NAME.postgres.database.azure.com"
DATABASE_URL="postgresql://$DB_ADMIN_USER:$DB_ADMIN_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=require"

# Create App Service Plan
echo "📋 Creating App Service Plan..."
az appservice plan create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-plan" \
  --is-linux \
  --sku B1

# Create Web App
echo "🌐 Creating Web App..."
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --name $APP_NAME \
  --docker-registry-server-url "https://${ACR_NAME}.azurecr.io" \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD \
  --deployment-container-image-name "${ACR_NAME}.azurecr.io/quickbase-chat:latest"

# Configure environment variables
echo "⚙️ Configuring environment variables..."
echo ""
echo "⚠️  IMPORTANT: You need to manually set these environment variables in Azure Portal:"
echo "    - AZURE_AD_CLIENT_ID"
echo "    - AZURE_AD_CLIENT_SECRET"
echo "    - AZURE_AD_TENANT_ID"
echo "    - QUICKBASE_REALM"
echo "    - QUICKBASE_APP_ID"
echo "    - QUICKBASE_USER_TOKEN"
echo "    - ANTHROPIC_API_KEY"
echo "    - NEXTAUTH_SECRET (generate with: openssl rand -base64 32)"
echo ""

# Set the database URL
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings \
    DATABASE_URL="$DATABASE_URL" \
    NEXTAUTH_URL="https://${APP_NAME}.azurewebsites.net" \
    NODE_ENV="production"

# Enable HTTPS only
az webapp update \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --https-only true

# Get the app URL
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Your app will be available at: $APP_URL"
echo ""
echo "📝 Next steps:"
echo "   1. Go to Azure Portal → App Service → $APP_NAME → Configuration"
echo "   2. Add the remaining environment variables listed above"
echo "   3. Go to Azure AD → App registrations → Your app"
echo "   4. Add redirect URI: ${APP_URL}/api/auth/callback/azure-ad"
echo "   5. Restart the App Service"
echo ""

