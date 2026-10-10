const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/chasma-kart/' || pathname === '/chasma-kart') { res.writeHead(302, { Location: '/chasma-kart/index.html' + new URL(req.url, 'http://localhost').search }); return res.end(); }
  let file = { '/': 'test.html', '/test.html': 'test.html', '/thank-you.html': 'thank-you.html', '/tracker.js': 'tracker.js' }[pathname];
  if (/^\/founder\/(index\.html|screen\.(js|css))$/.test(pathname)) {
    const built = path.join(__dirname, '../dist', pathname);
    if (!fs.existsSync(built)) { res.writeHead(404); return res.end('Build the founder screen first.'); }
    res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html');
    return res.end(fs.readFileSync(built));
  }
  if (pathname.startsWith('/chasma-kart/')) {
    const candidate = path.resolve(root, '.' + pathname);
    if (candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) file = path.relative(root, candidate);
    else if (/^\/chasma-kart\/(?:cart|checkout|thank-you|product\/[a-z-]+)\.html$/.test(pathname)) file = 'chasma-kart/index.html';
  }
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  const extension = path.extname(file);
  let content = fs.readFileSync(path.join(root, file));
  if (extension === '.html' || extension === '.js') content = content.toString().replaceAll('__CONVEX_URL__', process.env.TRACKING_CONVEX_URL || 'http://127.0.0.1:3210');
  if (extension === '.html' && process.env.TRACKING_CONVEX_URL?.includes('pleasant-bee-1')) content = content.replaceAll('/dusty-dogfish-660', '/pleasant-bee-1');
  res.setHeader('Content-Type', {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2'}[extension] || 'text/plain');
  res.end(content);
}).listen(Number(process.env.PORT || 8080), '127.0.0.1', () => console.log('ChasmaKart: http://127.0.0.1:' + (process.env.PORT || 8080) + '/chasma-kart/index.html'));
