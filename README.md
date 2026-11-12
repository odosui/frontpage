<p align="center">
  <img src="media/logo.png" alt="frontpage" width="128" />
</p>

# frontpage

[![CI](https://github.com/odosui/frontpage/actions/workflows/ci.yml/badge.svg)](https://github.com/odosui/frontpage/actions/workflows/ci.yml)

AI-powered news aggregator and analyst — an LLM harness for making sense of current events.

<p align="center">
  <img src="media/screen-stories.png" alt="Stories: coverage from several outlets grouped into events, each article with its importance" width="800" />
</p>

## How it works

```mermaid
flowchart LR
  S[Sources] --> A[Articles] --> T[Stories] --> F[Facts]
```

1. Add sources: RSS, subreddits, web pages.
2. Connect your favorite models via OpenRouter.
3. Frontpage extracts the headlines and groups them into stories.
4. Then it reads full texts and extract facts.

## Screenshots

<table>
  <tr>
    <td><img src="media/screen-latest.png" alt="Latest: the raw feed, unfiled articles marked" /></td>
    <td><img src="media/screen-facts.png" alt="Facts: established claims with confidence and sources" /></td>
  </tr>
  <tr>
    <td align="center">Latest</td>
    <td align="center">Facts</td>
  </tr>
  <tr>
    <td colspan="2"><img src="media/screen-dark.png" alt="Stories in the dark theme" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center">Dark theme</td>
  </tr>
</table>

## Features

- Slick UI
- Multiple dashboards with their own sources
- RSS, subreddits, plan websites
- An analyst with web access (BYO Brave API key) you can talk to
- Any model on OpenRouter
- Self-hosted and open source, with your data in your own PostgreSQL

## Keyboard shortcuts

- `Alt` + `←` / `→` — previous / next dashboard (wraps around)
- `Alt` + `R` — refresh every source the current dashboard reads
- `Alt` + `1` / `2` / `3` — Latest / Stories / Facts
- `Alt` + `C` — open or close conversations

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

The API is behind a login and there is no sign-up page. Set `FRONTPAGE_SECRET` to a long random string first: it signs the session cookies, and the server refuses to start in production without it.

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
