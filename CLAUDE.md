# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

stocks-AI is a monorepo with three services:
- `client/` — React 19 frontend (Create React App, MUI Joy/Material UI)
- `server/` — Backend API server (not yet scaffolded)
- `ai-service/` — AI/ML service (not yet scaffolded)

## Client Commands

All commands run from `client/`:

```bash
cd client
npm start        # Dev server at http://localhost:3000
npm test         # Run tests in watch mode
npm test -- --watchAll=false   # Run tests once (CI mode)
npm run build    # Production build to client/build/
```

## Server Commands

All commands run from `server/`:

```bash
cd server
npm start        # Production start
npm run dev      # Dev server with nodemon (auto-reload)
```

Server runs at http://localhost:3001. Endpoints:
- `GET /api/health` — service health check

## Architecture

The client uses:
- **React 19** with React Router v7 for routing
- **MUI Joy + MUI Material** with Emotion for styling
- Standard CRA file layout: `src/App.js` is the root component
- Proxy in `client/package.json` forwards `/api/*` to `http://localhost:3001` during dev

The server uses:
- **Node.js + Express** on port 3001
- **CORS** restricted to `http://localhost:3000` in dev
- Routes under `server/src/routes/`

The `ai-service/` directory is a stub — planned: Python + FastAPI on port 8000, integrated with Grok (xAI) for free-tier LLM testing.
