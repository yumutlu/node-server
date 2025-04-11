# Node.js Email Analysis System

This monorepo contains two separate Node.js services that read and analyze emails from Gmail.

## Services

### Mail Reader Service
- Reads emails from Gmail
- Uses IMAP protocol
- Stores emails in MongoDB

### Mail Analyzer Service
- Analyzes emails stored in MongoDB
- Categorizes and tags emails
- Uses OpenAI for content analysis

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the required information:
- Gmail username and app password
- MongoDB connection URI
- OpenAI API key

3. Start the services:
```bash
npm run start
```

## Requirements
- Node.js 18+
- MongoDB
- Gmail account (for IMAP access)
- OpenAI API key
