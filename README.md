# ED Documentation App

A web-based Emergency Department documentation system that syncs with Google Sheets.

## Prerequisites

Before starting, install these on your computer:

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Or use Homebrew (Mac): `brew install node`

2. **Git** (for version control)
   - Download from: https://git-scm.com/
   - Or use Homebrew (Mac): `brew install git`

3. **Code Editor** (recommended: VS Code)
   - Download from: https://code.visualstudio.com/

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env.local

# Run development server
npm run dev
```

Then open http://localhost:3000 in your browser.

## Project Structure

```
ed-documentation-app/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Main patient list view
│   ├── patient/[id]/      # Individual patient view
│   └── api/               # Backend API routes
│       ├── patients/      # Patient CRUD operations
│       ├── parse/         # Parse Meditech data
│       └── process/       # Claude AI processing
├── components/            # Reusable UI components
├── lib/                   # Utility functions
│   ├── google-sheets.ts   # Google Sheets integration
│   └── claude.ts          # Claude API integration
└── public/                # Static assets
```
