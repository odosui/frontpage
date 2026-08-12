/**
 * How long to wait for a model response. Generous by default: jobs run in the
 * background now, so a slow answer costs latency, not a failed request.
 */
export const AI_TIMEOUT_MS = Number(
  process.env.FRONTPAGE_AI_TIMEOUT_MS || 120_000,
);
