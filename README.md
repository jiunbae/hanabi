<div align="center">

# 🎆 Hanabi

**A web-based Hanabi board game platform for multi-agent cooperation research**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[Play Now](#quick-start) · [API Docs](#rest-api) · [Tutorial](#how-to-play) · [Contributing](#contributing)

</div>

---

## Quickstart for Agents

<div><img src="https://quickstart-for-agents.vercel.app/api/header.svg?theme=claude-code&title=Set+up+Hanabi+game+server+for+multi-agent+cooperation+research&mascot=thinking" width="100%" /></div>

```
Clone and set up the Hanabi web game platform — a cooperative card game environment
for AI agent research. Start the server, then use the REST API to create games,
join as players, and submit actions. Each response includes `legalActions` (all valid
moves) and `actionHistory` (full game log), so agents don't need to implement rules.

git clone https://github.com/jiunbae/hanabi.git && cd hanabi
pnpm install && pnpm -w build && pnpm -w start

API: POST /api/games to create, POST /api/games/:id/join to join,
POST /api/games/:id/start to begin, POST /api/games/:id/actions to play.
Auth via x-api-key header. See REST API section below for full docs.
```

<div><img src="https://quickstart-for-agents.vercel.app/api/footer.svg?theme=claude-code&model=Opus+4.6&project=hanabi" width="100%" /></div>

---

## Overview

Hanabi is a cooperative card game where players can see everyone's cards **except their own**. This platform provides:

- **Pure TypeScript game engine** — deterministic state machine, fully testable
- **Real-time multiplayer** — WebSocket-based with automatic reconnection
- **AI agent API** — REST endpoints with pre-computed legal actions
- **Research-ready** — event-sourced action logs, seeded PRNG for reproducibility
- **Polished UI** — SVG card rendering, animations, i18n (EN/KO)

> Built for the AI research community studying multi-agent cooperation, inspired by benchmarks like [ICLR 2025 Generalist Hanabi Agent](https://arxiv.org/abs/2405.09324).

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Monorepo                       │
├──────────────┬──────────────┬───────────────────┤
│  @hanabi/    │  @hanabi/    │   @hanabi/         │
│  engine      │  server      │   web              │
│              │              │                    │
│  Pure TS     │  Hono +      │   React 19 +       │
│  state       │  WebSocket   │   SVG + Zustand    │
│  machine     │  + SQLite    │   + i18n (EN/KO)   │
├──────────────┴──────────────┴───────────────────┤
│              @hanabi/shared                      │
│         WS messages · API types · Errors         │
└─────────────────────────────────────────────────┘
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

Hanabi is a **cooperative** card game for 2-5 players:

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

## Project Structure

```
hanabi/
├── packages/
│   ├── engine/          # @hanabi/engine — pure game logic
│   │   ├── src/
│   │   │   ├── types.ts       # All game types
│   │   │   ├── reducer.ts     # (state, action) => newState
│   │   │   ├── validators.ts  # Action validation
│   │   │   ├── views.ts       # PlayerView (information hiding)
│   │   │   ├── selectors.ts   # Legal actions computation
│   │   │   └── ...
│   │   └── __tests__/         # 32 unit tests
│   └── shared/          # @hanabi/shared — protocol types
├── apps/
│   ├── server/          # @hanabi/server — Hono API + WebSocket
│   │   └── src/
│   │       ├── routes/        # REST endpoints
│   │       ├── ws/            # WebSocket handler
│   │       └── services/      # GameManager
│   └── web/             # @hanabi/web — React frontend
│       └── src/
│           ├── components/    # SVG game components
│           ├── hooks/         # useWebSocket
│           ├── stores/        # Zustand state
│           └── lib/           # i18n, colors, symbols
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
