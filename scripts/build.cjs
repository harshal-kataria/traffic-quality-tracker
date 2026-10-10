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
const store = path.join(output, 'chasma-kart');
fs.cpSync(path.join(root, 'public/chasma-kart'), store, { recursive: true });
const html = fs.readFileSync(path.join(store, 'index.html'), 'utf8').replaceAll('__CONVEX_URL__', url);
fs.writeFileSync(path.join(store, 'index.html'), html);
for (const page of ['cart', 'checkout', 'thank-you', 'product/jet-black', 'product/sunset-club', 'product/coastline', 'product/golden-hour', 'product/cloud-nine', 'product/weekender']) {
  const destination = path.join(store, page + '.html');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
}
const founder = path.join(output, 'founder');
fs.mkdirSync(founder, { recursive: true });
for (const file of ['index.html', 'screen.css']) fs.copyFileSync(path.join(root,'founder',file),path.join(founder,file));
require('esbuild').buildSync({ entryPoints:[path.join(root,'founder/screen.jsx')], bundle:true, minify:true, outfile:path.join(founder,'screen.js'), define:{'process.env.FOUNDER_CONVEX_URL':JSON.stringify(url),'process.env.NODE_ENV':'"production"'}, jsx:'automatic' });
