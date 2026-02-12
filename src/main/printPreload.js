const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reportApi', {
  onLoad: (cb) => ipcRenderer.on('report:load', (e, payload) => cb(payload)),
  signalReady: (readyChannel) => ipcRenderer.send(readyChannel, { ok: true }),
});
