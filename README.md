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

### Tutor context (optional, personal)

The tutor makes scenes realistic with facts about you: your role, projects, meetings and the words you use.
Write them in `tutor-context.md` at the repository root (plain Markdown, any structure). The file is
gitignored; never commit it. Without it, the tutor asks about your work instead.

### Try a session without voice

```bash
curl -s localhost:3000/api/sessions -H 'content-type: application/json' -d '{"mode":"daily"}'
# → {"sessionId":"…","mode":"daily","language":"en","message":"…"}
curl -s localhost:3000/api/sessions/<sessionId>/turns -H 'content-type: application/json' \
  -d '{"text":"Yesterday I fix the upload bug."}'
# → {"kind":"hint" | "reply" | "reveal","message":"…","selfCorrected":false}
curl -s -X POST localhost:3000/api/sessions/<sessionId>/end
```

Modes: `presentation`, `free_talk`, `daily`, `review`.
