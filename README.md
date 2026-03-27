# term1nate

A lightweight cross-platform desktop app that monitors all processes listening on network ports in real time and lets you kill them with a single click.

Works on **macOS**, **Windows**, and **Linux**. Built with Electron.

---

## Features

- **Real-time monitoring** — Automatically refreshes every 2 seconds to show all active processes bound to TCP and UDP ports
- **Cross-platform** — Native process scanning on macOS (`lsof`), Windows (`netstat` + `tasklist`), and Linux (`lsof`)
- **Search & filter** — Instantly filter by process name, port number, user, address, or protocol
- **Kill individual processes** — Click the Kill button on any row. A confirmation dialog shows exactly which process you're about to terminate before proceeding
- **Kill all processes** — Terminate every listed process at once (with confirmation)
- **Graceful shutdown** — On macOS/Linux sends SIGTERM first, waits 500ms, then escalates to SIGKILL. On Windows uses `taskkill /F`
- **Self-protection** — The app will never kill its own process
- **Dark UI** — Clean, minimal interface

## What it shows

Each row in the table displays:

| Column   | Description                                      |
| -------- | ------------------------------------------------ |
| PID      | Process ID                                       |
| Command  | Name of the running process                      |
| Port     | The port number the process is listening on       |
| Protocol | TCP or UDP                                       |
| User     | The system user that owns the process             |
| Address  | The network address the process is bound to       |

---

## Installation

### Prerequisites

- **Node.js** 18+ and **npm** — download from [nodejs.org](https://nodejs.org)

### Option 1: Run from source

```bash
# Clone the repository
git clone https://github.com/Nikolaospet/term1nate.git
cd term1nate

# Install dependencies
npm install

# Launch the app
npm start
```

### Option 2: Build a standalone installer

```bash
# Clone and install
git clone https://github.com/Nikolaospet/term1nate.git
cd term1nate
npm install

# Build for all platforms
npm run build

# Or build for a specific platform
npm run build:mac     # macOS → .dmg
npm run build:win     # Windows → .exe installer
npm run build:linux   # Linux → .AppImage + .deb
```

After building, you'll find the installers in the `dist/` folder:

| Platform | Output                          | How to install                     |
| -------- | ------------------------------- | ---------------------------------- |
| macOS    | `term1nate-x.x.x.dmg`          | Open DMG, drag to Applications     |
| Windows  | `term1nate Setup x.x.x.exe`    | Run the installer, one-click setup |
| Linux    | `term1nate-x.x.x.AppImage`     | `chmod +x` and run directly        |
| Linux    | `term1nate_x.x.x_amd64.deb`   | `sudo dpkg -i term1nate.deb`      |

---

## Usage

### Launching

```bash
# From the project directory
npm start
```

Or launch the installed app from your Applications / Start Menu.

### Running with elevated permissions

By default, the app only shows processes owned by your user. To see **all** system processes:

**macOS / Linux:**
```bash
sudo npm start
```

**Windows:**
Right-click the app and select "Run as administrator".

### Interface walkthrough

1. **Process table** — When the app opens, it immediately scans for all processes listening on TCP and UDP ports and displays them in a table sorted by port number

2. **Search bar** — Type anything in the search box at the top to filter the list. It searches across all columns (PID, command name, port, protocol, user, address)

3. **Killing a single process** — Click the red **Kill** button on any row. A confirmation dialog will appear showing:
   - The process name and PID
   - The port it's running on
   - A prompt asking "Are you sure you want to proceed?"

   Click **Kill** to confirm or **Cancel** to abort.

4. **Killing all processes** — Click the **Kill All** button in the toolbar. A confirmation dialog shows how many processes will be terminated. Click **Kill All** to confirm.

   > If you have a search filter active, "Kill All" only kills the filtered (visible) processes, not everything.

5. **Manual refresh** — Click the refresh icon in the toolbar to force an immediate scan. The app also auto-refreshes every 2 seconds.

### Keyboard shortcuts

| Key    | Action                          |
| ------ | ------------------------------- |
| Escape | Close any open confirmation dialog |

---

## How it works

The app uses platform-native tools to discover processes bound to network ports:

| Platform      | Discovery method                                       |
| ------------- | ------------------------------------------------------ |
| macOS / Linux | `lsof -iTCP -sTCP:LISTEN -nP` and `lsof -iUDP -nP`   |
| Windows       | `netstat -ano` combined with `tasklist` for names      |

The process list is sent to the renderer via Electron's IPC bridge (`contextBridge`) — no `nodeIntegration`, keeping the app secure.

When you kill a process:
- **macOS / Linux** — Sends `SIGTERM` first for a graceful shutdown. If the process is still alive after 500ms, escalates to `SIGKILL`
- **Windows** — Uses `taskkill /F /PID` for immediate termination

---

## Project structure

```
term1nate/
├── package.json        # App metadata, scripts, electron-builder config
├── src/
│   ├── main.js         # Electron main process — window creation, IPC handlers
│   ├── preload.js      # Secure bridge between main and renderer
│   ├── processes.js    # Cross-platform process scanning and kill logic
│   ├── index.html      # UI layout and styles
│   └── renderer.js     # Frontend logic — table rendering, search, modals
└── dist/               # Built installers (generated by npm run build)
```

---

## Troubleshooting

**"No listening processes found"**
- You may be running without elevated permissions. Try running as admin/root to see all processes.

**"Failed to kill PID: Operation not permitted"**
- The process is owned by another user. Run the app with elevated permissions (sudo / Run as administrator).

**App won't start**
- Make sure Node.js 18+ is installed: `node -v`
- Run `npm install` to ensure all dependencies are present

**Windows: netstat is slow**
- The first scan may take a few seconds on Windows. Subsequent refreshes are faster.

---

## Author

Created by **Nikolaos Petridis**

## License

MIT
