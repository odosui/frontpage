/**
 * Per-token prices straight from OpenRouter, so a model comparison can put a
 * dollar figure next to the quality numbers. Fetched once and cached — the
 * catalogue is ~1MB and changes far slower than a benchmark run.
 */
export type ModelPrice = {
  /** USD per million prompt tokens. */
  prompt: number;
  /** USD per million completion tokens. */
  completion: number;
};

let cache: Map<string, ModelPrice> | null = null;

export async function loadPrices(): Promise<Map<string, ModelPrice>> {
  if (cache) return cache;

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter model list failed (${res.status})`);
  }

  const json = (await res.json()) as {
    data: { id: string; pricing?: { prompt?: string; completion?: string } }[];
  };

  cache = new Map(
    json.data.map((m) => [
      m.id,
      {
        prompt: Number(m.pricing?.prompt ?? 0) * 1e6,
        completion: Number(m.pricing?.completion ?? 0) * 1e6,
      },
    ]),
  );
  return cache;
}

/** USD for one call. Null when the model is not in the catalogue. */
export function costOf(
  prices: Map<string, ModelPrice>,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const price = prices.get(model);
  if (!price) return null;
  return (
    (promptTokens * price.prompt) / 1e6 +
    (completionTokens * price.completion) / 1e6
  );
}
