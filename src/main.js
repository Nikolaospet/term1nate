const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { fetchProcesses, killProcess, killAllProcesses } = require('./processes');
const store = require('./store');

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 700,
    minWidth: 800,
    minHeight: 450,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create a simple tray icon (16x16 template image for macOS)
  const iconPath = path.join(__dirname, 'trayIcon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);
  } catch {
    // Fallback: create a small colored icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('term1nate');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show term1nate',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// ─── IPC: Processes ─────────────────────────────────────────────────

ipcMain.handle('get-processes', async () => {
  const processes = fetchProcesses();

  // Auto-kill check
  const rules = store.getAutoKillRules().filter((r) => r.enabled);
  if (rules.length > 0) {
    for (const proc of processes) {
      for (const rule of rules) {
        const portMatch = !rule.port || proc.port === rule.port;
        const cmdMatch =
          !rule.command || proc.command.toLowerCase().includes(rule.command.toLowerCase());
        if (portMatch && cmdMatch && (rule.port || rule.command)) {
          try {
            await killProcess(proc.pid);
            store.addHistoryEntry({
              pid: proc.pid,
              command: proc.command,
              port: proc.port,
              protocol: proc.protocol,
              autoKilled: true,
            });
          } catch {
            // kill failed, skip
          }
        }
      }
    }
    // Re-fetch after auto-kills
    if (rules.length > 0) {
      return fetchProcesses();
    }
  }

  return processes;
});

ipcMain.handle('kill-process', async (_event, pid) => {
  return killProcess(pid);
});

ipcMain.handle('kill-all', async (_event, pids) => {
  return killAllProcesses(pids);
});

// ─── IPC: Favorites ─────────────────────────────────────────────────

ipcMain.handle('get-favorites', () => {
  return store.getFavorites();
});

ipcMain.handle('set-favorites', (_event, favorites) => {
  store.setFavorites(favorites);
  return true;
});

// ─── IPC: History ───────────────────────────────────────────────────

ipcMain.handle('get-history', () => {
  return store.getHistory();
});

ipcMain.handle('add-history', (_event, entry) => {
  store.addHistoryEntry(entry);
  return true;
});

ipcMain.handle('clear-history', () => {
  store.clearHistory();
  return true;
});

// ─── IPC: Auto-kill rules ───────────────────────────────────────────

ipcMain.handle('get-auto-kill-rules', () => {
  return store.getAutoKillRules();
});

ipcMain.handle('set-auto-kill-rules', (_event, rules) => {
  store.setAutoKillRules(rules);
  return true;
});

// ─── IPC: Export ────────────────────────────────────────────────────

ipcMain.handle('export-processes', async (_event, { processes, format }) => {
  if (format === 'json') {
    return JSON.stringify(processes, null, 2);
  }
  // CSV
  const headers = 'PID,Command,Port,Protocol,User,Address,CPU%,Memory(MB)';
  const rows = processes.map(
    (p) =>
      `${p.pid},"${p.command}",${p.port},${p.protocol},"${p.user}","${p.address}",${p.cpu || 0},${p.memory || 0}`
  );
  return headers + '\n' + rows.join('\n');
});

// ─── App lifecycle ──────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
