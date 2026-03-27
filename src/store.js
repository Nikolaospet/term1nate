const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const storePath = path.join(app.getPath('userData'), 'term1nate-data.json');

const defaults = {
  favorites: [],       // ["3000", "8080", ...]
  autoKillRules: [],   // [{ port: "8080", command: "", enabled: true }, ...]
  history: [],         // [{ pid, command, port, killedAt, protocol }, ...] max 200
};

function loadStore() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    return { ...defaults, ...data };
  } catch {
    return { ...defaults };
  }
}

function saveStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function getFavorites() {
  return loadStore().favorites;
}

function setFavorites(favorites) {
  const store = loadStore();
  store.favorites = favorites;
  saveStore(store);
}

function getAutoKillRules() {
  return loadStore().autoKillRules;
}

function setAutoKillRules(rules) {
  const store = loadStore();
  store.autoKillRules = rules;
  saveStore(store);
}

function getHistory() {
  return loadStore().history;
}

function addHistoryEntry(entry) {
  const store = loadStore();
  store.history.unshift({
    ...entry,
    killedAt: new Date().toISOString(),
  });
  // Keep max 200 entries
  if (store.history.length > 200) {
    store.history = store.history.slice(0, 200);
  }
  saveStore(store);
}

function clearHistory() {
  const store = loadStore();
  store.history = [];
  saveStore(store);
}

module.exports = {
  getFavorites,
  setFavorites,
  getAutoKillRules,
  setAutoKillRules,
  getHistory,
  addHistoryEntry,
  clearHistory,
};
