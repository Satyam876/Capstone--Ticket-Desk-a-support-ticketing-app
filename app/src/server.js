const app = require('./app');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TicketDesk API listening on http://localhost:${port}`));
