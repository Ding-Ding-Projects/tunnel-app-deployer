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
  // Virtual disks: the page refers to disks by tokens; dropped files resolve to paths only here.
  vd: {
    library: () => ipcRenderer.invoke('vd:library'),
    inspect: token => ipcRenderer.invoke('vd:inspect', String(token)),
    details: (token, elevated) => ipcRenderer.invoke('vd:details', String(token), !!elevated),
    scripts: (op, token, extra) => ipcRenderer.invoke('vd:scripts', String(op), token ? String(token) : null, extra && typeof extra === 'object' ? JSON.parse(JSON.stringify(extra)) : {}),
    open: () => ipcRenderer.invoke('vd:open'),
    add: files => ipcRenderer.invoke('vd:add', Array.from(files || []).slice(0, 50).map(file => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } })),
    forget: token => ipcRenderer.invoke('vd:forget', String(token)),
    chooseSave: request => ipcRenderer.invoke('vd:choose-save', { format: String(request?.format || 'vhdx'), name: String(request?.name || 'Disk') }),
    pickParent: () => ipcRenderer.invoke('vd:pick-parent'),
    pickItems: folders => ipcRenderer.invoke('vd:pick-items', !!folders),
    plan: (items, options) => ipcRenderer.invoke('vd:plan', Array.from(items || []).slice(0, 1000).map(item => typeof item === 'string' ? item : (() => { try { return webUtils.getPathForFile(item) || ''; } catch { return ''; } })()), { fileSystem: String(options?.fileSystem || 'NTFS') }),
    run: (op, args) => ipcRenderer.invoke('vd:run', String(op), args && typeof args === 'object' ? JSON.parse(JSON.stringify(args)) : {}),
    cancel: id => ipcRenderer.invoke('vd:cancel', String(id)),
    pause: (id, on) => ipcRenderer.invoke('vd:pause', String(id), !!on),
    reveal: token => ipcRenderer.invoke('vd:reveal', String(token)),
    openVolume: letter => ipcRenderer.invoke('vd:open-volume', String(letter)),
    onProgress: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('vd:progress', listener); return () => ipcRenderer.removeListener('vd:progress', listener); }
  },
  b64Reveal: token => ipcRenderer.invoke('app:b64-reveal', String(token)),
  onB64Progress: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('app:b64-progress', listener); return () => ipcRenderer.removeListener('app:b64-progress', listener); },
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('host:progress', listener);
    return () => ipcRenderer.removeListener('host:progress', listener);
  }
}));
