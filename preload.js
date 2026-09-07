const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nativeAPI', {
  runtimeStatus: () => ipcRenderer.invoke('runtime:status'),
  startRuntime: (avd) => ipcRenderer.invoke('runtime:start', avd),
  connectRedroid: (host, port) => ipcRenderer.invoke('runtime:redroid', {host, port}),
  startRedroid: () => ipcRenderer.invoke('runtime:redroid:start'),
  stopRedroid: () => ipcRenderer.invoke('runtime:redroid:stop'),
  installApk: () => ipcRenderer.invoke('apk:install'),
  openUrl: (url) => ipcRenderer.invoke('open:url', url)
});
