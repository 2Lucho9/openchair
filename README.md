# OpenChair

Agenda de citas para barberos, estilistas y manicuristas. Tu agenda, siempre con silla libre.

- `apps/web`: la app (Vite + React, PWA mas adelante)
- `packages/engine`: motor de agenda (choques, horarios, huecos libres) con tests

## Comandos

```bash
pnpm install
pnpm test          # tests del motor
pnpm typecheck
pnpm dev           # app en modo desarrollo
pnpm build         # compila apps/web/dist
```

## Despliegue

Cloudflare Workers con `wrangler.jsonc`.
Build command: `pnpm --filter web build`. Deploy command: `npx wrangler deploy`.
