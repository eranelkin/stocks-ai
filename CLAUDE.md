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

The ai-service uses:
- **Python + FastAPI** on port 5005
- **OpenAI SDK** pointed at xAI's API for Grok (OpenAI-compatible)
- Streaming SSE responses via `StreamingResponse`
- Model registry in `ai-service/src/config/models.py` — add new models there only

## AI Service Commands

All commands run from `ai-service/`:

```bash
cd ai-service
cp .env.example .env          # then fill in XAI_API_KEY
python3 -m venv .venv         # first time only
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn src.main:app --reload --port 5005
```

API runs at http://localhost:5005. Endpoints:
- `GET  /health`   — service health
- `GET  /models`   — list configured models (with ready flag)
- `POST /chat`     — streaming SSE chat (`{ model, messages[], system_prompt? }`)

Request routing:
- Client `proxy` in package.json → all `/api/*` go to server (port 3001)
- Server proxies `/api/ai/*` → ai-service (port 5005) via http-proxy-middleware
- Server handles `/api/health` (and future routes) directly
