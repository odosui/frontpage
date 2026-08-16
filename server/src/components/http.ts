/**
 * The parts of downloading a document that a front page and a feed share:
 * conditional requests, a capped read, and charset handling. What differs is
 * only what we accept and what we do with the body.
 */

/** Stop reading a response past this much decompressed body. */
const MAX_DOWNLOAD_BYTES = 3_000_000;

/**
 * Hyphenated, and without the repo path, on purpose: stock WAF rulesets carry a
 * signature for the old Microsoft FrontPage authoring client, so any UA holding
 * the literal "frontpage" is a 403 at Gizmodo and friends — the repo url alone
 * was enough to trip it.
 */
const USER_AGENT = "Front-Page-Bot/1.0 (+https://github.com/odosui)";

/** HTTP validators, so the next fetch can ask for a 304 instead of a body. */
export type FetchValidators = {
  etag?: string | null;
  lastModified?: string | null;
};

export type RequestOptions = {
  /** Sent as Accept, and matched against the response's content-type. */
  accept: string;
  /** Content types this caller can actually parse. */
  allowedTypes: RegExp;
  validators?: FetchValidators | undefined;
};

/**
 * A conditional GET. A 304 comes back as-is — the caller decides what an
 * unchanged document means — and anything else that isn't usable throws.
 */
export async function requestDocument(
  url: string,
  options: RequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: options.accept,
  };
  if (options.validators?.etag) {
    headers["If-None-Match"] = options.validators.etag;
  }
  if (options.validators?.lastModified) {
    headers["If-Modified-Since"] = options.validators.lastModified;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 304) return res;

  if (!res.ok) {
    throw new Error(`fetch ${url} returned ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !options.allowedTypes.test(contentType)) {
    throw new Error(
      `fetch ${url} returned unexpected content (${contentType})`,
    );
  }

  return res;
}

/**
 * Read the body but stop at MAX_DOWNLOAD_BYTES — a runaway document shouldn't
 * be able to exhaust memory, and we only ever look at the first slice anyway.
 */
export async function readCapped(res: Response): Promise<string> {
  const charset =
    /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ??
    "utf-8";

  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_DOWNLOAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}
