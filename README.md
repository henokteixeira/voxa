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

## Running with Docker (recommended)

Requirements: Docker only.

```bash
cp .env.example .env          # fill in ANTHROPIC_API_KEY
docker compose up --build     # http://localhost:5173 (API: http://localhost:3000/api/health)
```

This starts Postgres, applies the migrations, and runs the API, the web app and the voice service.
The first start downloads the voice models (~1.8 GB, kept in a Docker volume), so live voice works only
once `docker compose ps` shows `voice` as healthy. The microphone stays in your browser; the containers
only receive the audio the web app sends. Inside Docker the API reaches Postgres and the voice service by
service name, so `DATABASE_URL` and `VOICE_SERVICE_URL` in `.env` are ignored there.

By default this is development mode (`docker-compose.override.yml`): the source is mounted into the
containers, so web changes hot-reload in the browser, API changes restart the server and new migrations
apply on the next start. After a `git pull`, nothing to rebuild unless dependencies or config files changed;
then run `docker compose up --build -V` (`-V` refreshes the installed packages).
The production build (nginx, compiled API) runs with `docker compose -f docker-compose.yml up --build`.

Voice evaluation (reads `services/voice/eval/recordings`, writes `services/voice/eval/results`):

```bash
docker compose run --rm voice python -m eval.mixed_language --models small medium --out eval/results/mixed.md
```

Recording yourself (`eval.record`) needs the microphone, which Docker on macOS cannot reach.

Golden sessions: a quick check against the real tutor (Claude) that a serious mistake gets a hint and the
fix counts as a self-correction, that a first-language word is a new word and not a mistake, and that a fluent
sentence is not corrected. Run them after changing the tutor prompt, the model or the effort. They use
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT` from `.env` and cost API credits (a few Claude
calls), so they are not part of `pnpm test` or CI:

```bash
docker compose run --rm --no-deps api pnpm golden
```

The source is mounted into the dev container, so add `--build` only after changing dependencies or config.

Model eval: every scripted conversation (the golden ones plus harder cases: false friends, small slips,
retries, jargon) against several models, to choose the tutor model by quality, speed and cost. Each model gets
a row with mistake detection, hints that keep the answer, self-correction, the hint/reply/reveal flow, spoken
line rules, the wait for the spoken reply (p50/p90), the cost per learner turn at list price, and errors:

```bash
docker compose run --rm --no-deps --build api pnpm eval:models   # --build the first time only
# Other models or efforts, and runs per scenario (default 2):
docker compose run --rm --no-deps -e EVAL_MODELS=claude-sonnet-5-5@low,claude-haiku-5-5@medium -e EVAL_RUNS=3 api pnpm eval:models
```

The report is printed and saved to `apps/api/eval-results/` (gitignored). The scenarios live in
`apps/api/src/golden/scenarios.ts`; prices in `apps/api/src/model-eval/pricing.ts`.

## Running without Docker

Requirements: Node 22+, pnpm 10+, Python 3.10–3.12 (Kokoro does not support 3.13 yet), Docker (for Postgres).

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

### Live voice

After starting a session over HTTP, the app opens a WebSocket at `ws://localhost:3000/api/sessions/<sessionId>/voice`
(protocol in `apps/api/src/voice/voice-socket.server.ts`). Each binary frame is one finished turn of speech (WAV);
the API answers with the transcript, the tutor's turn, the tutor's speech (WAV) and `done`.
It needs the voice service running (`services/voice`).
