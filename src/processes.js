const { execSync } = require('child_process');
const os = require('os');

const platform = os.platform(); // 'darwin', 'linux', 'win32'

// ─── Fetch processes ────────────────────────────────────────────────

function fetchProcesses() {
  let processes = [];

  if (platform === 'win32') {
    processes = fetchWindows();
  } else {
    processes = fetchUnix();
  }

  // Deduplicate by PID+Port+Protocol
  const seen = new Set();
  const unique = [];
  for (const p of processes) {
    const key = `${p.pid}:${p.port}:${p.protocol}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }

  // Sort by port number, then PID
  unique.sort((a, b) => {
    const portA = parseInt(a.port) || 0;
    const portB = parseInt(b.port) || 0;
    if (portA !== portB) return portA - portB;
    return a.pid - b.pid;
  });

  return unique;
}

// ─── macOS / Linux: lsof ────────────────────────────────────────────

function fetchUnix() {
  const processes = [];

  // TCP listening sockets
  try {
    const tcpOut = execSync('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    processes.push(...parseLsofOutput(tcpOut));
  } catch {
    // lsof may fail if no TCP listeners
  }

  // UDP bound sockets
  try {
    const udpOut = execSync('lsof -iUDP -nP 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    processes.push(...parseLsofOutput(udpOut));
  } catch {
    // lsof may fail if no UDP listeners
  }

  return processes;
}

function parseLsofOutput(output) {
  const results = [];
  const lines = output.trim().split('\n');

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].trim().split(/\s+/);
    // COMMAND(0) PID(1) USER(2) FD(3) TYPE(4) DEVICE(5) SIZE/OFF(6) NODE(7) NAME(8) [state(9)]
    if (fields.length < 9) continue;

    const pid = parseInt(fields[1]);
    if (isNaN(pid)) continue;

    const command = fields[0];
    const user = fields[2];
    const node = fields[7];
    const name = fields[8];

    const lastColon = name.lastIndexOf(':');
    if (lastColon === -1) continue;

    const port = name.substring(lastColon + 1);
    let address = name.substring(0, lastColon);

    if (port === '*') continue;

    address = address.replace(/^\[/, '').replace(/\]$/, '');

    let protocol = node.replace('6', '');
    if (protocol !== 'TCP' && protocol !== 'UDP') protocol = node;

    results.push({ pid, command, port, protocol, user, address });
  }

  return results;
}

// ─── Windows: netstat + tasklist ────────────────────────────────────

function fetchWindows() {
  const processes = [];

  // Build PID -> process name map from tasklist
  const pidNameMap = buildPidNameMap();

  try {
    const out = execSync('netstat -ano', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    processes.push(...parseNetstatOutput(out, pidNameMap));
  } catch {
    // netstat failed
  }

  return processes;
}

function buildPidNameMap() {
  const map = new Map();
  try {
    const out = execSync('tasklist /FO CSV /NH', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const line of out.trim().split('\n')) {
      // Format: "name.exe","PID","Session Name","Session#","Mem Usage"
      const match = line.match(/^"([^"]+)","(\d+)"/);
      if (match) {
        map.set(parseInt(match[2]), match[1]);
      }
    }
  } catch {
    // tasklist failed
  }
  return map;
}

function parseNetstatOutput(output, pidNameMap) {
  const results = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match lines like:   TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    1234
    //                     UDP    0.0.0.0:5353    *:*                       1234
    const match = trimmed.match(
      /^\s*(TCP|UDP)\s+(\S+)\s+\S+\s+(?:LISTENING\s+)?(\d+)\s*$/
    );
    if (!match) continue;

    const protocol = match[1];
    const localAddr = match[2];
    const pid = parseInt(match[3]);

    // Only LISTENING for TCP (UDP has no LISTENING state, it's always included)
    if (protocol === 'TCP' && !trimmed.includes('LISTENING')) continue;

    if (isNaN(pid) || pid === 0) continue;

    // Parse address:port — handle IPv6 like [::]:8080
    let address, port;
    if (localAddr.startsWith('[')) {
      // IPv6: [::]:port or [::1]:port
      const bracketEnd = localAddr.indexOf(']:');
      if (bracketEnd === -1) continue;
      address = localAddr.substring(1, bracketEnd);
      port = localAddr.substring(bracketEnd + 2);
    } else {
      const lastColon = localAddr.lastIndexOf(':');
      if (lastColon === -1) continue;
      address = localAddr.substring(0, lastColon);
      port = localAddr.substring(lastColon + 1);
    }

    if (port === '*' || port === '0') continue;

    const command = pidNameMap.get(pid) || `PID ${pid}`;
    const user = os.userInfo().username;

    results.push({ pid, command, port, protocol, user, address });
  }

  return results;
}

// ─── Kill processes ─────────────────────────────────────────────────

function killProcess(pid) {
  if (platform === 'win32') {
    return killProcessWindows(pid);
  }
  return killProcessUnix(pid);
}

function killProcessUnix(pid) {
  try {
    process.kill(pid, 'SIGTERM');

    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          // Still alive, escalate
          try {
            process.kill(pid, 'SIGKILL');
            resolve({ success: true, pid });
          } catch (e) {
            resolve({ success: false, pid, error: e.message });
          }
        } catch {
          resolve({ success: true, pid });
        }
      }, 500);
    });
  } catch (e) {
    return Promise.resolve({ success: false, pid, error: e.message });
  }
}

function killProcessWindows(pid) {
  try {
    // /F = force, /PID = by process ID
    execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 });
    return Promise.resolve({ success: true, pid });
  } catch (e) {
    return Promise.resolve({ success: false, pid, error: e.message });
  }
}

async function killAllProcesses(pids) {
  const myPid = process.pid;
  const uniquePids = [...new Set(pids.filter((p) => p !== myPid))];

  const results = [];
  for (const pid of uniquePids) {
    const result = await killProcess(pid);
    results.push(result);
  }

  return {
    killed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    errors: results.filter((r) => !r.success),
  };
}

module.exports = { fetchProcesses, killProcess, killAllProcesses };
