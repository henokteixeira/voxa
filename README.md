# Voxa

Personal language app focused on voice conversation, with hint-based correction, a mistake bank,
spaced repetition and progress tracking.

## Structure

| Folder | What it is |
| --- | --- |
| `apps/web` | PWA in React + Vite |
| `apps/api` | NestJS API (TypeScript), Postgres via Drizzle |
| `services/voice` | Local Python service: Whisper (speech-to-text) + Kokoro (text-to-speech) |

The API depends only on interfaces (`apps/api/src/domain/ports`). Concrete implementations
(Claude, local voice, Postgres) live in `apps/api/src/infra` and are wired in `app.module.ts`.

## Running locally

Requirements: Node 22+, pnpm 10+, Python 3.11+, Docker (for Postgres).

```bash
cp .env.example .env          # fill in ANTHROPIC_API_KEY
pnpm install
pnpm db:up                    # start Postgres
pnpm db:migrate               # create the tables
pnpm dev:api                  # http://localhost:3000/api/health
pnpm dev:web                  # http://localhost:5173
```

Voice service: see `services/voice/README.md`.
