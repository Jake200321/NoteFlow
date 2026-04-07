const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:     () => ipcRenderer.invoke('load-data'),
  saveData:     (data) => ipcRenderer.invoke('save-data', data),
  uploadImage:  () => ipcRenderer.invoke('upload-image'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
