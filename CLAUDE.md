# Voxa — instructions for Claude

- Everything in this repository is written in English: code, comments, docs, commit messages and PRs.
- pnpm monorepo: `apps/web` (React + Vite PWA), `apps/api` (NestJS), `services/voice` (FastAPI, Python).
- Ports and adapters: use cases depend only on the interfaces in `apps/api/src/domain/ports`.
  No vendor SDK (Anthropic, Supabase, etc.) outside `apps/api/src/infra`.
- Every learning record carries `language` (BCP 47) so other languages can be supported.
- Database: plain Postgres + Drizzle. Do not use Supabase Auth/SDK. Generate migrations with `pnpm --filter @voxa/api db:generate`.
- The API uses TypeScript 6 (the Nest CLI does not support TypeScript 7 yet).
- Checks before committing: `pnpm lint`, `pnpm test`, `pnpm build`.
- Correcting the learner's mistakes: use hints (prompts), not recasts.
