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
const SAVE_TYPES = { json: 'JSON', csv: 'CSV', tsv: 'Tab-separated values', md: 'Markdown', txt: 'Text' };
function validateSave(name, content) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(name) || name.includes('..')) throw new Error('Invalid file name.');
  const ext = name.split('.').pop().toLowerCase();
  if (!SAVE_TYPES[ext]) throw new Error('Unsupported file type.');
  if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) throw new Error('Invalid file content.');
  return { name, ext, content };
}
const LINK_PREFIXES = ['https://github.com/Ding-Ding-Projects/dim-sum-photos', 'https://github.com/Ding-Ding-Projects/tunnel-app-deployer', 'https://ding-ding-projects.github.io/tunnel-app-deployer', 'https://developers.cloudflare.com/tunnel/', 'https://code.visualstudio.com/'];
function isAllowedLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const plain = url.origin + url.pathname;
    return LINK_PREFIXES.some(prefix => plain === prefix || plain.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
  } catch { return false; }
}
// Finds Visual Studio Code installs without running anything: per-user, machine, Insiders and PATH entries.
function detectEditors({ platform = process.platform, env = process.env, exists = p => require('node:fs').existsSync(p) } = {}) {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const candidates = [];
  if (platform === 'win32') {
    for (const [base, folder, exe, name] of [[env.LOCALAPPDATA, 'Programs/Microsoft VS Code', 'Code.exe', 'Visual Studio Code'], [env.ProgramFiles, 'Microsoft VS Code', 'Code.exe', 'Visual Studio Code'], [env.LOCALAPPDATA, 'Programs/Microsoft VS Code Insiders', 'Code - Insiders.exe', 'Visual Studio Code Insiders']]) if (base) candidates.push({ name, path: join(base, folder, exe) });
    for (const dir of String(env.PATH || env.Path || '').split(';').filter(Boolean)) if (/[\\/]bin$/i.test(dir) && exists(join(dir, 'code.cmd'))) candidates.push({ name: 'Visual Studio Code', path: join(dir, '..', 'Code.exe') });
  } else {
    if (platform === 'darwin') candidates.push({ name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' });
    candidates.push({ name: 'Visual Studio Code', path: '/usr/share/code/code' }, { name: 'Visual Studio Code', path: '/usr/bin/code' }, { name: 'Visual Studio Code', path: '/snap/bin/code' });
    for (const dir of String(env.PATH || '').split(':').filter(Boolean)) candidates.push({ name: 'Visual Studio Code', path: join(dir, 'code') });
  }
  const seen = new Set();
  return candidates.filter(c => { const key = path.normalize(c.path).toLowerCase(); if (seen.has(key) || !exists(c.path)) return false; seen.add(key); return true; });
}
// Squirrel.Windows runs the app with these flags during install, update and uninstall.
function squirrelCommand(argv, execPath) {
  const cmd = argv[1];
  if (typeof cmd !== 'string' || !cmd.startsWith('--squirrel-')) return null;
  const update = path.win32.resolve(path.win32.dirname(execPath), '..', 'Update.exe'), exe = path.win32.basename(execPath);
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated') return { update, args: ['--createShortcut', exe], quit: true };
  if (cmd === '--squirrel-uninstall') return { update, args: ['--removeShortcut', exe], quit: true };
  if (cmd === '--squirrel-obsolete') return { quit: true };
  return { quit: false };
}
const UPDATE_FEED = 'https://github.com/Ding-Ding-Projects/tunnel-app-deployer/releases/latest/download';
const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
function readBuildInfo(file) {
  try {
    const data = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    const c = data.codeName;
    const codeName = c && typeof c.en === 'string' && typeof c.zhHant === 'string' && /^hk-dish-\d+$/.test(c.id || '') && /^https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\//.test(c.photo || '') ? { id: c.id, en: c.en.slice(0, 120), zhHant: c.zhHant.slice(0, 60), photo: c.photo } : null;
    return { version: typeof data.version === 'string' ? data.version : null, buildTime: typeof data.buildTime === 'string' && !isNaN(Date.parse(data.buildTime)) ? data.buildTime : null, commit: typeof data.commit === 'string' && /^[0-9a-f]{40}$/.test(data.commit) ? data.commit : null, codeName };
  } catch { return null; }
}
function validSender(event, window, pageUrl) {
  return !!window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pageUrl;
}
async function start() {
  const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
  const { createHostManager } = require('./backend');
  if (process.platform === 'win32') {
    const squirrel = squirrelCommand(process.argv, process.execPath);
    if (squirrel?.update) require('node:child_process').spawn(squirrel.update, squirrel.args, { detached: true, stdio: 'ignore' }).unref();
    if (squirrel?.quit) { setTimeout(() => app.quit(), 1000); return; }
  }
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
  handle('app:info', () => ({ version: build?.version || app.getVersion(), buildTime: build?.buildTime || null, commit: build?.commit || null, codeName: build?.codeName || null }));
  // Updates: Squirrel.Windows checks the unsigned feed, verifies the package hash from RELEASES,
  // stages the update and reports each state; installing waits for the person to choose it.
  const { autoUpdater, net } = require('electron');
  const installed = process.platform === 'win32' && app.isPackaged && require('node:fs').existsSync(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'));
  const updates = { state: installed ? 'idle' : 'unavailable', version: null, notesUrl: null, error: null, checkedAt: null };
  const sendUpdate = () => { if (window && !window.isDestroyed()) window.webContents.send('app:update', { ...updates }); };
  const setUpdate = patch => { Object.assign(updates, patch); sendUpdate(); };
  const latestRelease = async () => { try { const r = await net.fetch('https://api.github.com/repos/Ding-Ding-Projects/tunnel-app-deployer/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) return null; const j = await r.json(); return { version: String(j.tag_name || '').replace(/^v/, ''), notesUrl: isAllowedLink(j.html_url) ? j.html_url : null }; } catch { return null; } };
  const checkUpdates = () => { if (!installed || ['checking', 'downloading', 'ready'].includes(updates.state)) return { ...updates }; setUpdate({ state: 'checking', error: null }); try { autoUpdater.checkForUpdates(); } catch (e) { setUpdate({ state: 'failed', error: e.message }); } return { ...updates }; };
  if (installed) {
    autoUpdater.setFeedURL({ url: UPDATE_FEED });
    autoUpdater.on('update-available', () => setUpdate({ state: 'downloading' }));
    autoUpdater.on('update-not-available', () => setUpdate({ state: 'current', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-downloaded', async () => { const info = await latestRelease(); setUpdate({ state: 'ready', checkedAt: new Date().toISOString(), version: info?.version || null, notesUrl: info?.notesUrl || null }); });
    autoUpdater.on('error', e => setUpdate({ state: 'failed', error: String(e?.message || e).slice(0, 500), checkedAt: new Date().toISOString() }));
    setTimeout(checkUpdates, 15000);
    setInterval(checkUpdates, UPDATE_INTERVAL_MS).unref?.();
  }
  handle('app:update-state', () => ({ ...updates }));
  handle('app:update-check', () => checkUpdates());
  handle('app:update-install', async () => {
    if (updates.state !== 'ready') throw new Error('No update is ready to install.');
    await stop();
    closing = true;
    autoUpdater.quitAndInstall();
    return true;
  });
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
  handle('app:editors', () => detectEditors().map(e => ({ name: e.name })));
  handle('app:open-project', async action => {
    if (!['vscode', 'default', 'reveal'].includes(action)) throw new Error('Unknown editor action.');
    if (!source) throw new Error('Choose a project first.');
    const file = source.composePath || source.dockerfilePath, folder = path.dirname(file);
    if (action === 'reveal') { shell.showItemInFolder(file); return true; }
    if (action === 'default') { const error = await shell.openPath(file); if (error) throw new Error(error); return true; }
    const editor = detectEditors()[0];
    if (!editor) throw new Error('Visual Studio Code was not found on this computer.');
    require('node:child_process').spawn(editor.path, [folder], { detached: true, stdio: 'ignore', shell: false, windowsHide: false }).unref();
    return true;
  });
  handle('host:copy', async () => { clipboard.writeText(await verifiedUrl()); return true; });
  handle('host:open', async () => { await shell.openExternal(await verifiedUrl()); return true; });
  const createWindow = () => {
    window = new BrowserWindow({ width: 1120, height: 800, minWidth: 460, minHeight: 620, backgroundColor: '#0e1513', title: 'Tunnel App Deployer', icon: path.join(__dirname, 'renderer', 'icon.png'),
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
module.exports = { isTunnelUrl, validateOptions, validSender, validateSave, isAllowedLink, readBuildInfo, detectEditors, squirrelCommand };
