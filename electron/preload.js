const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mitti', {
  onState: (callback) => ipcRenderer.on('mitti-state', (_, data) => callback(data)),
  reportRendererReady: (kind) => ipcRenderer.send('renderer-ready', kind),
  reportRendererError: (message) => ipcRenderer.send('renderer-error', String(message)),
  dragStart: (x, y) => ipcRenderer.send('drag-start', { x, y }),
  dragEnd: () => ipcRenderer.send('drag-end')
});
