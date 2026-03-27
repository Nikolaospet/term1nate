const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fetchProcesses, killProcess, killAllProcesses } = require('./processes');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// IPC handlers
ipcMain.handle('get-processes', async () => {
  return fetchProcesses();
});

ipcMain.handle('kill-process', async (_event, pid) => {
  return killProcess(pid);
});

ipcMain.handle('kill-all', async (_event, pids) => {
  return killAllProcesses(pids);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
