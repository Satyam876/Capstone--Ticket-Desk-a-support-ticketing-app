const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database(process.env.DB_FILE || ':memory:');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS tickets;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('customer','agent','admin')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      created_by INTEGER NOT NULL REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE refresh_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
  `);
  const ins = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?,?,?)');
  ins.run('admin@ticketdesk.test', bcrypt.hashSync('Admin@123', 8), 'admin');
  ins.run('agent@ticketdesk.test', bcrypt.hashSync('Agent@123', 8), 'agent');
  ins.run('customer@ticketdesk.test', bcrypt.hashSync('Customer@123', 8), 'customer');
}

init();
module.exports = { db, init };
