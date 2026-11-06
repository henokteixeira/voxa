# Voxa — instruções para o Claude

- Monorepo pnpm: `apps/web` (React + Vite PWA), `apps/api` (NestJS), `services/voice` (FastAPI, Python).
- Arquitetura de portas e adaptadores: casos de uso dependem só das interfaces em `apps/api/src/domain/ports`.
  Nada de SDK de fornecedor (Anthropic, Supabase, etc.) fora de `apps/api/src/infra`.
- Todo dado de aprendizado carrega `language` (BCP 47), para suportar outros idiomas.
- Banco: Postgres puro + Drizzle. Não usar Supabase Auth/SDK. Migrations com `pnpm --filter @voxa/api db:generate`.
- A API usa TypeScript 6 (o Nest CLI ainda não suporta o TS 7).
- Checagens antes de commitar: `pnpm lint`, `pnpm test`, `pnpm build`.
- Correção de erros do usuário: por pistas (prompts), não por recasts.
