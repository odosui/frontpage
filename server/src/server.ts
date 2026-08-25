import bodyParser from "body-parser";
import express, { Express, Request, Response } from "express";
import path from "path";
import { createApi } from "./api/api";
import { authenticate } from "./api/auth";
import { createRoutes } from "./api/routes";
import { sessionSecret } from "./components/auth/session";
import { describeDatabase } from "./db/config";
import { migrateUp } from "./db/migrator";

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.FRONTPAGE_PORT || 3000;

export async function startServer() {
  const app = express();

  app.use(bodyParser.json());

  // fail at boot rather than on the first login attempt
  sessionSecret();

  console.log(`Using database ${describeDatabase()}`);
  if (process.env.FRONTPAGE_AUTO_MIGRATE !== "false") {
    await migrateUp();
  }

  // allow CORS (only in development)
  if (NODE_ENV === "development") {
    applyDevCors(app);
  }

  // init out app
  const routes = createRoutes(await createApi());

  for (const m of routes) {
    const method = m.method.toLowerCase() as keyof Express;

    app[method](m.path, async (req: Request, res: Response) => {
      // the gate: a route says `public` or it needs a session, and there is
      // nothing in between
      let userId = 0;
      if (!m.public) {
        const user = await authenticate(req.headers.cookie);
        if (!user) {
          res.status(401).json({ error: "not signed in" });
          return;
        }
        userId = user.id;
      }

      const { status, json, cookie } = await m.handler({
        pathParams: req.params as Record<string, string>,
        query: req.query as Record<string, string>,
        body: req.body,
        userId,
      });
      if (cookie) res.setHeader("Set-Cookie", cookie);
      res.status(status).json(json);
    });
  }

  // serve static files in production
  if (NODE_ENV === "production") {
    const clientBuildPath = path.join(__dirname, "../../client/dist");
    app.use(express.static(clientBuildPath));

    // handle SPA routing - all non-API routes return index.html
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientBuildPath, "index.html"));
    });
  }

  // start the server
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} (${NODE_ENV} mode)`);
  });
}

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function applyDevCors(app: Express) {
  app.use((req, res, next) => {
    // vite picks a free port, so accept any localhost origin
    const origin = req.headers.origin;
    if (origin && LOCALHOST_ORIGIN.test(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, PUT, OPTIONS, DELETE",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  });
}
