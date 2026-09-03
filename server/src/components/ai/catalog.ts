/**
 * OpenRouter's model list — what the settings autocomplete offers, and the
 * only thing that says whether a model id is real.
 *
 * The endpoint is public: it needs no api key, so the settings page still
 * works on an instance whose key has not been filled in yet.
 */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** The catalog moves a few times a week; an hour stale is nobody's problem. */
const TTL_MS = 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 15_000;

export type CatalogModel = {
  /** What goes in the request — "openai/gpt-5.6-sol". */
  id: string;
  /** What a person recognizes — "OpenAI: GPT-5.6 Sol". */
  name: string;
  contextLength: number | null;
  /** USD per token, as OpenRouter quotes it. Null when it does not say. */
  promptPrice: number | null;
  completionPrice: number | null;
};

type ApiModel = {
  id?: string;
  name?: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string };
};

let cache: CatalogModel[] | undefined;
let cachedAt = 0;
/**
 * One in-flight fetch, shared. Two tabs opening the settings page at once
 * should cost one request to OpenRouter, not two.
 */
let inFlight: Promise<CatalogModel[]> | undefined;

/** Every model OpenRouter serves, by id. Cached; throws if it cannot be had. */
export async function listModels(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = fetchModels()
    .then((models) => {
      cache = models;
      cachedAt = Date.now();
      return models;
    })
    .finally(() => {
      inFlight = undefined;
    });

  try {
    return await inFlight;
  } catch (e) {
    // A stale list beats no list: the network being down should not stop the
    // settings page from rendering what it showed a minute ago.
    if (cache) return cache;
    throw e;
  }
}

/**
 * Whether OpenRouter serves this model. The one gate in front of a stored
 * model id — a typo saved here would surface much later, as every job on the
 * instance failing at once.
 */
export async function modelExists(id: string): Promise<boolean> {
  return (await listModels()).some((m) => m.id === id);
}

/** Ranked matches for what the reader has typed so far. */
export async function searchModels(
  q: string,
  limit: number,
): Promise<CatalogModel[]> {
  const models = await listModels();
  const needle = q.trim().toLowerCase();
  if (!needle) return models.slice(0, limit);

  const scored = models
    .map((m) => ({ m, score: score(m, needle) }))
    .filter((s) => s.score > 0);

  // best match first, then alphabetically so the tail of the list is stable
  // as the reader types
  scored.sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
  return scored.slice(0, limit).map((s) => s.m);
}

/**
 * An id starting with what was typed is what the reader meant; a name matching
 * is the next best; a match in the middle of an id is the long shot.
 */
function score(model: CatalogModel, needle: string): number {
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  if (id === needle) return 100;
  if (id.startsWith(needle)) return 50;
  if (name.startsWith(needle)) return 40;
  // "gpt-5.6" should find "openai/gpt-5.6-sol", whose id starts with a vendor
  if (id.includes(`/${needle}`)) return 30;
  if (id.includes(needle)) return 20;
  if (name.includes(needle)) return 10;
  return 0;
}

async function fetchModels(): Promise<CatalogModel[]> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      `could not reach OpenRouter's model list: ${(e as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `OpenRouter model list returned ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as { data?: ApiModel[] };
  const data = Array.isArray(json.data) ? json.data : [];
  const models = data.filter((m): m is ApiModel & { id: string } => !!m.id);
  if (models.length === 0) {
    throw new Error("OpenRouter model list came back empty");
  }

  return models
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextLength: m.context_length ?? null,
      promptPrice: price(m.pricing?.prompt),
      completionPrice: price(m.pricing?.completion),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Prices arrive as strings, and "-1" means "ask the provider". */
function price(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
