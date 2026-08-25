import { describeDatabase } from "../db/config";
import { closePool } from "../db/pool";
import { refreshAll } from "../components/sources/refresh";

const USAGE = `usage: sources <command>

commands:
  refresh    queue a fetch for every source
`;

/**
 * The scheduled refresh, for cron. It only queues: the worker does the
 * fetching, so this exits in a moment however much there is to read, and two
 * overlapping runs cost nothing worse than a few duplicate jobs.
 */
async function main() {
  const [command = ""] = process.argv.slice(2);

  switch (command) {
    case "refresh": {
      console.log(`[refresh] ${describeDatabase()}`);
      const { queued, skipped } = await refreshAll();
      console.log(`[refresh] queued ${queued} source${queued === 1 ? "" : "s"}`);
      for (const s of skipped) {
        console.log(`[refresh] skipped ${s.id}: ${s.reason}`);
      }
      break;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
