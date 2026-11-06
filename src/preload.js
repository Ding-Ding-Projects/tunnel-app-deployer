'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tunnel', Object.freeze({
  prerequisites: () => ipcRenderer.invoke('host:prerequisites'),
  status: () => ipcRenderer.invoke('host:status'),
  select: kind => ipcRenderer.invoke('host:select', kind),
  host: options => ipcRenderer.invoke('host:start', options),
  stop: () => ipcRenderer.invoke('host:stop'),
  copy: () => ipcRenderer.invoke('host:copy'),
  open: () => ipcRenderer.invoke('host:open'),
  info: () => ipcRenderer.invoke('app:info'),
  copyText: text => ipcRenderer.invoke('app:copy-text', String(text)),
  setTitle: title => ipcRenderer.invoke('app:set-title', String(title)),
  openLink: url => ipcRenderer.invoke('app:open-link', String(url)),
  editors: () => ipcRenderer.invoke('app:editors'),
  openProject: action => ipcRenderer.invoke('app:open-project', String(action)),
  updateState: () => ipcRenderer.invoke('app:update-state'),
  checkUpdates: () => ipcRenderer.invoke('app:update-check'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  onUpdate: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('app:update', listener); return () => ipcRenderer.removeListener('app:update', listener); },
  save: (name, content) => ipcRenderer.invoke('app:save', String(name), String(content)),
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('host:progress', listener);
    return () => ipcRenderer.removeListener('host:progress', listener);
  }
}));
