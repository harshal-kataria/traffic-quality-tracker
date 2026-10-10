const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = { '/': 'test.html', '/test.html': 'test.html', '/thank-you.html': 'thank-you.html', '/tracker.js': 'tracker.js' }[pathname];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  let content = fs.readFileSync(path.join(root, file), 'utf8');
  content = content.replaceAll('__CONVEX_URL__', 'http://127.0.0.1:3210');
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(content);
}).listen(8080, '127.0.0.1', () => console.log('Test store: http://127.0.0.1:8080/test.html'));
