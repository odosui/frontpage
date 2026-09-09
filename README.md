<p align="center">
  <img src="media/logo.png" alt="frontpage" width="128" />
</p>

# frontpage

[![CI](https://github.com/odosui/frontpage/actions/workflows/ci.yml/badge.svg)](https://github.com/odosui/frontpage/actions/workflows/ci.yml)

AI-powered news aggregator and analyst — an LLM harness for making sense of current events.

<p align="center">
  <img src="media/screen.png" alt="screenshot" width="800" />
</p>

## How it works

```mermaid
flowchart LR
  S[Sources] --> A[Articles] --> T[Stories] --> F[Facts] --> P[Predictions]
```

1. You add sources — RSS, web pages, or subreddits.
2. Frontpage extracts the headlines and groups them into stories.
3. It reads the recent stories and updates the arc's facts.
4. The facts set the likelihood of the predictions you have written.

An agent runs each step. You can step in at any point, or just talk to the agent in a chat panel: it reads articles, revises facts, moves forecasts, and searches the web when you supply a Brave API key.

## Features

- Sources shared across dashboards: fetched once, filed separately
- Stories: several outlets covering one event, merged
- Facts and predictions per arc, versioned, with the reasoning kept
- An analyst you can talk to about what it has collected
- Any model on OpenRouter
- Self-hosted and open source, with your data in your own PostgreSQL

## Keyboard shortcuts

- `Alt` + `←` / `→` — previous / next dashboard (wraps around)
- `Alt` + `R` — refresh every source the current dashboard reads
- `Alt` + `C` — toggle the chat panel

## Running with Docker

The bundled compose file brings up the app and a PostgreSQL database. Set your `OPENROUTER_API_KEY` in `docker-compose.yml`, then:

```bash
docker compose up -d
```

The app is then at `http://localhost:3043`.

To run the container against a database you already have:

```bash
docker run -d \
  -p 3043:3043 \
  -e FRONTPAGE_DATABASE_URL=postgres://user:pass@host:5432/frontpage \
  -e FRONTPAGE_SECRET=a-long-random-string \
  -e OPENROUTER_API_KEY=your-key \
  -e FRONTPAGE_MODEL_SMALL=google/gemini-3.1-flash-lite \
  -e FRONTPAGE_MODEL_BIG=anthropic/claude-opus-5 \
  hiquest/frontpage:latest
```

## Accounts

The API is behind a login and there is no sign-up page — accounts are made from the command line. Set `FRONTPAGE_SECRET` to a long random string first: it signs the session cookies, and the server refuses to start in production without it.

```bash
FRONTPAGE_SECRET=$(openssl rand -hex 32)     # keep it; changing it signs everyone out
npm run user:create --prefix server -- me@example.com my-long-password
npm run user:list --prefix server
npm run user:passwd --prefix server -- me@example.com a-new-password
npm run user:delete --prefix server -- me@example.com
```

Inside the production container the compiled entrypoint is `npm run user`:

```bash
docker exec -it frontpage npm run user --prefix server -- create me@example.com my-long-password
```

A session is a signed, httpOnly cookie lasting 30 days. Signing out drops it; rotating `FRONTPAGE_SECRET` invalidates every session at once.

## Storage

Everything — dashboards, sources, fetched articles, and what has been made of them — lives in PostgreSQL:

```
FRONTPAGE_DATABASE_URL=postgres://user:password@localhost:5432/frontpage
```

Without it (or `DATABASE_URL`), the standard `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` variables are used, defaulting to `postgres:postgres@localhost:5432/frontpage`. For managed databases requiring TLS, set `FRONTPAGE_DATABASE_SSL=require` — or `no-verify` for self-signed certificates.

### Migrations

Migrations are plain SQL files in [`server/migrations`](server/migrations), each with an `-- +migrate up` and an `-- +migrate down` section. Applied versions are tracked in a `schema_migrations` table.

```bash
npm run migrate           # apply all pending migrations
npm run rollback          # roll back the last one (npm run rollback -- 2 for more)
npm run migrate:status    # show which migrations are applied
npm run migrate:new -- add_tags   # scaffold a new migration file
```

The server also applies pending migrations on startup, so a fresh database just works. Set `FRONTPAGE_AUTO_MIGRATE=false` to run them yourself instead. Inside the production container, use the compiled entrypoint: `npm run db -- up`.
