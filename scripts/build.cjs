const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const url = process.env.VITE_CONVEX_URL;
if (!url || !/^https:\/\/[^/]+\.convex\.cloud$/.test(url)) {
  throw new Error('The hosting command must supply the public Convex client URL.');
}
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const name of ['test.html', 'thank-you.html', 'tracker.js']) {
  let content = fs.readFileSync(path.join(root, 'public', name), 'utf8');
  content = content.replaceAll('__CONVEX_URL__', url);
  if (name.endsWith('.html')) content = content.replace('data-convex-url=', 'data-store-id="demo-store" data-test-mode="true" data-convex-url=');
  fs.writeFileSync(path.join(output, name), content);
  if (name === 'test.html') fs.writeFileSync(path.join(output, 'index.html'), content);
}
console.log('Built static test pages with the public Convex client URL.');
