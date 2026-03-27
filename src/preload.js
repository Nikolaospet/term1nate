const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Processes
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  killAll: (pids) => ipcRenderer.invoke('kill-all', pids),

  // Favorites
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  setFavorites: (favs) => ipcRenderer.invoke('set-favorites', favs),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Auto-kill rules
  getAutoKillRules: () => ipcRenderer.invoke('get-auto-kill-rules'),
  setAutoKillRules: (rules) => ipcRenderer.invoke('set-auto-kill-rules', rules),

  // Export
  exportProcesses: (data) => ipcRenderer.invoke('export-processes', data),
});
