'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function isTunnelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.com$/.test(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}
function validateOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid project options.');
  if (Object.keys(value).some(key => !['service', 'containerPort'].includes(key))) throw new Error('Unexpected project option.');
  const result = {};
  if (value.service !== undefined && value.service !== '') {
    if (typeof value.service !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value.service)) throw new Error('Choose a valid Compose service.');
    result.service = value.service;
  }
  if (value.containerPort !== undefined && value.containerPort !== '') {
    if (!['string', 'number'].includes(typeof value.containerPort)) throw new Error('Invalid container port.');
    const port = Number(value.containerPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Container port must be between 1 and 65535.');
    result.containerPort = port;
  }
  return result;
}
const SAVE_TYPES = { json: 'JSON', csv: 'CSV', md: 'Markdown', txt: 'Text' };
function validateSave(name, content) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(name) || name.includes('..')) throw new Error('Invalid file name.');
  const ext = name.split('.').pop().toLowerCase();
  if (!SAVE_TYPES[ext]) throw new Error('Unsupported file type.');
  if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) throw new Error('Invalid file content.');
  return { name, ext, content };
}
const LINK_PREFIXES = ['https://github.com/Ding-Ding-Projects/tunnel-app-deployer', 'https://ding-ding-projects.github.io/tunnel-app-deployer', 'https://developers.cloudflare.com/tunnel/'];
function isAllowedLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const plain = url.origin + url.pathname;
    return LINK_PREFIXES.some(prefix => plain === prefix || plain.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
  } catch { return false; }
}
function readBuildInfo(file) {
  try {
    const data = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    return { version: typeof data.version === 'string' ? data.version : null, buildTime: typeof data.buildTime === 'string' && !isNaN(Date.parse(data.buildTime)) ? data.buildTime : null, commit: typeof data.commit === 'string' && /^[0-9a-f]{40}$/.test(data.commit) ? data.commit : null };
  } catch { return null; }
}
function validSender(event, window, pageUrl) {
  return !!window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pageUrl;
}
async function start() {
  const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
  const { createHostManager } = require('./backend');
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  await app.whenReady();
  const manager = createHostManager({ stateDir: path.join(app.getPath('userData'), 'hosting') });
  const page = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
  let window, source, pending, aborter, closing = false, stopping, selecting = false;
  const broadcast = payload => { if (window && !window.isDestroyed()) window.webContents.send('host:progress', payload); };
  const handle = (name, handler) => ipcMain.handle(name, async (event, ...args) => {
    if (!validSender(event, window, page)) throw new Error('Untrusted request.');
    return handler(...args);
  });
  const stop = async () => {
    if (stopping) return stopping;
    stopping = (async () => {
      aborter?.abort();
      if (pending) await pending.catch(() => {});
      await manager.stop();
      return manager.status();
    })();
    try { return await stopping; } finally { stopping = undefined; }
  };
  handle('host:prerequisites', () => manager.prerequisites());
  handle('host:status', () => manager.status());
  handle('host:select', async kind => {
    if (!['dockerfile', 'compose'].includes(kind)) throw new Error('Unknown project type.');
    if (pending || stopping || selecting) throw new Error('Wait for the current operation to finish.');
    const current = await manager.status();
    if (!['idle', 'error'].includes(current.phase)) throw new Error('Stop sharing before selecting another project.');
    selecting = true;
    try {
    const result = await dialog.showOpenDialog(window, {
      title: kind === 'compose' ? 'Choose a Compose file' : 'Choose a Dockerfile',
      properties: ['openFile'],
      filters: kind === 'compose' ? [{ name: 'Compose YAML', extensions: ['yml', 'yaml'] }] : [{ name: 'All files', extensions: ['*'] }]
    });
    if (result.canceled) return null;
    const selected = result.filePaths[0];
    source = kind === 'compose' ? { kind, composePath: selected } : { kind, contextPath: path.dirname(selected), dockerfilePath: selected };
    return { source, inspection: await manager.inspectSource(source) };
    } finally { selecting = false; }
  });
  handle('host:start', async options => {
    if (!source) throw new Error('Choose a project first.');
    if (pending || stopping || selecting) throw new Error('A hosting operation is already in progress.');
    const input = { ...source, ...validateOptions(options) };
    aborter = new AbortController();
    pending = Promise.resolve().then(() => manager.host(input, { signal: aborter.signal, onProgress: broadcast }));
    try { return await pending; } finally { pending = undefined; aborter = undefined; }
  });
  handle('host:stop', stop);
  const verifiedUrl = async () => {
    const status = await manager.status();
    if ((status.phase !== 'ready' || status.verified !== true) || !isTunnelUrl(status.publicUrl)) throw new Error('No verified public link is currently available.');
    return status.publicUrl;
  };
  const build = readBuildInfo(path.join(__dirname, 'build-info.json'));
  handle('app:info', () => ({ version: build?.version || app.getVersion(), buildTime: build?.buildTime || null, commit: build?.commit || null }));
  handle('app:copy-text', text => { if (typeof text !== 'string' || text.length > 20000) throw new Error('Invalid text.'); clipboard.writeText(text); return true; });
  handle('app:set-title', title => { if (typeof title !== 'string' || title.length > 80) throw new Error('Invalid title.'); window.setTitle(title.trim() || 'Tunnel App Deployer'); return true; });
  handle('app:open-link', async url => { if (!isAllowedLink(url)) throw new Error('This link cannot be opened.'); await shell.openExternal(url); return true; });
  handle('app:save', async (name, content) => {
    const file = validateSave(name, content);
    const result = await dialog.showSaveDialog(window, { defaultPath: path.join(app.getPath('documents'), file.name), filters: [{ name: SAVE_TYPES[file.ext], extensions: [file.ext] }] });
    if (result.canceled || !result.filePath) return false;
    await require('node:fs/promises').writeFile(result.filePath, file.content, 'utf8');
    return true;
  });
  handle('host:copy', async () => { clipboard.writeText(await verifiedUrl()); return true; });
  handle('host:open', async () => { await shell.openExternal(await verifiedUrl()); return true; });
  const createWindow = () => {
    window = new BrowserWindow({ width: 1120, height: 800, minWidth: 460, minHeight: 620, backgroundColor: '#0e1513', title: 'Tunnel App Deployer',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.loadURL(page);
    window.on('close', event => { if (!closing) { event.preventDefault(); app.quit(); } });
  };
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on('before-quit', event => {
    if (closing) return;
    event.preventDefault();
    broadcast({ phase: 'stopping', message: 'Stopping sharing before closing…' });
    stop().then(() => { closing = true; app.quit(); }).catch(error => {
      dialog.showErrorBox('Could not finish cleanup', `${error.message}\nPlease stop the application resources in Docker before closing.`);
    });
  });
  createWindow();
}
if (require.main === module || (process.versions.electron && process.type === 'browser')) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { isTunnelUrl, validateOptions, validSender, validateSave, isAllowedLink, readBuildInfo };
