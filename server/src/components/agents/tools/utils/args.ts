/** Keeps a runaway `<|GET_STORIES 100000|>` from dumping the whole table. */
export const MAX_ROWS = 100;

/**
 * A row count from the model's own text: it may write anything, so anything
 * that is not a sane positive number falls back to the tool's default.
 */
export function count(args: string[], fallback: number): number {
  const n = Number(args[0]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_ROWS);
}
