"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * The only bridge between the page and the shell. Deliberately tiny: the app
 * is a normal web app talking to its own local server, so it needs almost
 * nothing from Electron. `isDesktop` lets the UI show desktop-only affordances
 * such as Claude subscription mode.
 */
const bridge = {
  isDesktop: true,
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke("inkshore:getConfig"),
  setDatabaseUrl: (url) => ipcRenderer.invoke("inkshore:setDatabaseUrl", url),
};

contextBridge.exposeInMainWorld("inkshore", bridge);
// Keep the old bridge for installed clients whose cached web bundle still
// expects it during an in-place upgrade.
contextBridge.exposeInMainWorld("inkdrop", bridge);
