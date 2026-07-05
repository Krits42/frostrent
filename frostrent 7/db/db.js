const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'frostrent.sqlite');
const db = new Database(dbPath);

// Apply schema on boot (idempotent — all CREATE TABLE IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
