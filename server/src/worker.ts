import { describeDatabase } from "./db/config";
import { migrateUp } from "./db/migrator";
import { startWorker } from "./jobs/worker";

async function main() {
  console.log(`Using database ${describeDatabase()}`);
  if (process.env.FRONTPAGE_AUTO_MIGRATE !== "false") {
    await migrateUp();
  }
  await startWorker();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
