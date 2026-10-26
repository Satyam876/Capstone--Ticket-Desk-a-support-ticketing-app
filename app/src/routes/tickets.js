const router = require('express').Router();
const { db } = require('../db');
const { authenticate, requireRole } = require('../auth');

router.use(authenticate);

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];
const TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['open', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};
const SORTS = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  priority: "CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
};
const isStaff = (u) => u.role === 'agent' || u.role === 'admin';

function loadTicket(req, res, next) {
  const id = Number(req.params.id);
  const t = Number.isInteger(id) && db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  // Customers may only touch their own tickets; 404 avoids leaking existence.
  if (!isStaff(req.user) && t.created_by !== req.user.id)
    return res.status(404).json({ error: 'Ticket not found' });
  req.ticket = t;
  next();
}

router.post('/', (req, res) => {
  const { title, description, priority = 'medium' } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 120)
    return res.status(400).json({ error: 'title required (max 120 chars)' });
  if (typeof description !== 'string' || !description.trim())
    return res.status(400).json({ error: 'description required' });
  if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
  const info = db.prepare('INSERT INTO tickets (title, description, priority, created_by) VALUES (?,?,?,?)')
    .run(title.trim(), description, priority, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/', (req, res) => {
  const { status, q, sort = 'created_at', order = 'desc' } = req.query;
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
  if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: 'Invalid page' });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'Invalid limit (1-100)' });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (!SORTS[sort] || !['asc', 'desc'].includes(order)) return res.status(400).json({ error: 'Invalid sort/order' });

  const where = [], params = [];
  if (!isStaff(req.user)) { where.push('created_by = ?'); params.push(req.user.id); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (q) { where.push('(title LIKE ? OR description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM tickets ${clause}`).get(...params).c;
  const data = db.prepare(
    `SELECT * FROM tickets ${clause} ORDER BY ${SORTS[sort]} ${order.toUpperCase()}, id ${order.toUpperCase()} LIMIT ? OFFSET ?`
  ).all(...params, limit, (page - 1) * limit);
  res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
});

router.get('/:id', loadTicket, (req, res) => {
  const comments = db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY id').all(req.ticket.id);
  res.json({ ...req.ticket, comments });
});

router.patch('/:id', loadTicket, (req, res) => {
  const { title, description, priority, status } = req.body || {};
  const t = req.ticket, updates = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim() || title.length > 120) return res.status(400).json({ error: 'Invalid title' });
    updates.title = title.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || !description.trim()) return res.status(400).json({ error: 'Invalid description' });
    updates.description = description;
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    updates.priority = priority;
  }
  if (status !== undefined) {
    if (!isStaff(req.user)) return res.status(403).json({ error: 'Only agents/admins can change status' });
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (!TRANSITIONS[t.status].includes(status))
      return res.status(409).json({ error: `Cannot move from ${t.status} to ${status}` });
    updates.status = status;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tickets SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...Object.values(updates), t.id);
  res.json(db.prepare('SELECT * FROM tickets WHERE id = ?').get(t.id));
});

router.delete('/:id', requireRole('admin'), loadTicket, (req, res) => {
  db.prepare('DELETE FROM tickets WHERE id = ?').run(req.ticket.id);
  res.status(204).end();
});

router.post('/:id/comments', loadTicket, (req, res) => {
  const { body } = req.body || {};
  if (typeof body !== 'string' || !body.trim() || body.length > 2000)
    return res.status(400).json({ error: 'body required (max 2000 chars)' });
  if (req.ticket.status === 'closed') return res.status(409).json({ error: 'Ticket is closed' });
  const info = db.prepare('INSERT INTO comments (ticket_id, author_id, body) VALUES (?,?,?)')
    .run(req.ticket.id, req.user.id, body);
  res.status(201).json(db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/:id/assign', requireRole('agent', 'admin'), loadTicket, (req, res) => {
  const { assigneeId } = req.body || {};
  const assignee = Number.isInteger(assigneeId) && db.prepare('SELECT * FROM users WHERE id = ?').get(assigneeId);
  if (!assignee) return res.status(404).json({ error: 'Assignee not found' });
  if (!isStaff(assignee)) return res.status(400).json({ error: 'Assignee must be an agent or admin' });
  db.prepare('UPDATE tickets SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(assignee.id, req.ticket.id);
  res.json(db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.ticket.id));
});

module.exports = router;
