let allProcesses = [];
let searchTerm = '';
let refreshInterval = null;

const processTable = document.getElementById('processTable');
const countEl = document.getElementById('count');
const searchBox = document.getElementById('search');
const refreshBtn = document.getElementById('refreshBtn');
const killAllBtn = document.getElementById('killAllBtn');
const confirmDialog = document.getElementById('confirmDialog');
const confirmCount = document.getElementById('confirmCount');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const killOneDialog = document.getElementById('killOneDialog');
const killOneName = document.getElementById('killOneName');
const killOneDetails = document.getElementById('killOneDetails');
const killOneYes = document.getElementById('killOneYes');
const killOneNo = document.getElementById('killOneNo');
const statusMsg = document.getElementById('statusMsg');
const lastUpdate = document.getElementById('lastUpdate');
const toast = document.getElementById('toast');

let pendingKill = null; // { pid, command, port }

// Fetch and render processes
async function refresh() {
  refreshBtn.classList.add('spinning');
  try {
    allProcesses = await window.api.getProcesses();
    renderTable();
    lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
  setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
}

function getFilteredProcesses() {
  if (!searchTerm) return allProcesses;
  const q = searchTerm.toLowerCase();
  return allProcesses.filter(
    (p) =>
      p.command.toLowerCase().includes(q) ||
      p.port.includes(q) ||
      p.user.toLowerCase().includes(q) ||
      p.address.includes(q) ||
      String(p.pid).includes(q) ||
      p.protocol.toLowerCase().includes(q)
  );
}

function renderTable() {
  const filtered = getFilteredProcesses();
  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    processTable.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>${searchTerm ? 'No processes match your search' : 'No listening processes found'}</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  processTable.innerHTML = filtered
    .map(
      (p) => `
    <tr>
      <td class="col-pid">${p.pid}</td>
      <td class="col-command" title="${p.command}">${escapeHtml(p.command)}</td>
      <td class="col-port">${p.port}</td>
      <td class="col-protocol">
        <span class="badge-${p.protocol.toLowerCase()}">${p.protocol}</span>
      </td>
      <td class="col-user">${escapeHtml(p.user)}</td>
      <td class="col-address">${escapeHtml(p.address)}</td>
      <td>
        <button class="btn-kill" onclick="handleKill(${p.pid}, '${escapeHtml(p.command)}', '${p.port}')">Kill</button>
      </td>
    </tr>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Kill single process — show confirmation first
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
  } else {
    showToast(`Failed to kill PID ${pid}: ${result.error}`, 'error');
  }
  await refresh();
});

// Kill all
killAllBtn.addEventListener('click', () => {
  const filtered = getFilteredProcesses();
  if (filtered.length === 0) return;
  confirmCount.textContent = filtered.length;
  confirmDialog.style.display = 'flex';
});

confirmNo.addEventListener('click', () => {
  confirmDialog.style.display = 'none';
});

confirmYes.addEventListener('click', async () => {
  confirmDialog.style.display = 'none';
  const filtered = getFilteredProcesses();
  const pids = filtered.map((p) => p.pid);
  const result = await window.api.killAll(pids);
  if (result.failed > 0) {
    showToast(`Killed ${result.killed}, failed ${result.failed}`, 'error');
  } else {
    showToast(`Killed ${result.killed} processes`, 'success');
  }
  await refresh();
});

// Search
searchBox.addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderTable();
});

// Manual refresh
refreshBtn.addEventListener('click', refresh);

// Toast
function showToast(message, type) {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Close any confirm dialog on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    confirmDialog.style.display = 'none';
    killOneDialog.style.display = 'none';
    pendingKill = null;
  }
});

// Auto refresh every 2 seconds
function startAutoRefresh() {
  refresh();
  refreshInterval = setInterval(refresh, 2000);
}

startAutoRefresh();
