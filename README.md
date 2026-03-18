# seqd — Personal Email Sequencer

Self-hosted, open-source email sequencer for personal and small-team cold outbound. Replaces Apollo/Instantly/Smartlead.

## Quick Start

```bash
git clone https://github.com/getbeton/seqd
cd seqd
cp .env.example .env.local
# Edit .env.local with your credentials

# Start database + redis
docker compose up -d db redis

# Push schema to database
DATABASE_URL=postgresql://seqd:seqd@localhost:5432/seqd npm run db:push

# Seed defaults (creates workspace + contact stages)
npm run dev &
curl -X POST http://localhost:3000/api/setup

# Open http://localhost:3000
```

## Stack

- **Next.js 15** (App Router) — API routes + UI in one codebase
- **Drizzle ORM** + PostgreSQL
- **BetterAuth** — email/password authentication
- **shadcn/ui** + Tailwind CSS
- **Docker Compose** — db, redis, web, cron

## Features

- Gmail OAuth mailbox management (unlimited mailboxes)
- Multi-step email sequences with spintax + variable templates
- Smart capacity-aware scheduler with future slot reservation
- Reply detection via Gmail API polling
- CC/BCC per email step (for CRM passthrough like Attio)
- REST API for all data
- Webhooks for events (send, reply, bounce)
- Web UI with campaign management, contact import, reply feed
- CLI for automation (`seqd run`, `seqd contacts import`, etc.)

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `GOOGLE_OAUTH_CLIENT_ID` | GCP OAuth2 Desktop App client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | GCP OAuth2 client secret |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex key for encrypting Gmail tokens |
| `BETTER_AUTH_SECRET` | Secret for BetterAuth session signing |
| `CRON_SECRET` | Secret for protecting cron endpoints |

## CLI

```bash
# Run via npm
npm run cli -- mailbox list
npm run cli -- campaign list
npm run cli -- contacts import leads.csv --campaign <id>
npm run cli -- run --dry-run
npm run cli -- capacity
```

## Docker Compose (Full Stack)

```bash
docker compose up
```

Starts: PostgreSQL, Redis, Next.js app, and cron scheduler.

## License

MIT
