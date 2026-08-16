// Minimal JSON-file "database" of verified users.
// Structure: { "<userId>": { accessToken, refreshToken, expiresAt, username } }

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'verified.json');

function load() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function upsertUser(userId, record) {
  const data = load();
  data[userId] = { ...(data[userId] || {}), ...record };
  save(data);
}

function getUser(userId) {
  const data = load();
  return data[userId] || null;
}

function getAllUsers() {
  const data = load();
  return Object.entries(data).map(([id, record]) => ({ id, ...record }));
}

function removeUser(userId) {
  const data = load();
  delete data[userId];
  save(data);
}

module.exports = { upsertUser, getUser, getAllUsers, removeUser };
