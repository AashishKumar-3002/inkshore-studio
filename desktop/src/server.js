"use strict";

/**
 * Boots the app's own Next.js server inside the desktop app.
 *
 * Running the real server locally — rather than bundling a static client and
 * talking to a remote API — means everything keeps working unchanged: session
 * cookies stay same-origin, there is no CORS, the Node-only export path
 * (pdfkit, epub-gen-memory) runs as it always has, and the Claude Agent SDK
 * runs natively inside the API route with no IPC bridge.
 */

const { fork } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

/** An OS-assigned free port, so two copies never collide. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Polls until the server answers, so the window never loads a dead port. */
async function waitForServer(url, { timeoutMs = 30000, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw new Error("Startup aborted");
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 307 || res.status === 401) return;
      if (res.status === 503) {
        const body = await res.json().catch(() => null);
        if (body?.database === "down") {
          throw new Error("The app server started, but could not open the database. Check the server log for details.");
        }
      }
    } catch (error) {
      if (error?.message?.includes("could not open the database")) throw error;
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`The app server did not start within ${timeoutMs / 1000}s`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Applies pending migrations to the local database and waits for it to
 * finish. Done before the server starts, not lazily on first query: a
 * half-migrated schema under a live server produces failures that only
 * reproduce on someone else's machine.
 */
function migrateLocalDb({ root, dataDir, onLog }) {
  const runner = path.join(root, "migrate-local.mjs");
  const migrations = path.join(root, "drizzle");
  if (!fs.existsSync(runner) || !fs.existsSync(migrations)) {
    throw new Error(
      "This build is missing its database migrations. Run `npm run desktop:prepare`."
    );
  }
  return new Promise((resolve, reject) => {
    const child = fork(runner, [dataDir, migrations], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout?.on("data", (d) => onLog(String(d).trimEnd()));
    child.stderr?.on("data", (d) => onLog(String(d).trimEnd()));
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Could not open your library (migration exit ${code}).`))
    );
  });
}

/**
 * @param {object} opts
 * @param {string} opts.serverDir  directory containing Next's standalone server.js
 * @param {string} opts.dataDir    directory for this install's local database
 * @param {object} opts.config     persisted per-install config
 * @param {(line: string) => void} [opts.onLog]
 */
async function startServer({ serverDir, dataDir, config, onLog = () => {} }) {
  const port = await findFreePort();
  // Absolute: fork() resolves a relative entry against `cwd`, which is the
  // server directory itself — a relative path would resolve twice.
  const root = path.resolve(serverDir);
  const entry = path.join(root, "server.js");

  // A remote Postgres is still allowed — someone pointing the app at their
  // own server, or a future hosted mode — but it is opt-in. Left alone, the
  // app keeps its library in its own data folder and asks the user nothing.
  const remote = config.databaseUrl || "";
  if (!remote) await migrateLocalDb({ root, dataDir, onLog });

  const child = fork(entry, [], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      // Tells the app it's running inside the desktop shell, which is what
      // unlocks the Claude subscription provider.
      INKSHORE_DESKTOP: "1",
      // Exactly one of these is set. INKSHORE_DB_DIR selects the embedded
      // PGlite database; DATABASE_URL selects a Postgres server.
      INKSHORE_DB_DIR: remote ? "" : dataDir,
      DATABASE_URL: remote,
      DATABASE_SSL: config.databaseSsl ? "true" : "false",
      AUTH_SECRET: config.authSecret,
      ENCRYPTION_KEY: config.encryptionKey,
      AUTH_URL: `http://127.0.0.1:${port}`,
      AUTH_TRUST_HOST: "true",
    },
  });

  child.stdout?.on("data", (d) => onLog(String(d).trimEnd()));
  child.stderr?.on("data", (d) => onLog(String(d).trimEnd()));

  const url = `http://127.0.0.1:${port}`;
  const exited = new Promise((_, reject) => {
    child.once("exit", (code) =>
      reject(new Error(`The app server exited early (code ${code}).`))
    );
  });

  // Whichever settles first: a live server, or a crashed child.
  try {
    await Promise.race([waitForServer(`${url}/api/health`), exited]);
  } catch (error) {
    child.kill();
    throw error;
  }

  return { child, url, port };
}

module.exports = { startServer, findFreePort, waitForServer };
