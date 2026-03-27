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

  // Enrich with CPU/memory stats
  const stats = getProcessStats(unique.map((p) => p.pid));
  for (const p of unique) {
    const s = stats.get(p.pid);
    if (s) {
      p.cpu = s.cpu;
      p.memory = s.memory;
    } else {
      p.cpu = 0;
      p.memory = 0;
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

// ─── CPU / Memory stats ─────────────────────────────────────────────

function getProcessStats(pids) {
  const map = new Map();
  if (pids.length === 0) return map;

  if (platform === 'win32') {
    return getProcessStatsWindows(pids);
  }
  return getProcessStatsUnix(pids);
}

function getProcessStatsUnix(pids) {
  const map = new Map();
  try {
    const pidList = [...new Set(pids)].join(',');
    const out = execSync(`ps -o pid=,pcpu=,rss= -p ${pidList} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const line of out.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0]);
        const cpu = parseFloat(parts[1]) || 0;
        const rssKb = parseInt(parts[2]) || 0;
        const memoryMb = Math.round((rssKb / 1024) * 10) / 10;
        map.set(pid, { cpu: Math.round(cpu * 10) / 10, memory: memoryMb });
      }
    }
  } catch {
    // ps failed
  }
  return map;
}

function getProcessStatsWindows(pids) {
  const map = new Map();
  try {
    // Get memory from tasklist
    const out = execSync('tasklist /FO CSV /NH', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const line of out.trim().split('\n')) {
      // "name.exe","PID","Session","#","Mem Usage"
      const match = line.match(/^"[^"]+","(\d+)","[^"]*","[^"]*","([\d,]+)\s*K"/);
      if (match) {
        const pid = parseInt(match[1]);
        if (pids.includes(pid)) {
          const memKb = parseInt(match[2].replace(/,/g, '')) || 0;
          map.set(pid, { cpu: 0, memory: Math.round((memKb / 1024) * 10) / 10 });
        }
      }
    }
  } catch {
    // tasklist failed
  }
  return map;
}

// ─── macOS / Linux: lsof ────────────────────────────────────────────

function fetchUnix() {
  const processes = [];

  try {
    const tcpOut = execSync('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    processes.push(...parseLsofOutput(tcpOut));
  } catch {
    // lsof may fail if no TCP listeners
  }

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

    const match = trimmed.match(
      /^\s*(TCP|UDP)\s+(\S+)\s+\S+\s+(?:LISTENING\s+)?(\d+)\s*$/
    );
    if (!match) continue;

    const protocol = match[1];
    const localAddr = match[2];
    const pid = parseInt(match[3]);

    if (protocol === 'TCP' && !trimmed.includes('LISTENING')) continue;
    if (isNaN(pid) || pid === 0) continue;

    let address, port;
    if (localAddr.startsWith('[')) {
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
