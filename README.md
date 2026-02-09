# 🎓 Early Education Chat - QuickBase AI Assistant

A beautiful, AI-powered chat interface that lets users query their QuickBase Early Education data using natural language. Built with Next.js, Azure AD authentication, and Claude AI.

![Chat Interface Preview](https://via.placeholder.com/800x450/0f172a/38bdf8?text=Early+Education+Chat)

## ✨ Features

- **Natural Language Queries** - Ask questions in plain English
- **Azure AD Authentication** - Secure SSO with Microsoft accounts
- **QuickBase Integration** - Real-time data access from your app
- **Conversation History** - All chats saved and searchable
- **Beautiful UI** - Modern, responsive design
- **Claude AI Powered** - Intelligent responses and data analysis

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AZURE APP SERVICE                            │
│                   (Next.js Application)                         │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Azure AD      │  │  Claude AI API  │  │  QuickBase API  │
│   (Auth)        │  │  (AI Responses) │  │  (Data)         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│              AZURE POSTGRESQL (Conversation Storage)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

Before you begin, ensure you have:

- [ ] **Azure Account** with an active subscription
- [ ] **Azure AD Tenant** (comes with Microsoft 365)
- [ ] **QuickBase Account** with admin access to your realm
- [ ] **Anthropic Account** for Claude API access
- [ ] **Node.js 20+** installed locally
- [ ] **Azure CLI** installed ([Install Guide](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))

---

## 🚀 Quick Start

### Step 1: Clone and Install

```bash
# Navigate to the project directory
cd quickbase-chat

# Install dependencies
npm install

# Copy environment template
copy env.example .env.local   # Windows
# cp env.example .env.local   # Mac/Linux
```

### Step 2: Configure Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **+ New registration**
4. Fill in:
   - **Name:** Early Education Chat
   - **Supported account types:** Accounts in this organizational directory only
   - **Redirect URI:** `http://localhost:3000/api/auth/callback/azure-ad`
5. Click **Register**
6. Note down:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`
7. Go to **Certificates & secrets** → **New client secret**
8. Create a secret and copy the **Value** → `AZURE_AD_CLIENT_SECRET`

### Step 3: Configure QuickBase

1. Log into your QuickBase realm
2. Go to **My Preferences** → **Manage User Tokens**
3. Create a new token with these permissions:
   - Tables: Read
   - Records: Read
   - Fields: Read
   - Reports: Read
4. Copy the token → `QUICKBASE_USER_TOKEN`
5. Get your realm from your URL: `https://REALM.quickbase.com`
6. Get your App ID from the URL when viewing your app: `https://realm.quickbase.com/db/APP_ID`

### Step 4: Get Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys**
4. Create a new key → `ANTHROPIC_API_KEY`

### Step 5: Set Up Local Database

For local development, you can use SQLite or a local PostgreSQL:

```bash
# Using PostgreSQL locally (recommended)
# Update DATABASE_URL in .env.local:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/quickbasechat"

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### Step 6: Update .env.local

Edit `.env.local` with all your values:

```env
# Azure AD
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=your-tenant-id

# QuickBase
QUICKBASE_REALM=yourcompany
QUICKBASE_APP_ID=bqxxxxxxx
QUICKBASE_USER_TOKEN=your-token

# Claude AI
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/quickbasechat

# NextAuth
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
```

### Step 7: Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Azure Deployment

### Option A: Using the Deployment Script

```bash
# Make the script executable (Mac/Linux)
chmod +x azure-deploy.sh

# Run the deployment script
./azure-deploy.sh
```

### Option B: Manual Deployment

#### 1. Create Azure Resources

```bash
# Login to Azure
az login

# Create resource group
az group create --name quickbase-chat-rg --location eastus

# Create PostgreSQL database
az postgres flexible-server create \
  --resource-group quickbase-chat-rg \
  --name quickbase-chat-db \
  --location eastus \
  --admin-user dbadmin \
  --admin-password YourSecurePassword123! \
  --sku-name Standard_B1ms \
  --tier Burstable

# Create the database
az postgres flexible-server db create \
  --resource-group quickbase-chat-rg \
  --server-name quickbase-chat-db \
  --database-name quickbasechat
```

#### 2. Create Container Registry

```bash
# Create ACR
az acr create \
  --resource-group quickbase-chat-rg \
  --name quickbasechatacr \
  --sku Basic \
  --admin-enabled true

# Build and push image
az acr build \
  --registry quickbasechatacr \
  --image quickbase-chat:latest \
  .
```

#### 3. Create App Service

```bash
# Create App Service Plan
az appservice plan create \
  --resource-group quickbase-chat-rg \
  --name quickbase-chat-plan \
  --is-linux \
  --sku B1

# Create Web App
az webapp create \
  --resource-group quickbase-chat-rg \
  --plan quickbase-chat-plan \
  --name quickbase-chat \
  --deployment-container-image-name quickbasechatacr.azurecr.io/quickbase-chat:latest
```

#### 4. Configure Environment Variables

Go to Azure Portal → App Service → Configuration → Application settings

Add all the environment variables from your `.env.local` file.

#### 5. Update Azure AD Redirect URI

Go to Azure Portal → Azure AD → App registrations → Your app → Authentication

Add: `https://quickbase-chat.azurewebsites.net/api/auth/callback/azure-ad`

---

## 📁 Project Structure

```
quickbase-chat/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # Auth endpoints
│   │   ├── chat/route.ts                 # Chat API
│   │   └── conversations/                # Conversation management
│   ├── chat/page.tsx                     # Main chat page
│   ├── layout.tsx                        # Root layout
│   ├── page.tsx                          # Login page
│   └── globals.css                       # Global styles
├── components/
│   ├── ChatInterface.tsx                 # Chat UI
│   ├── ChatLayout.tsx                    # Layout wrapper
│   ├── Header.tsx                        # App header
│   ├── MessageBubble.tsx                 # Message component
│   └── Sidebar.tsx                       # Conversation list
├── lib/
│   ├── auth-options.ts                   # NextAuth config
│   ├── claude.ts                         # Claude AI client
│   ├── db.ts                             # Database client
│   ├── quickbase.ts                      # QuickBase API client
│   └── utils.ts                          # Utility functions
├── prisma/
│   └── schema.prisma                     # Database schema
├── Dockerfile                            # Container config
├── azure-deploy.sh                       # Deployment script
└── env.example                           # Environment template
```

---

## 🔧 Configuration

### Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_AD_CLIENT_ID` | Azure AD application ID | ✅ |
| `AZURE_AD_CLIENT_SECRET` | Azure AD client secret | ✅ |
| `AZURE_AD_TENANT_ID` | Azure AD tenant ID | ✅ |
| `QUICKBASE_REALM` | Your QuickBase realm | ✅ |
| `QUICKBASE_APP_ID` | Early Education app ID | ✅ |
| `QUICKBASE_USER_TOKEN` | QuickBase API token | ✅ |
| `ANTHROPIC_API_KEY` | Claude AI API key | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `NEXTAUTH_SECRET` | Random secret for sessions | ✅ |
| `NEXTAUTH_URL` | Your app's URL | ✅ |

---

## 🛡️ Security Best Practices

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Use Azure Key Vault** for production secrets
3. **Rotate secrets regularly**
4. **Enable Azure AD Conditional Access** for extra security
5. **Monitor API usage** in Anthropic dashboard

---

## 🐛 Troubleshooting

### "Invalid redirect URI" error
- Ensure the redirect URI in Azure AD matches exactly:
  - Local: `http://localhost:3000/api/auth/callback/azure-ad`
  - Production: `https://your-app.azurewebsites.net/api/auth/callback/azure-ad`

### "QuickBase API error"
- Verify your user token has correct permissions
- Check that your realm and app ID are correct
- Ensure your token hasn't expired

### "Database connection failed"
- Verify `DATABASE_URL` is correct
- Ensure Azure PostgreSQL firewall allows connections
- Run `npx prisma db push` to sync schema

### "Claude API error"
- Check your API key is valid
- Verify you have API credits available
- Check rate limits in Anthropic dashboard

---

## 📊 Usage Examples

Once deployed, users can ask questions like:

| Question | What happens |
|----------|--------------|
| "How many students are enrolled?" | Counts all enrollment records |
| "Show me students in Room 3" | Filters by room/class |
| "What's the enrollment trend this month?" | Aggregates by date |
| "List all available reports" | Shows QuickBase reports |
| "What data is available?" | Explains the schema |

---

## 🔄 Updates & Maintenance

### Updating the Application

```bash
# Pull latest changes
git pull

# Install new dependencies
npm install

# Update database schema
npx prisma db push

# Rebuild and deploy
az acr build --registry quickbasechatacr --image quickbase-chat:latest .
az webapp restart --resource-group quickbase-chat-rg --name quickbase-chat
```

### Viewing Logs

```bash
az webapp log tail --resource-group quickbase-chat-rg --name quickbase-chat
```

---

## 📄 License

This project is proprietary and confidential.

---

## 🤝 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Azure App Service logs
3. Contact your IT administrator

---

Built with ❤️ using Next.js, Azure, QuickBase, and Claude AI

