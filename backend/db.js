const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'vehicle_loans.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_number TEXT NOT NULL,
  reg_number TEXT NOT NULL,
  allocation TEXT,
  status TEXT NOT NULL DEFAULT 'available', -- available | loaned | maintenance
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff (
  staff_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL,
  car_number TEXT,
  reg_number TEXT,
  staff_number TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  team TEXT,
  shift TEXT NOT NULL,          -- 'Day (06:00-18:00)' | 'Night (18:00-06:00)'
  shift_date TEXT NOT NULL,     -- date the shift started, YYYY-MM-DD
  issued_at TEXT NOT NULL,
  returned_at TEXT,
  returned_by_staff_number TEXT,
  returned_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | returned
  FOREIGN KEY (car_id) REFERENCES cars(id)
);
`);

module.exports = db;
