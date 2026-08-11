export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type Job = {
  id: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: unknown;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewJob = {
  type: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  /** Delay before the job becomes runnable. */
  delayMs?: number;
};

/**
 * Jobs a handler wants enqueued. They are committed in the same transaction
 * that marks the current job succeeded, so a chain can never half-happen.
 */
export type HandlerResult = {
  result?: Record<string, unknown>;
  enqueue?: NewJob[];
};

export type HandlerContext = {
  job: Job;
  log: (message: string) => void;
};

export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: HandlerContext,
) => Promise<HandlerResult | void>;
