<p align="center">
  <img src="media/logo.png" alt="frontpage" width="128" />
</p>

# frontpage

[![CI](https://github.com/odosui/frontpage/actions/workflows/ci.yml/badge.svg)](https://github.com/odosui/frontpage/actions/workflows/ci.yml)

AI-powered news aggregator and analyst.

Frontpage uses LLMs to scrape front pages, extract articles, group them into the events they cover, and keep track of what those events establish. You give it the arcs you care about and the sources to read; it does the filing.

<p align="center">
  <img src="media/screen.png" alt="screenshot" width="800" />
</p>

## How it works

A **dashboard** is one running arc — "Russian-Ukrainian war", "AI chip race", "Bird flu outbreak". Everything hangs off it:

```
dashboard   the arc you are following
  story     one event inside it — several outlets merged into one entry
    article one headline from one outlet
  facts       what the arc is taken to have established, versioned
  predictions what it points to and has not settled
  chat        an agent that reads all of the above, and the web
```

**Sources** sit outside that tree. A source is a site or feed we pull from, it belongs to no dashboard, and any number of dashboards can read it — a general outlet feeds several arcs at once and is fetched once for all of them. Each dashboard files that source's articles into its own stories, under its own tags, and skips whatever is not its business. Two arcs reading the same wire never see each other's judgements.

## Features

- Sources shared across dashboards: fetched once, filed separately
- Stories: several outlets covering one event, merged
- Facts and predictions per arc, versioned, with the reasoning kept
- An analyst you can talk to about what it has collected
- Data stored in your own PostgreSQL database
- Any model on OpenRouter
- Quick start with docker-compose
- Open source and self-hosted

## Keyboard shortcuts

- `Alt` + `←` / `→` — switch to previous / next dashboard (wraps around)
- `Alt` + `R` — refresh every source the current dashboard reads

## Motivation

Modern LLMs have become powerful enough and, more importantly, cheap enough to digest a website's front page and extract a list of articles — like an RSS feed, which many websites no longer provide. This project aggregates those results into a nice dashboard.

## Running with Docker

The bundled compose file brings up both the app and a PostgreSQL database. Edit `docker-compose.yml` to set your `OPENROUTER_API_KEY`, then:

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
  -e FRONTPAGE_MODEL_SMALL=google/gemini-3.1-flash-lite \
  -e FRONTPAGE_MODEL_BIG=anthropic/claude-opus-5 \
  hiquest/frontpage:latest
```

## Storage

Everything — dashboards, sources, fetched articles, and what has been made of them — lives in PostgreSQL. Point the app at your database with `FRONTPAGE_DATABASE_URL` (or `DATABASE_URL`):

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

## FAQ

### Why not just use RSS?

Many websites have stopped providing RSS feeds, because, khmm, ads. Other times, RSS feeds are available but not frequently updated.

### What model should I use?

Everything goes through [OpenRouter](https://openrouter.ai), so both settings take an OpenRouter model id. Set `OPENROUTER_API_KEY` to your key.

There are two of them, because the app does two different jobs:

- `FRONTPAGE_MODEL_SMALL` (default `google/gemini-3.1-flash-lite`) reads a front page and pulls the articles out of it. This runs on every source refresh, over a lot of HTML, so it should be fast and cheap. Another good option: `anthropic/claude-haiku-4-5`. (The older `FRONTPAGE_MODEL` still works as a fallback name for this one.)
- `FRONTPAGE_MODEL_BIG` (default `anthropic/claude-opus-5`) files the collected headlines into stories, decides what belongs to an arc at all, and answers in the chat. It runs rarely and on short input — headlines only — and the quality gap between models is wide here, so it is worth paying for.

Note: for the _small_ model, pick a _non-reasoning_ one. Front pages are cropped to 200k characters, and reasoning models (DeepSeek V4 Flash, MiMo-V2.5, etc.) spend so long thinking about that much HTML that they run past the request timeout. Very small models tend to return prose instead of the JSON array. Flash-tier instruct models hit the sweet spot.

Model choice also affects _image_ extraction, which varies far more than title extraction — on the same page, some models return an image for every article and others for only a quarter of them. If your feed looks text-only, try a different model before assuming the sites lack images.

### So is this another service wrapped around a prompt?

Yes. You can read the prompt [here](server/src/components/websites/prompt.ts).
