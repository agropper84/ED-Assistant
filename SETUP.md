# ED Documentation App - Setup Guide

## Step 1: Prerequisites

Install these on your computer:

### Node.js (v18 or higher)
- **Mac**: `brew install node` or download from https://nodejs.org/
- **Windows**: Download from https://nodejs.org/

### Verify installation:
```bash
node --version  # Should show v18.x or higher
npm --version   # Should show 9.x or higher
```

---

## Step 2: Set Up Google Cloud Project

You need a Google Cloud project to access Google Sheets API.

### 2.1 Create a Project
1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Name it "ED Documentation" → Create

### 2.2 Enable Google Sheets API
1. In your project, go to "APIs & Services" → "Enable APIs"
2. Search for "Google Sheets API"
3. Click "Enable"

### 2.3 Create a Service Account
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Name: "ed-docs-service"
4. Click "Create and Continue" → "Done"

### 2.4 Create a Key
1. Click on your new service account
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON" → "Create"
5. Save the downloaded file (you'll need values from it)

### 2.5 Share Your Spreadsheet
1. Open your Google Sheet
2. Click "Share"
3. Add the service account email (from the JSON file, looks like: `ed-docs-service@your-project.iam.gserviceaccount.com`)
4. Give it "Editor" access

---

## Step 3: Get Your Claude API Key

1. Go to https://console.anthropic.com/
2. Create an account or log in
3. Go to "API Keys"
4. Click "Create Key"
5. Copy and save the key (starts with `sk-ant-`)

---

## Step 4: Download and Configure the App

### 4.1 Download the Project
Download the `ed-documentation-app` folder to your computer.

### 4.2 Install Dependencies
Open Terminal/Command Prompt in the project folder:
```bash
cd ed-documentation-app
npm install
```

### 4.3 Configure Environment Variables
1. Copy the example file:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` with your values:
```env
# Your Claude API key
CLAUDE_API_KEY=sk-ant-your-key-here

# Your Google Sheet ID (from the URL)
# Example: https://docs.google.com/spreadsheets/d/ABC123xyz/edit
# The ID is: ABC123xyz
GOOGLE_SHEETS_ID=your-spreadsheet-id

# From your service account JSON file
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@your-project.iam.gserviceaccount.com

# From your service account JSON file (the "private_key" field)
# Keep the quotes and \n characters
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Key-Here\n-----END PRIVATE KEY-----\n"

# Sheet name (default: Template)
GOOGLE_SHEET_NAME=Template
```

---

## Step 5: Run the App Locally

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Step 6: Deploy to Vercel (Free Hosting)

### 6.1 Create a Vercel Account
1. Go to https://vercel.com/
2. Sign up with GitHub (recommended)

### 6.2 Install Vercel CLI
```bash
npm install -g vercel
```

### 6.3 Deploy
```bash
vercel
```

Follow the prompts. When asked about environment variables, add them via the Vercel dashboard:
1. Go to your project on Vercel
2. Settings → Environment Variables
3. Add each variable from your `.env.local`

### 6.4 Get Your App URL
After deployment, you'll get a URL like: `https://ed-docs-xxx.vercel.app`

---

## Step 7: Install on iPad

1. Open Safari on your iPad
2. Go to your Vercel URL
3. Tap the Share button
4. Tap "Add to Home Screen"
5. Name it "ED Docs"
6. Tap "Add"

The app will now appear on your home screen like a native app!

---

## Troubleshooting

### "Failed to fetch patients"
- Check your Google Sheets ID is correct
- Verify the service account has access to the sheet
- Check the sheet name matches `GOOGLE_SHEET_NAME`

### "Failed to process encounter"
- Verify your Claude API key is correct
- Check you have API credits at console.anthropic.com

### App not loading on iPad
- Make sure you're using Safari (not Chrome)
- Clear Safari cache and try again

---

## Daily Usage

1. **Add Patient**: Tap + button → Paste Meditech data → Parse → Save
2. **Process**: Open patient → Tap "Generate Encounter Note"
3. **Copy**: Tap "Copy Full Note" or copy individual sections
4. **Paste**: Go to your EMR and paste

All data syncs to your Google Sheet in real-time!
