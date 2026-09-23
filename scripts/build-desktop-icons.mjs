/** Render the vector brand source and export checked-in platform icons. */
import { createRequire } from "node:module";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(new URL("../desktop/package.json", import.meta.url));
const { convertIcon } = require("app-builder-lib/out/util/iconConverter.js");
const root = path.resolve("desktop/build/icons");
const appSource = path.join(root, "source.svg");

// Keep the browser mark and native app icon derived from editable vector
// sources. Sharp is installed with Next and renders the SVG consistently on
// every release runner.
await sharp(appSource).resize(1024, 1024).png().toFile(path.join(root, "icon.png"));
await sharp(path.resolve("public/logo.svg"))
  .resize(1024, 1024)
  .png()
  .toFile(path.resolve("public/logo.png"));

for (const format of ["ico", "icns", "set"]) {
  const result = await convertIcon({
    sources: [path.join(root, format === "set" ? "icon.icns" : "icon.png")], fallbackSources: [], roots: [root], format,
    outDir: format === "set" ? path.join(root, "png") : root,
  });
  if (!result.icons.length || result.isFallback) throw new Error(`Could not export ${format} icons`);
  console.log(`Exported ${format} icons`);
}

await copyFile(path.join(root, "icon.ico"), path.resolve("src/app/favicon.ico"));
