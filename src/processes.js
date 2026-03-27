const { execSync } = require('child_process');

function fetchProcesses() {
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
    const node = fields[7]; // TCP, TCP6, UDP, UDP6
    const name = fields[8]; // e.g. *:49152, 127.0.0.1:6379, [::1]:5432

    const lastColon = name.lastIndexOf(':');
    if (lastColon === -1) continue;

    const port = name.substring(lastColon + 1);
    let address = name.substring(0, lastColon);

    if (port === '*') continue;

    // Clean IPv6 brackets
    address = address.replace(/^\[/, '').replace(/\]$/, '');

    // Normalize protocol
    let protocol = node.replace('6', '');
    if (protocol !== 'TCP' && protocol !== 'UDP') protocol = node;

    results.push({ pid, command, port, protocol, user, address });
  }

  return results;
}

function killProcess(pid) {
  try {
    process.kill(pid, 'SIGTERM');

    // Check if still alive after a short wait
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          process.kill(pid, 0); // check if alive
          // Still alive, escalate
          try {
            process.kill(pid, 'SIGKILL');
            resolve({ success: true, pid });
          } catch (e) {
            resolve({ success: false, pid, error: e.message });
          }
        } catch {
          // Process is gone
          resolve({ success: true, pid });
        }
      }, 500);
    });
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
