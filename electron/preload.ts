const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openextract', {
  // Call Python sidecar methods
  call: (method: string, params?: any) =>
    ipcRenderer.invoke('sidecar:call', method, params || {}),

  // Native dialogs
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  saveFolder: () => ipcRenderer.invoke('dialog:saveFolder'),
});
