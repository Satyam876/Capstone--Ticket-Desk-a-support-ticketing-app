# TicketDesk API (system under test)

```bash
npm install
NODE_ENV=test npm start   # http://localhost:3000 (see .env.example for options)
```

## Seeded users
| Role | Email | Password |
|---|---|---|
| admin | admin@ticketdesk.test | Admin@123 |
| agent | agent@ticketdesk.test | Agent@123 |
| customer | customer@ticketdesk.test | Customer@123 |

## Endpoints
- `GET /health`
- `POST /auth/register` `{email,password,role?}` (role only outside production)
- `POST /auth/login` -> `{accessToken, refreshToken, user}`
- `POST /auth/refresh` `{refreshToken}` (single-use, rotates)
- `POST /tickets`, `GET /tickets?status=&q=&page=&limit=&sort=&order=`
- `GET|PATCH|DELETE /tickets/:id` (delete = admin only)
- `POST /tickets/:id/comments`, `POST /tickets/:id/assign` `{assigneeId}` (agent/admin)
- `POST /test/reset` re-seeds the DB (non-production only)

## Business rules (your test oracle)
- Customers see/edit only their own tickets (others return 404, not 403).
- Only agents/admins change status. Allowed: open->in_progress, in_progress->open|resolved, resolved->in_progress|closed. Anything else: 409.
- Closed tickets reject new comments (409).
- Assignee must be agent/admin. `limit` max 100.
- Access token TTL via `ACCESS_TOKEN_TTL` (set `2s` to test expiry).
