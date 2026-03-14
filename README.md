<p align="center">
  <img src="media/logo.png" alt="frontpage" width="128" />
</p>

# frontpage

[![CI](https://github.com/odosui/frontpage/actions/workflows/ci.yml/badge.svg)](https://github.com/odosui/frontpage/actions/workflows/ci.yml)

AI-powered website aggregator.

<p align="center">
  <img src="media/screen.png" alt="screenshot" width="800" />
</p>

## Running with Docker

```bash
docker run -d \
  -p 3043:3043 \
  -v ~/.frontpage:/data/frontpage \
  -e ANTHROPIC_API_KEY=your-key \
  -e OPENROUTER_API_KEY=your-key \
  -e FRONTPAGE_MODEL=google/gemini-3-flash-preview \
  hiquest/frontpage:latest
```

Or with docker compose — edit `docker-compose.yml` to set your API keys, then:

```bash
docker compose up -d
```

The app will be available at `http://localhost:3043`. Dashboard configs are stored in `~/.frontpage`.

## Motivation

Modern LLMs have become powerful enough and, more importantly, cheap enough to digest a website's front page and extract a list of articles — like an RSS feed, which many websites no longer provide. This project aggregates those results into a nice dashboard.
