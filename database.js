const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./attendance.db");

db.serialize(() => {
    // 1. Attendance Table
    db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      username TEXT,
      date TEXT,
      status TEXT,
      time TEXT
    )
  `);

    // 2. Employees Table
    db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      userId TEXT PRIMARY KEY,
      username TEXT,
      role TEXT DEFAULT 'Employee',
      joinedDate TEXT
    )
  `);

    // 3. Leaves Table
    db.run(`
    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      username TEXT,
      leaveType TEXT,
      reason TEXT,
      fromDate TEXT,
      toDate TEXT,
      status TEXT DEFAULT 'Pending',
      appliedDate TEXT
    )
  `);

    // 4. Scheduler State Table
    db.run(`
    CREATE TABLE IF NOT EXISTS scheduler_state (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// Attach Promise wrappers for modern async/await queries
db.runAsync = function (query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

db.getAsync = function (query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.allAsync = function (query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = db;