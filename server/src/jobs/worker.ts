import os from "os";
import { closePool } from "../db/pool";
import { handlers } from "./handlers";
import * as queue from "./queue";
import { Job } from "./types";

const POLL_MS = Number(process.env.FRONTPAGE_WORKER_POLL_MS || 1000);
const CONCURRENCY = Number(process.env.FRONTPAGE_WORKER_CONCURRENCY || 5);
/** A job whose worker went away this long ago is considered abandoned. */
const STALE_MS = Number(process.env.FRONTPAGE_WORKER_STALE_MS || 5 * 60_000);
/** Finished jobs and their snapshots are kept this long. */
const RETENTION_MS = Number(
  process.env.FRONTPAGE_JOB_RETENTION_MS || 7 * 24 * 60 * 60_000,
);
const SWEEP_MS = 60_000;

const WORKER_ID = `${os.hostname()}:${process.pid}`;

/** Retry delay for attempt N: 5s, 25s, 125s… capped at 10 minutes. */
function backoffMs(attempts: number): number {
  return Math.min(5_000 * 5 ** (attempts - 1), 10 * 60_000);
}

async function runJob(job: Job) {
  const handler = handlers[job.type];
  const started = Date.now();
  const log = (message: string) =>
    console.log(`[job ${job.id}] ${job.type}: ${message}`);

  if (!handler) {
    await queue.fail(job.id, `unknown job type "${job.type}"`, 0);
    console.error(`[job ${job.id}] unknown type "${job.type}"`);
    return;
  }

  log(`start (attempt ${job.attempts}/${job.maxAttempts})`);

  try {
    const outcome = (await handler(job.payload, { job, log })) || {};
    const followUps = await queue.succeed(
      job.id,
      outcome.result,
      outcome.enqueue ?? [],
    );
    const chained = followUps.length
      ? ` → queued ${followUps.map((f) => `${f.type}#${f.id}`).join(", ")}`
      : "";
    log(`done in ${Date.now() - started}ms${chained}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = await queue.fail(job.id, message, backoffMs(job.attempts));
    const outcome =
      status === "queued"
        ? `will retry in ${Math.round(backoffMs(job.attempts) / 1000)}s`
        : "giving up";
    console.error(
      `[job ${job.id}] ${job.type} failed after ${Date.now() - started}ms (${outcome}): ${message}`,
    );
  }
}

export async function startWorker() {
  console.log(
    `Worker ${WORKER_ID} started (concurrency: ${CONCURRENCY}, poll: ${POLL_MS}ms)`,
  );

  let running = true;
  const inFlight = new Set<Promise<void>>();

  const shutdown = (signal: string) => {
    if (!running) return;
    running = false;
    console.log(`Worker got ${signal}, finishing ${inFlight.size} job(s)…`);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  let lastSweep = 0;

  while (running) {
    if (Date.now() - lastSweep > SWEEP_MS) {
      lastSweep = Date.now();
      try {
        const requeued = await queue.requeueStale(STALE_MS);
        if (requeued > 0)
          console.log(`[sweep] requeued ${requeued} stale job(s)`);
        const pruned = await queue.prune(RETENTION_MS);
        if (pruned > 0) console.log(`[sweep] pruned ${pruned} old job(s)`);
      } catch (e) {
        console.error("[sweep] failed:", e);
      }
    }

    if (inFlight.size >= CONCURRENCY) {
      await Promise.race(inFlight);
      continue;
    }

    let job: Job | null = null;
    try {
      job = await queue.claim(WORKER_ID);
    } catch (e) {
      console.error("[worker] claim failed:", e);
      await sleep(POLL_MS);
      continue;
    }

    if (!job) {
      await sleep(POLL_MS);
      continue;
    }

    const task = runJob(job).finally(() => inFlight.delete(task));
    inFlight.add(task);
  }

  await Promise.allSettled(inFlight);
  await closePool();
  console.log("Worker stopped");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
