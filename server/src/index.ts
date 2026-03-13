import { startServer } from "./server";
import { parseArgs } from "./utils/cmd";

const MT_HOME_GLAF = "mt-home";

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const mtHome: string = parsed[MT_HOME_GLAF] || process.env.MT_HOME;
  startServer(mtHome);
}

main();
