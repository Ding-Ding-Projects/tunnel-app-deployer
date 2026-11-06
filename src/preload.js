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
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('host:progress', listener);
    return () => ipcRenderer.removeListener('host:progress', listener);
  }
}));
