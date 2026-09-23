"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  shell,
  ipcMain,
  session,
} = require("electron");

const { loadConfig, saveConfig } = require("./config");
const { startServer } = require("./server");

// Keep the original Inkdrop-era library location so the rebrand never hides
// an existing manuscript or resets a desktop installation.
const libraryHome = path.join(app.getPath("appData"), "inkdrop-studio-desktop");
fs.mkdirSync(libraryHome, { recursive: true });
app.setPath("userData", libraryHome);
app.setName("Inkshore Studio");
app.setAppUserModelId("studio.inkshore.desktop");
app.setAboutPanelOptions({
  applicationName: "Inkshore Studio",
  applicationVersion: app.getVersion(),
  copyright: "Copyright © 2026 Aashish Kumar",
  authors: ["Aashish Kumar"],
  website: "https://github.com/AashishKumar-3002/inkdrop-studio",
  iconPath: path.join(__dirname, "../build/icons/icon.png"),
});

/** In a packaged app the server lives in resources; in dev it's the repo. */
function resolveServerDir() {
  const packaged = path.join(process.resourcesPath || "", "server");
  if (fs.existsSync(path.join(packaged, "server.js"))) return packaged;
  return path.join(__dirname, "..", "..", ".next", "standalone");
}

let mainWindow = null;
let serverChild = null;
const logLines = [];

function log(line) {
  logLines.push(line);
  if (logLines.length > 500) logLines.shift();
  if (process.env.INKSHORE_DEBUG || process.env.INKDROP_DEBUG) console.log("[server]", line);
}

function createWindow() {
  const win = new BrowserWindow({
    title: "Inkshore Studio",
    icon: path.join(__dirname, "../build/icons", process.platform === "win32" ? "icon.ico" : "icon.png"),
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    // The app paints its own chrome-coloured background; matching it here
    // avoids a white flash before the first frame.
    backgroundColor: "#fbfbfc",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Anything that isn't our own localhost origin opens in the real browser
  // rather than navigating the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    if (target.hostname !== "127.0.0.1") {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

/**
 * Exports are served as attachment downloads. In a browser that's a file in
 * the Downloads folder; in a desktop app the user expects a Save dialog, so
 * we intercept and drive it ourselves.
 */
function wireDownloads(ses) {
  ses.on("will-download", (event, item) => {
    const suggested = item.getFilename();
    const target = dialog.showSaveDialogSync(mainWindow, {
      title: "Save export",
      defaultPath: path.join(app.getPath("documents"), suggested),
    });
    if (!target) {
      item.cancel();
      return;
    }
    item.setSavePath(target);
    item.once("done", (_e, state) => {
      if (state === "completed") shell.showItemInFolder(target);
      else if (state !== "cancelled") {
        dialog.showErrorBox("Export failed", `Could not save ${suggested}.`);
      }
    });
  });
}

function buildMenu(appUrl) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.loadURL(`${appUrl}/dashboard`),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        ...(!isMac ? [{ label: "About Inkshore Studio", click: () => app.showAboutPanel() }] : []),
        { label: "Documentation", click: () => shell.openExternal("https://github.com/AashishKumar-3002/inkdrop-studio#readme") },
        { label: "Report an Issue", click: () => shell.openExternal("https://github.com/AashishKumar-3002/inkdrop-studio/issues") },
        { type: "separator" },
        {
          label: "Show Server Log",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              message: "Server log (most recent lines)",
              detail: logLines.slice(-40).join("\n") || "(empty)",
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Shown when the app can't start, instead of a blank window. */
function loadErrorScreen(win, message) {
  const html = `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font: 14px/1.6 ui-sans-serif, system-ui, sans-serif;
         background:#fbfbfc; color:#17171a; }
  @media (prefers-color-scheme: dark) { body { background:#0b0b0e; color:#f4f4f6; } }
  main { max-width: 460px; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 8px; letter-spacing:-0.02em; }
  p { margin: 0 0 12px; opacity: .75; }
  code { font: 12px ui-monospace, Menlo, monospace; background: rgba(127,127,127,.14);
         padding: 2px 6px; border-radius: 4px; }
</style>
<main>
  <h1>Inkshore couldn't start</h1>
  <p>${message}</p>
  <p>Your work is stored in this folder, and reopening the app is safe:</p>
  <p><code>${app.getPath("userData")}</code></p>
</main>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
}

async function boot() {
  const config = loadConfig();
  mainWindow = createWindow();
  wireDownloads(session.defaultSession);

  // No setup step: the app keeps its library in its own data folder and
  // creates it on first launch. Asking an author for a Postgres connection
  // string was the single worst thing about the previous build.
  const dataDir = path.join(app.getPath("userData"), "library");

  try {
    const started = await startServer({
      serverDir: resolveServerDir(),
      dataDir,
      config,
      onLog: log,
    });
    serverChild = started.child;
    buildMenu(started.url);
    await mainWindow.loadURL(started.url);
    await runSmokeTestIfRequested(started.url);
  } catch (err) {
    loadErrorScreen(mainWindow, String(err.message || err));
  }
}

/**
 * Headless smoke test for the shell, used by CI and by `npm run desktop:smoke`.
 * Set INKSHORE_SMOKE to a PNG path: the app loads, screenshots itself, writes
 * a short report and exits. Without the variable this is inert.
 */
async function runSmokeTestIfRequested(appUrl) {
  const out = process.env.INKSHORE_SMOKE || process.env.INKDROP_SMOKE;
  if (!out || !mainWindow) return;
  try {
    // Give the client bundle a beat to hydrate before capturing.
    await new Promise((r) => setTimeout(r, 4000));
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(out, image.toPNG());

    const title = await mainWindow.webContents.executeJavaScript("document.title");
    const desktopFlag = await mainWindow.webContents.executeJavaScript(
      "Boolean((window.inkshore && window.inkshore.isDesktop) || (window.inkdrop && window.inkdrop.isDesktop))"
    );
    console.log(
      JSON.stringify({ ok: true, url: appUrl, title, desktopBridge: desktopFlag, screenshot: out })
    );
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String(err.message || err) }));
  } finally {
    app.exit(0);
  }
}

ipcMain.handle("inkshore:getConfig", () => {
  const { authSecret, encryptionKey, ...safe } = loadConfig();
  return safe;
});
ipcMain.handle("inkshore:setDatabaseUrl", (_e, url) => {
  saveConfig({ databaseUrl: String(url || "") });
  return true;
});

// One instance only — two servers on two ports against one database would
// be confusing and would fight over sessions.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) boot();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    serverChild?.kill();
  });
}
