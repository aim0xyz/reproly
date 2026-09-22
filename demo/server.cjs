const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/checkout')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Checkout service unavailable' })); }
  if (req.url.startsWith('/api/profile')) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Session expired' })); }
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
  res.writeHead(404); res.end('Not found');
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Patchmason demo: http://127.0.0.1:${server.address().port}`));
