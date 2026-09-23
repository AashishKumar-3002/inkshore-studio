/** Exercise the same migration and server startup path as Electron, without a GUI. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const { startServer } = require("../desktop/src/server.js");
const dataDir = await mkdtemp(path.join(tmpdir(), "inkshore-desktop-smoke-"));
let child;
try {
  const started = await startServer({
    serverDir: path.resolve(process.argv[2] ?? ".next/standalone"),
    dataDir,
    config: { authSecret: randomBytes(32).toString("hex"), encryptionKey: randomBytes(32).toString("hex") },
    onLog: line => console.log(line),
  });
  child = started.child;
  const response = await fetch(`${started.url}/api/projects`);
  assert.equal(response.status, 200, "A fresh desktop library must work without login");
  assert.deepEqual(await response.json(), [], "The smoke library must start empty");
  console.log("Desktop server smoke check passed.");
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await rm(dataDir, { recursive: true, force: true });
}
