'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('tunnel', Object.freeze({
  prerequisites: () => ipcRenderer.invoke('host:prerequisites'),
  status: () => ipcRenderer.invoke('host:status'),
  select: kind => ipcRenderer.invoke('host:select', kind),
  host: options => ipcRenderer.invoke('host:start', options),
  stop: () => ipcRenderer.invoke('host:stop'),
  copy: () => ipcRenderer.invoke('host:copy'),
  open: () => ipcRenderer.invoke('host:open'),
  info: () => ipcRenderer.invoke('app:info'),
  // Matches windowChromeOptions in main.js: Windows draws its caption buttons over our own title bar.
  windowChrome: process.platform === 'win32' ? 'overlay' : 'native',
  setTitlebar: colors => ipcRenderer.invoke('app:titlebar', { color: String(colors?.color), symbolColor: String(colors?.symbolColor) }),
  copyText: text => ipcRenderer.invoke('app:copy-text', String(text)),
  setTitle: title => ipcRenderer.invoke('app:set-title', String(title)),
  openLink: url => ipcRenderer.invoke('app:open-link', String(url)),
  editors: () => ipcRenderer.invoke('app:editors'),
  openProject: action => ipcRenderer.invoke('app:open-project', String(action)),
  updateState: () => ipcRenderer.invoke('app:update-state'),
  checkUpdates: () => ipcRenderer.invoke('app:update-check'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  onUpdate: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('app:update', listener); return () => ipcRenderer.removeListener('app:update', listener); },
  vaultAvailable: () => ipcRenderer.invoke('app:vault-available'),
  vaultSeal: text => ipcRenderer.invoke('app:vault-seal', String(text)),
  vaultOpen: sealed => ipcRenderer.invoke('app:vault-open', String(sealed)),
  save: (name, content) => ipcRenderer.invoke('app:save', String(name), String(content)),
  // Same-folder Base64. Paths come only from real dropped or chosen File objects, resolved here.
  b64Files: (id, mode, files, options) => {
    const paths = Array.from(files || []).slice(0, 200).map(file => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } });
    return ipcRenderer.invoke('app:b64-files', { id: String(id), mode: String(mode), paths, options: { variant: String(options?.variant || 'standard'), padding: options?.padding !== false, strict: options?.strict !== false } });
  },
  b64Control: (id, action) => ipcRenderer.invoke('app:b64-control', String(id), String(action)),
  b64Reveal: token => ipcRenderer.invoke('app:b64-reveal', String(token)),
  onB64Progress: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('app:b64-progress', listener); return () => ipcRenderer.removeListener('app:b64-progress', listener); },
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('host:progress', listener);
    return () => ipcRenderer.removeListener('host:progress', listener);
  }
}));
