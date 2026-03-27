let allProcesses = [];
let favorites = [];
let searchTerm = '';
let portMin = '';
let portMax = '';
let sortKey = 'port';
let sortAsc = true;
let groupByCommand = false;
let currentTab = 'processes';

// ─── DOM refs ───────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const processTable = $('processTable');
const countEl = $('count');
const searchBox = $('search');
const portMinInput = $('portMin');
const portMaxInput = $('portMax');
const refreshBtn = $('refreshBtn');
const killAllBtn = $('killAllBtn');
const exportBtn = $('exportBtn');
const confirmDialog = $('confirmDialog');
const confirmCount = $('confirmCount');
const confirmYes = $('confirmYes');
const confirmNo = $('confirmNo');
const killOneDialog = $('killOneDialog');
const killOneName = $('killOneName');
const killOneDetails = $('killOneDetails');
const killOneYes = $('killOneYes');
const killOneNo = $('killOneNo');
const exportDialog = $('exportDialog');
const exportOutput = $('exportOutput');
const exportClose = $('exportClose');
const exportCopy = $('exportCopy');
const historyList = $('historyList');
const rulesList = $('rulesList');
const statusMsg = $('statusMsg');
const lastUpdate = $('lastUpdate');
const toast = $('toast');

let pendingKill = null;

// ─── Process type detection (for color coding) ─────────────────────

const DB_COMMANDS = ['postgres', 'mysqld', 'mongod', 'redis-ser', 'mariadbd', 'cockroach', 'clickhous'];
const WEB_COMMANDS = ['nginx', 'httpd', 'apache', 'caddy', 'traefik', 'envoy'];
const DEV_COMMANDS = ['node', 'python', 'ruby', 'php', 'java', 'go', 'cargo', 'deno', 'bun', 'webpack', 'vite', 'next-serv'];

function getProcessType(command) {
  const cmd = command.toLowerCase();
  if (DB_COMMANDS.some((d) => cmd.includes(d))) return 'db';
  if (WEB_COMMANDS.some((w) => cmd.includes(w))) return 'web';
  if (DEV_COMMANDS.some((d) => cmd.includes(d))) return 'dev';
  if (cmd.includes('system') || cmd.includes('kernel') || cmd.includes('launchd') || cmd.includes('sshd')) return 'system';
  return 'other';
}

// ─── Fetch and render ───────────────────────────────────────────────

async function refresh() {
  refreshBtn.classList.add('spinning');
  try {
    allProcesses = await window.api.getProcesses();
    favorites = await window.api.getFavorites();
    renderTable();
    lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
  setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
}

function getFilteredProcesses() {
  let list = allProcesses;

  // Search filter
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(
      (p) =>
        p.command.toLowerCase().includes(q) ||
        p.port.includes(q) ||
        p.user.toLowerCase().includes(q) ||
        p.address.includes(q) ||
        String(p.pid).includes(q) ||
        p.protocol.toLowerCase().includes(q)
    );
  }

  // Port range filter
  const pMin = parseInt(portMin);
  const pMax = parseInt(portMax);
  if (!isNaN(pMin)) list = list.filter((p) => parseInt(p.port) >= pMin);
  if (!isNaN(pMax)) list = list.filter((p) => parseInt(p.port) <= pMax);

  // Sort
  list = [...list].sort((a, b) => {
    // Favorites always first
    const aFav = favorites.includes(a.port);
    const bFav = favorites.includes(b.port);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;

    let va, vb;
    if (sortKey === 'pid') { va = a.pid; vb = b.pid; }
    else if (sortKey === 'port') { va = parseInt(a.port) || 0; vb = parseInt(b.port) || 0; }
    else if (sortKey === 'cpu') { va = a.cpu || 0; vb = b.cpu || 0; }
    else if (sortKey === 'memory') { va = a.memory || 0; vb = b.memory || 0; }
    else { va = (a[sortKey] || '').toLowerCase(); vb = (b[sortKey] || '').toLowerCase(); }

    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  return list;
}

function getCpuClass(cpu) {
  if (cpu >= 50) return 'cpu-high';
  if (cpu >= 10) return 'cpu-med';
  return 'cpu-low';
}

function renderTable() {
  const filtered = getFilteredProcesses();
  countEl.textContent = filtered.length;

  // Update sort arrows
  document.querySelectorAll('thead th').forEach((th) => {
    const key = th.dataset.sort;
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (key === sortKey) {
      th.classList.add('sorted');
      arrow.textContent = sortAsc ? ' ▲' : ' ▼';
    } else {
      th.classList.remove('sorted');
      arrow.textContent = '';
    }
  });

  if (filtered.length === 0) {
    processTable.innerHTML = `
      <tr><td colspan="10">
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>${searchTerm || portMin || portMax ? 'No processes match your filters' : 'No listening processes found'}</span>
        </div>
      </td></tr>`;
    return;
  }

  // Group by command if sorted by command
  let html = '';
  let lastGroup = null;

  for (const p of filtered) {
    const type = getProcessType(p.command);
    const isFav = favorites.includes(p.port);
    const cpuClass = getCpuClass(p.cpu || 0);

    // Group header when sorted by command
    if (sortKey === 'command') {
      const group = p.command;
      if (group !== lastGroup) {
        lastGroup = group;
        const count = filtered.filter((x) => x.command === group).length;
        html += `<tr class="group-header"><td colspan="10">${escapeHtml(group)} (${count})</td></tr>`;
      }
    }

    html += `
    <tr class="type-${type} ${isFav ? 'pinned' : ''}">
      <td><button class="btn-fav ${isFav ? 'is-fav' : ''}" onclick="toggleFavorite('${p.port}')" title="${isFav ? 'Unpin' : 'Pin'} port ${p.port}">★</button></td>
      <td class="col-pid">${p.pid}</td>
      <td class="col-command" title="${escapeHtml(p.command)}">${escapeHtml(p.command)}</td>
      <td class="col-port">${p.port}</td>
      <td class="col-protocol"><span class="badge-${p.protocol.toLowerCase()}">${p.protocol}</span></td>
      <td class="col-user">${escapeHtml(p.user)}</td>
      <td class="col-address">${escapeHtml(p.address)}</td>
      <td class="col-cpu ${cpuClass}">${(p.cpu || 0).toFixed(1)}%</td>
      <td class="col-mem">${(p.memory || 0).toFixed(1)} MB</td>
      <td><div class="actions-cell">
        <button class="btn-kill" onclick="handleKill(${p.pid}, '${escapeJs(p.command)}', '${p.port}')" title="Kill process">💀</button>
      </div></td>
    </tr>`;
  }

  processTable.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ─── Sorting ────────────────────────────────────────────────────────

document.querySelectorAll('thead th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (key === 'fav') return;
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
    renderTable();
  });
});

// ─── Favorites ──────────────────────────────────────────────────────

async function toggleFavorite(port) {
  if (favorites.includes(port)) {
    favorites = favorites.filter((f) => f !== port);
  } else {
    favorites.push(port);
  }
  await window.api.setFavorites(favorites);
  renderTable();
}

// ─── Kill single ────────────────────────────────────────────────────

function handleKill(pid, command, port) {
  pendingKill = { pid, command, port };
  killOneName.textContent = `${command} (PID ${pid})`;
  killOneDetails.textContent = `Port ${port}`;
  killOneDialog.style.display = 'flex';
}

killOneNo.addEventListener('click', () => {
  killOneDialog.style.display = 'none';
  pendingKill = null;
});

killOneYes.addEventListener('click', async () => {
  killOneDialog.style.display = 'none';
  if (!pendingKill) return;
  const { pid, command, port } = pendingKill;
  pendingKill = null;
  const result = await window.api.killProcess(pid);
  if (result.success) {
    showToast(`Killed ${command} (PID ${pid}) on port ${port}`, 'success');
    await window.api.addHistory({ pid, command, port, protocol: 'TCP' });
  } else {
    showToast(`Failed to kill PID ${pid}: ${result.error}`, 'error');
  }
  await refresh();
});

// ─── Kill all ───────────────────────────────────────────────────────

killAllBtn.addEventListener('click', () => {
  const filtered = getFilteredProcesses();
  if (filtered.length === 0) return;
  confirmCount.textContent = filtered.length;
  confirmDialog.style.display = 'flex';
});

confirmNo.addEventListener('click', () => { confirmDialog.style.display = 'none'; });

confirmYes.addEventListener('click', async () => {
  confirmDialog.style.display = 'none';
  const filtered = getFilteredProcesses();
  const pids = filtered.map((p) => p.pid);
  const result = await window.api.killAll(pids);

  // Log to history
  for (const p of filtered) {
    await window.api.addHistory({ pid: p.pid, command: p.command, port: p.port, protocol: p.protocol });
  }

  if (result.failed > 0) {
    showToast(`Killed ${result.killed}, failed ${result.failed}`, 'error');
  } else {
    showToast(`Killed ${result.killed} processes`, 'success');
  }
  await refresh();
});

// ─── Search & port range ────────────────────────────────────────────

searchBox.addEventListener('input', (e) => { searchTerm = e.target.value; renderTable(); });
portMinInput.addEventListener('input', (e) => { portMin = e.target.value; renderTable(); });
portMaxInput.addEventListener('input', (e) => { portMax = e.target.value; renderTable(); });
refreshBtn.addEventListener('click', refresh);

// ─── Export ─────────────────────────────────────────────────────────

let exportFormat = 'csv';

exportBtn.addEventListener('click', async () => {
  const filtered = getFilteredProcesses();
  const data = await window.api.exportProcesses({ processes: filtered, format: exportFormat });
  exportOutput.value = data;
  exportDialog.style.display = 'flex';
});

document.querySelectorAll('.export-format').forEach((btn) => {
  btn.addEventListener('click', async () => {
    exportFormat = btn.dataset.format;
    document.querySelectorAll('.export-format').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const filtered = getFilteredProcesses();
    const data = await window.api.exportProcesses({ processes: filtered, format: exportFormat });
    exportOutput.value = data;
  });
});

exportClose.addEventListener('click', () => { exportDialog.style.display = 'none'; });
exportCopy.addEventListener('click', () => {
  exportOutput.select();
  document.execCommand('copy');
  showToast('Copied to clipboard', 'success');
});

// ─── Tabs ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    $('processPanel').classList.toggle('active', currentTab === 'processes');
    $('processToolbar').style.display = currentTab === 'processes' ? 'flex' : 'none';
    $('historyPanel').classList.toggle('active', currentTab === 'history');
    $('rulesPanel').classList.toggle('active', currentTab === 'rules');

    if (currentTab === 'history') renderHistory();
    if (currentTab === 'rules') renderRules();
  });
});

// ─── History ────────────────────────────────────────────────────────

async function renderHistory() {
  const history = await window.api.getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="panel-empty">No kill history yet</div>';
    return;
  }

  historyList.innerHTML = history
    .map((h) => {
      const date = new Date(h.killedAt);
      const time = date.toLocaleString();
      return `
      <div class="history-item">
        <div>
          <span class="hi-command">${escapeHtml(h.command)}</span>
          <span class="hi-port">:${h.port}</span>
          ${h.autoKilled ? '<span class="hi-auto">AUTO</span>' : ''}
        </div>
        <span class="hi-time">${time}</span>
      </div>`;
    })
    .join('');
}

$('clearHistoryBtn').addEventListener('click', async () => {
  await window.api.clearHistory();
  renderHistory();
  showToast('History cleared', 'success');
});

// ─── Auto-kill Rules ────────────────────────────────────────────────

let autoKillRules = [];

async function renderRules() {
  autoKillRules = await window.api.getAutoKillRules();

  if (autoKillRules.length === 0) {
    rulesList.innerHTML = '<div class="panel-empty">No auto-kill rules. Add one to get started.</div>';
    return;
  }

  rulesList.innerHTML = autoKillRules
    .map(
      (rule, i) => `
    <div class="rule-row">
      <span style="color:#6a6a8a; font-size:12px; width:60px;">Port:</span>
      <input class="rule-input" value="${escapeHtml(rule.port || '')}" placeholder="Any port" onchange="updateRule(${i}, 'port', this.value)">
      <span style="color:#6a6a8a; font-size:12px; width:80px;">Command:</span>
      <input class="rule-input" value="${escapeHtml(rule.command || '')}" placeholder="Any command" onchange="updateRule(${i}, 'command', this.value)">
      <button class="rule-toggle ${rule.enabled ? 'on' : 'off'}" onclick="toggleRule(${i})"></button>
      <button class="btn-small btn-danger" onclick="deleteRule(${i})">Delete</button>
    </div>`
    )
    .join('');
}

$('addRuleBtn').addEventListener('click', async () => {
  autoKillRules.push({ port: '', command: '', enabled: true });
  await window.api.setAutoKillRules(autoKillRules);
  renderRules();
});

async function updateRule(index, field, value) {
  autoKillRules[index][field] = value;
  await window.api.setAutoKillRules(autoKillRules);
}

async function toggleRule(index) {
  autoKillRules[index].enabled = !autoKillRules[index].enabled;
  await window.api.setAutoKillRules(autoKillRules);
  renderRules();
}

async function deleteRule(index) {
  autoKillRules.splice(index, 1);
  await window.api.setAutoKillRules(autoKillRules);
  renderRules();
}

// ─── Toast ──────────────────────────────────────────────────────────

function showToast(message, type) {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Keyboard shortcuts ─────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    confirmDialog.style.display = 'none';
    killOneDialog.style.display = 'none';
    exportDialog.style.display = 'none';
    pendingKill = null;
  }
});

// ─── Auto refresh ───────────────────────────────────────────────────

refresh();
setInterval(refresh, 2000);
