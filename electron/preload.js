const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Update management
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate:  () => ipcRenderer.invoke('download-update'),
  installUpdate:   () => ipcRenderer.invoke('install-update'),
  restartBackend:  () => ipcRenderer.invoke('restart-backend'),
  createDesktopBackup: () => ipcRenderer.invoke('create-desktop-backup'),

  // Restart app after update
  restartApp: () => ipcRenderer.invoke('install-update'),

  // Event listeners — each returns a cleanup function
  onUpdateStatus: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  onUpdateProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },

  onUpdateError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },

  onBackendLog: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('backend-log', handler);
    ipcRenderer.on('backend-error', handler);
    return () => {
      ipcRenderer.removeListener('backend-log', handler);
      ipcRenderer.removeListener('backend-error', handler);
    };
  },

  // Platform helpers
  isWindows: process.platform === 'win32',
  isMac:     process.platform === 'darwin',
  isLinux:   process.platform === 'linux',
});

console.log('Electron API exposed to renderer');