<div align="center">

# 🎆 Nolbul (놀불)

**A web-based cooperative card game platform for multi-agent AI cooperation research**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[Play Now](#quick-start) · [API Docs](#rest-api) · [Tutorial](#how-to-play) · [Contributing](#contributing)

</div>

---

## Quickstart for Agents

<div><img src="https://quickstart-for-agents.vercel.app/api/header.svg?theme=claude-code&title=Set+up+Nolbul+game+server+for+multi-agent+cooperation+research&mascot=thinking" width="100%" /></div>

```
Clone and set up the Nolbul web game platform — a cooperative card game environment
for AI agent research. Start the server, then use the REST API to create games,
join as players, and submit actions. Each response includes `legalActions` (all valid
moves) and `actionHistory` (full game log), so agents don't need to implement rules.

git clone https://github.com/jiunbae/hanabi.git && cd hanabi
pnpm install && pnpm -w build && pnpm -w start

API: POST /api/games to create, POST /api/games/:id/join to join,
POST /api/games/:id/start to begin, POST /api/games/:id/actions to play.
Auth via x-api-key header. See REST API section below for full docs.
```

<div><img src="https://quickstart-for-agents.vercel.app/api/footer.svg?theme=claude-code&model=Opus+4.6&project=nolbul" width="100%" /></div>

---

## Overview

Nolbul is a cooperative card game platform where players can see everyone's cards **except their own**. This platform provides:

- **Pure TypeScript game engine** — deterministic state machine, fully testable
- **Real-time multiplayer** — WebSocket-based with automatic reconnection
- **AI agent API** — REST endpoints with pre-computed legal actions
- **Research-ready** — event-sourced action logs, seeded PRNG for reproducibility
- **Polished UI** — SVG card rendering, animations, i18n (EN/KO)

> Built for the AI research community studying multi-agent cooperation, inspired by benchmarks like [ICLR 2025 Generalist Agent](https://arxiv.org/abs/2405.09324).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       Monorepo                           │
├──────────────┬──────────────────────┬───────────────────┤
│  @nolbul/    │  @nolbul/server      │   @nolbul/web      │
│  engine      │                      │                    │
│              │  Hono + WebSocket    │   React 19 +       │
│  Pure TS     │  + SQLite            │   SVG + Zustand    │
│  state       │  + AI Bot Service    │   + Admin Panel    │
│  machine     │  (Claude/GPT/Gemini) │   + i18n (EN/KO)   │
├──────────────┴──────────────────────┴───────────────────┤
│                   @nolbul/shared                         │
│            WS messages · API types · Errors              │
└─────────────────────────────────────────────────────────┘
```

| Layer | Tech | Purpose |
|-------|------|---------|
| Engine | Pure TypeScript | `applyAction(state, action) => newState` |
| Server | Hono + libsql + ws | REST API + WebSocket + SQLite persistence |
| Web | React 19 + Vite + Zustand | SVG game board, animations, i18n |
| Shared | TypeScript types | Protocol types shared across packages |

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+

# Clone and install
git clone https://github.com/jiunbae/hanabi.git
cd hanabi
pnpm install

# Development (Vite + API server)
pnpm -w dev
# → Frontend: http://localhost:3000
# → API: http://localhost:3001

# Production
pnpm -w build
pnpm -w start
# → http://localhost:3001 (serves both static files and API)
```

## How to Play

Nolbul is a **cooperative** card game for 2-5 players:

1. **You can't see your own cards** — only other players' cards
2. **On your turn**, choose one action:
   - 🎴 **Play** a card onto the firework stacks (risky — you can't see it!)
   - 🗑️ **Discard** a card to regain a clue token
   - 💡 **Give a hint** — tell another player about a color or rank in their hand
3. **Build fireworks** from 1→5 in each of 5 colors for a max score of 25
4. **3 strikes** (wrong plays) = game over

### Card Distribution

| Rank | Copies | Notes |
|------|--------|-------|
| 1 | ×3 | Common, safe to discard |
| 2-4 | ×2 | Be careful |
| 5 | ×1 | **Never discard!** |

## Features

### Game Board
- **Table layout** — players arranged around a virtual table
- **Direct manipulation** — click cards to play, click opponent's hand to hint
- **Hint preview** — hover to see which cards match before committing
- **Visual feedback** — green glow on success, red flash on strike

### Visual Design
- SVG-based card rendering with gradients, shadows, and symbols
- Color-blind accessible (unique symbol per color: ♥ ★ ♣ ◆ ○)
- Animated card deals, firework completions, confetti on high scores
- Dark theme optimized for extended play sessions

### Information Display
- Discard pile grid with dead/critical card warnings
- Clue token dots, strike X marks, deck stack visualization
- Collapsible action log with turn-by-turn history
- Slot numbers on cards for convention-based play

### Multiplayer
- WebSocket real-time sync with auto-reconnection
- Waiting room with player list and game ID sharing
- Works across devices on the same network

### Internationalization
- English and Korean (한국어) built-in
- Auto-detects browser language
- Toggle via EN/한국어 button

## REST API

The REST API enables AI agents and programmatic access:

```bash
# Create a game
curl -X POST http://localhost:3001/api/games \
  -H 'Content-Type: application/json' \
  -d '{"options":{"numPlayers":2},"creatorName":"Agent-1"}'

# Join a game
curl -X POST http://localhost:3001/api/games/{id}/join \
  -H 'Content-Type: application/json' \
  -d '{"playerName":"Agent-2"}'

# Start the game (creator only)
curl -X POST http://localhost:3001/api/games/{id}/start \
  -H 'x-api-key: YOUR_KEY'

# Get game state (PlayerView — own cards hidden)
curl http://localhost:3001/api/games/{id} \
  -H 'x-api-key: YOUR_KEY'

# Submit an action
curl -X POST http://localhost:3001/api/games/{id}/actions \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"action":{"type":"play","playerIndex":0,"cardIndex":0}}'
```

### Key API Design Decisions

- **PlayerView** — server never exposes raw game state; own cards are always hidden
- **legalActions** — every response includes all valid moves, so agents don't need to implement rules
- **actionHistory** — full action log in every response for context-aware decision making
- **Seeded PRNG** — server generates seeds for reproducible games (seeds never exposed to clients)

## AI Agent Integration

### LLM-Optimized API

The server provides endpoints specifically designed for LLM-based agents:

```bash
# Get game rules + action format reference
curl http://localhost:3001/api/rules

# Get LLM-optimized game context (includes rules, state, legal actions as structured text)
curl http://localhost:3001/api/games/{id}/ai-context \
  -H 'x-api-key: YOUR_KEY'

# Compact version (no rules, for subsequent turns)
curl 'http://localhost:3001/api/games/{id}/ai-context?includeRules=false' \
  -H 'x-api-key: YOUR_KEY'
```

The `/ai-context` endpoint returns a `prompt` field containing a complete, structured text that any LLM can consume to make decisions — including game rules, visible cards, clue history, critical cards analysis, and all legal actions with their JSON format.

### AI Agent Runner (CLI)

Standalone scripts in `tools/ai-agent/` for running AI games without the web UI:

```bash
cd tools/ai-agent && npm install

# AI self-play (all seats played by LLMs)
ANTHROPIC_API_KEY=sk-... npx tsx src/self-play.ts --provider claude --players 2

# GPT-4o self-play
OPENAI_API_KEY=sk-... npx tsx src/self-play.ts --provider openai --players 3

# Gemini self-play
GEMINI_API_KEY=... npx tsx src/self-play.ts --provider gemini --players 2

# Mixed providers (Claude vs OpenAI)
ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... npx tsx src/self-play.ts --provider claude,openai

# AI joins an existing game (works alongside web UI players)
ANTHROPIC_API_KEY=sk-... npx tsx src/play.ts --game <gameId> --provider claude

# AI creates a game and waits for humans to join via web UI
ANTHROPIC_API_KEY=sk-... npx tsx src/play.ts --create --players 2 --provider claude
```

### In-Game AI Players

Play with AI teammates directly from the web UI — no CLI needed:

1. Configure the server with an LLM API key:
   ```bash
   # Add to your environment or .env file
   ANTHROPIC_API_KEY=sk-...   # or OPENAI_API_KEY / GEMINI_API_KEY
   AI_PROVIDER=claude         # claude | openai | gemini (auto-detects if omitted)
   AI_MODEL=                  # optional model override
   ```

2. Create a game in the web UI
3. In the Waiting Room, click **"Add AI Player"** to fill empty seats with AI bots
4. Start the game — AI players will automatically take their turns

The AI bot service runs server-side, uses `buildAIContext()` to generate prompts, and submits actions via the game engine with natural pacing (1.5s delay between turns).

### Admin Panel

Monitor games and configure AI from the web UI:

1. Set an admin key: `ADMIN_KEY=your-secret-key`
2. Click the **"Admin"** link in the lobby footer
3. Enter your admin key to access:
   - **Stats dashboard** — total/active/finished games, average scores
   - **Games table** — real-time list of all games with players, AI status, scores
   - **AI configuration** — change provider/model at runtime

Admin API endpoints (`x-admin-key` header):
- `GET /api/admin/stats` — aggregate statistics
- `GET /api/admin/games` — detailed game list
- `GET/POST /api/admin/ai-config` — read/update AI settings

## Project Structure

```
hanabi/
├── packages/
│   ├── engine/          # @nolbul/engine — pure game logic
│   │   ├── src/
│   │   │   ├── types.ts       # All game types
│   │   │   ├── reducer.ts     # (state, action) => newState
│   │   │   ├── validators.ts  # Action validation
│   │   │   ├── views.ts       # PlayerView (information hiding)
│   │   │   ├── selectors.ts   # Legal actions computation
│   │   │   ├── ai-context.ts  # LLM prompt builder
│   │   │   └── ...
│   │   └── __tests__/         # 32 unit tests
│   └── shared/          # @nolbul/shared — protocol types
├── apps/
│   ├── server/          # @nolbul/server — Hono API + WebSocket
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── games.ts   # Game + AI player endpoints
│   │       │   └── admin.ts   # Admin panel endpoints
│   │       ├── ws/            # WebSocket handler
│   │       └── services/
│   │           ├── game-manager.ts  # Game room lifecycle
│   │           └── ai-bot.ts        # Server-side AI bot service
│   └── web/             # @nolbul/web — React frontend
│       └── src/
│           ├── components/
│           │   ├── game/      # SVG game board
│           │   ├── lobby/     # Game creation/joining
│           │   └── admin/     # Admin panel
│           ├── hooks/         # useWebSocket
│           ├── stores/        # Zustand state
│           └── lib/           # i18n, API client, colors
├── tools/
│   └── ai-agent/        # Standalone AI agent CLI runner
│       └── src/
│           ├── self-play.ts   # Full AI vs AI games
│           ├── play.ts        # AI joins human games
│           ├── llm-providers.ts  # Claude/OpenAI/Gemini
│           └── nolbul-client.ts  # Game API client
└── turbo.json           # Monorepo orchestration
```

## Development

```bash
pnpm -w dev          # Start dev servers (Vite + API)
pnpm -w build        # Build all packages
pnpm -w test         # Run tests (vitest)
pnpm -w start        # Production mode
```

## Tech Stack

| Category | Technology |
|----------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript 5.9 (strict mode) |
| Engine | Pure TS, zero dependencies |
| Server | Hono, ws, libsql, Drizzle ORM |
| Frontend | React 19, Vite 6, Zustand 5 |
| Rendering | SVG components with CSS animations |
| Testing | Vitest (32 tests, 100% engine coverage) |

## License

MIT

---

<div align="center">

Built with 🎆 for the AI research community

</div>
