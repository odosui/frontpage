/**
 * The parts of downloading a document that a front page and a feed share:
 * conditional requests, a capped read, and charset handling. What differs is
 * only what we accept and what we do with the body.
 */
import { PermanentError } from "../utils/errors";

/** Stop reading a response past this much decompressed body. */
const MAX_DOWNLOAD_BYTES = 3_000_000;

/**
 * Hyphenated, and without the repo path, on purpose: stock WAF rulesets carry a
 * signature for the old Microsoft FrontPage authoring client, so any UA holding
 * the literal "frontpage" is a 403 at Gizmodo and friends — the repo url alone
 * was enough to trip it.
 */
const USER_AGENT = "Front-Page-Bot/1.0 (+https://github.com/odosui)";

/**
 * Statuses a retry cannot change. 401 and 403 are how a bot wall answers —
 * rbc.ru sits behind Qrator, which 401s every request that has not run its
 * javascript, homepage included — and 404/410/451 mean the document is not
 * there to be had. A 429 is deliberately not here: that one does clear.
 */
const BLOCKED = new Set([401, 403, 404, 410, 451]);

function explain(status: number): string {
  if (status === 401 || status === 403) {
    return (
      "the site is refusing automated requests, usually a javascript bot " +
      "challenge we cannot answer. Where the source is a feed that carries " +
      "its articles in full, the text is taken from there instead"
    );
  }
  if (status === 451) return "the document is blocked for legal reasons";
  return "the document is gone";
}

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
    const what = `fetch ${url} returned ${res.status} ${res.statusText}`.trim();
    if (BLOCKED.has(res.status)) {
      throw new PermanentError(
        `${what} — ${explain(res.status)}. Retrying sends the same request, ` +
          `so this one is not retried.`,
      );
    }
    throw new Error(what);
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
