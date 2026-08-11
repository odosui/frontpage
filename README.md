<p align="center">
  <img src="media/logo.png" alt="frontpage" width="128" />
</p>

# frontpage

[![CI](https://github.com/odosui/frontpage/actions/workflows/ci.yml/badge.svg)](https://github.com/odosui/frontpage/actions/workflows/ci.yml)

AI-powered website aggregator.

Frontpage uses LLMs to scrape front pages, extract articles, and display them in a customizable dashboard. Add any website you want to follow, organize sources into columns, and get a single view of what's new across the web.

<p align="center">
  <img src="media/screen.png" alt="screenshot" width="800" />
</p>

## Features

- Customizable widgets
- Multiple dashboards
- Data stored in your own PostgreSQL database
- Supported providers: OpenAI (default), OpenRouter, Anthropic
- Quick start with docker-compose
- Open source and self-hosted

## Keyboard shortcuts

- `Alt` + `←` / `→` — switch to previous / next dashboard (wraps around)
- `Alt` + `R` — refresh all widgets on the current dashboard

## Motivation

Modern LLMs have become powerful enough and, more importantly, cheap enough to digest a website's front page and extract a list of articles — like an RSS feed, which many websites no longer provide. This project aggregates those results into a nice dashboard.

## Running with Docker

The bundled compose file brings up both the app and a PostgreSQL database. Edit `docker-compose.yml` to set your API key (e.g., `OPENAI_API_KEY`), then:

```bash
docker compose up -d
```

The app will be available at `http://localhost:3043`.

To run the container against a database you already have:

```bash
docker run -d \
  -p 3043:3043 \
  -e FRONTPAGE_DATABASE_URL=postgres://user:pass@host:5432/frontpage \
  -e OPENROUTER_API_KEY=your-key \
  -e FRONTPAGE_MODEL=openrouter/google/gemini-3-flash-preview \
  hiquest/frontpage:latest
```

## Storage

Everything — dashboards, widgets, and fetched articles — lives in PostgreSQL. Point the app at your database with `FRONTPAGE_DATABASE_URL` (or `DATABASE_URL`):

```
FRONTPAGE_DATABASE_URL=postgres://user:password@localhost:5432/frontpage
```

If neither is set, the standard `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` variables are used instead, defaulting to `postgres:postgres@localhost:5432/frontpage`. For managed databases that require TLS, set `FRONTPAGE_DATABASE_SSL=require` (or `no-verify` for self-signed certificates).

### Migrations

Migrations are plain SQL files in [`server/migrations`](server/migrations), each with an `-- +migrate up` and an `-- +migrate down` section. Applied versions are tracked in a `schema_migrations` table.

```bash
npm run migrate           # apply all pending migrations
npm run rollback          # roll back the last one (npm run rollback -- 2 for more)
npm run migrate:status    # show which migrations are applied
npm run migrate:new -- add_tags   # scaffold a new migration file
```

The server also applies pending migrations on startup, so a fresh database just works. Set `FRONTPAGE_AUTO_MIGRATE=false` to disable that and run them yourself. Inside the production container, use the compiled entrypoint: `npm run db -- up`.

### Importing from older versions

Earlier versions stored dashboards as json files under `~/.frontpage`. To bring them across:

```bash
npm run import-json
```

It reads from `FRONTPAGE_HOME` (default `~/.frontpage`), skips dashboards that already have widgets, and leaves the json files untouched. Pass `-- --overwrite` to replace existing dashboards instead.

## FAQ

### Why not just use RSS?

Many websites have stopped providing RSS feeds, because, khmm, ads. Other times, RSS feeds are available but not frequently updated.

### What model should I use?

The `FRONTPAGE_MODEL` value uses the format `provider/model`. Supported providers are `openai`, `openrouter`, and `anthropic`. For example:

- `openrouter/google/gemini-3-flash-preview`
- `openai/gpt-5.4-nano`
- `anthropic/claude-sonnet-4-6`

The default is `openrouter/google/gemini-3-flash-preview`. Make sure you set the corresponding API key environment variable (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`).

Note: pick a *non-reasoning* model. Front pages are cropped to 200k characters, and reasoning models (DeepSeek V4 Flash, MiMo-V2.5, etc.) spend so long thinking about that much HTML that they exceed the 60s request timeout. Very small models (Gemini 2.5 Flash Lite) tend to return prose instead of the JSON array. Flash-tier instruct models hit the sweet spot.

### So is this another service wrapped around a prompt?

Yes. You can read the prompt [here](server/src/components/websites/prompt.ts).
