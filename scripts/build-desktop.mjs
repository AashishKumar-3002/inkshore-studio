/**
 * Assembles the desktop bundle.
 *
 * Next's `output: "standalone"` emits a server that expects `.next/static`
 * and `public/` to sit beside it — the build does not copy them itself. The
 * Dockerfile does this by hand too; this script is the desktop equivalent,
 * so `npm run desktop` and `docker build` can't drift apart.
 */
import { cp, rm, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(path.join(standalone, "server.js")))) {
  console.error(
    "No standalone build found. Run `npm run build` first (next.config.ts sets output: 'standalone')."
  );
  process.exit(1);
}

for (const [from, to] of [
  [path.join(root, ".next", "static"), path.join(standalone, ".next", "static")],
  [path.join(root, "public"), path.join(standalone, "public")],
]) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  console.log(`copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

// The migration files and the runner that applies them. A desktop install
// creates its database on first launch, so these ship with the app rather
// than being a developer-only concern.
for (const [from, to] of [
  [path.join(root, "drizzle"), path.join(standalone, "drizzle")],
  [
    path.join(root, "scripts", "migrate.mjs"),
    path.join(standalone, "migrate.mjs"),
  ],
  [path.join(root, "scripts", "lib"), path.join(standalone, "lib")],
]) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  console.log(`copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

// PGlite carries a WASM payload that Next's tracer resolves inconsistently,
// and the Agent SDK is an optional dependency it may skip entirely. Both
// have to be present at runtime, so copy them in rather than hope.
const pglite = path.join(root, "node_modules", "@electric-sql", "pglite");
const pgliteDest = path.join(standalone, "node_modules", "@electric-sql", "pglite");
if ((await exists(pglite)) && !(await exists(pgliteDest))) {
  await cp(pglite, pgliteDest, { recursive: true });
  console.log("copied @electric-sql/pglite into the standalone bundle");
}

const sdk = path.join(root, "node_modules", "@anthropic-ai", "claude-agent-sdk");
const sdkDest = path.join(standalone, "node_modules", "@anthropic-ai", "claude-agent-sdk");
if ((await exists(sdk)) && !(await exists(sdkDest))) {
  await cp(sdk, sdkDest, { recursive: true });
  console.log("copied @anthropic-ai/claude-agent-sdk into the standalone bundle");
}

// The SDK resolves a platform-specific CLI package at runtime.
for (const name of ["codex-sdk", "codex", `codex-${process.platform}-${process.arch}`]) {
  const source = path.join(root, "node_modules", "@openai", name);
  const target = path.join(standalone, "node_modules", "@openai", name);
  if (!(await exists(source))) throw new Error(`Missing @openai/${name}; install desktop runtime dependencies.`);
  await cp(source, target, { recursive: true });
}
console.log("desktop bundle ready");
