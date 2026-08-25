import { closePool } from "../db/pool";
import { describeDatabase } from "../db/config";
import * as users from "../models/users";

const USAGE = `usage: user <command>

commands:
  create <email> <password>   add an account
  passwd <email> <password>   change an account's password
  list                        show every account
  delete <email>              remove an account
`;

async function main() {
  const [command = "", ...args] = process.argv.slice(2);

  switch (command) {
    case "create": {
      const { email, password } = credentials(args);
      const user = await users.create(email, password);
      console.log(`[user] ${describeDatabase()}`);
      console.log(`created ${user.email} (id ${user.id})`);
      break;
    }

    case "passwd": {
      const { email, password } = credentials(args);
      const found = await users.byEmailWithHash(email);
      if (!found) throw new Error(`no account for ${email}`);
      await users.setPassword(found.user.id, password);
      console.log(`password changed for ${found.user.email}`);
      break;
    }

    case "list": {
      const all = await users.all();
      if (all.length === 0) {
        console.log("no accounts yet — `npm run user:create -- <email> <password>`");
      }
      for (const user of all) {
        console.log(`  ${user.id}  ${user.email}  ${user.createdAt}`);
      }
      break;
    }

    case "delete": {
      const email = users.normalizeEmail(args[0] ?? "");
      if (!email) throw new Error("an email is required");
      const found = await users.byEmailWithHash(email);
      if (!found) throw new Error(`no account for ${email}`);
      await users.remove(found.user.id);
      console.log(`deleted ${found.user.email}`);
      break;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

function credentials(args: string[]) {
  const email = (args[0] ?? "").trim();
  const password = args[1] ?? "";
  if (!email.includes("@")) throw new Error("an email address is required");
  if (password.length < 8) {
    throw new Error("the password must be at least 8 characters");
  }
  return { email, password };
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
