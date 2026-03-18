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
- Data stored on your machine as json files
- Supported providers: OpenAI (default), OpenRouter, Anthropic
- Quick start with docker-compose
- Open source and self-hosted

## Motivation

Modern LLMs have become powerful enough and, more importantly, cheap enough to digest a website's front page and extract a list of articles — like an RSS feed, which many websites no longer provide. This project aggregates those results into a nice dashboard.

## Running with Docker

```bash
docker run -d \
  -p 3043:3043 \
  -v ~/.frontpage:/data/frontpage \
  -e OPENAI_API_KEY=your-key \
  -e FRONTPAGE_MODEL=openai/gpt-5.4-nano \
  hiquest/frontpage:latest
```

Or with docker compose — edit `docker-compose.yml`, to set your API key (e.g., `OPENAI_API_KEY`) then:

```bash
docker compose up -d
```

The app will be available at `http://localhost:3043`. By default, dashboard configs are stored in `~/.frontpage`, but you can override that by changing `FRONTPAGE_HOME` environment variable.

## FAQ

### Why not just use RSS?

Many websites have stopped providing RSS feeds, because, khmm, ads. Other times, RSS feeds are available but not frequently updated.

### What model should I use?

The `FRONTPAGE_MODEL` value uses the format `provider/model`. Supported providers are `openai`, `openrouter`, and `anthropic`. For example:

- `openai/gpt-5.4-nano`
- `openrouter/google/gemini-3-flash-preview`
- `anthropic/claude-sonnet-4-6`

The default is `openai/gpt-5.4-nano`. It seems to be good enough, and [cheap enough](https://developers.openai.com/api/docs/models/gpt-5-nano). Make sure you set the corresponding API key environment variable (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`).

### So is this another service wrapped around a prompt?

Yes. You can read the prompt [here](server/src/components/websites/prompt.ts).
