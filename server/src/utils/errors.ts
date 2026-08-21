/**
 * A failure the same request will keep producing: a page behind a bot
 * challenge, a url that is gone, a document with no article in it. The worker
 * parks these on the first attempt instead of spending the job's retries
 * re-asking a question already answered.
 *
 * Everything else — a timeout, a 5xx, a rate limit — stays retryable, which is
 * what the backoff is for.
 */
export class PermanentError extends Error {}
