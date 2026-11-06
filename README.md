# Voxa

App pessoal de idiomas focado em conversação por voz, com correção por pistas, banco de erros,
repetição espaçada e acompanhamento da evolução.

Plano: https://claude.ai/artifact/TNbF1vNZyJj6Q32sQfZQ3N

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/web` | PWA em React + Vite |
| `apps/api` | API em NestJS (TypeScript), Postgres via Drizzle |
| `services/voice` | Serviço local em Python: Whisper (escuta) + Kokoro (fala) |

A API depende só de interfaces (`apps/api/src/domain/ports`). As implementações concretas
(Claude, voz local, Postgres) ficam em `apps/api/src/infra` e são ligadas em `app.module.ts`.

## Rodando localmente

Pré-requisitos: Node 22+, pnpm 10+, Python 3.11+, Docker (para o Postgres).

```bash
cp .env.example .env          # preencha ANTHROPIC_API_KEY
pnpm install
pnpm db:up                    # sobe o Postgres
pnpm db:migrate               # cria as tabelas
pnpm dev:api                  # http://localhost:3000/api/health
pnpm dev:web                  # http://localhost:5173
```

Serviço de voz: veja `services/voice/README.md`.
