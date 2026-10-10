const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('a changed founder bundle gets a new browser URL; an unchanged build keeps it', () => {
  const root = path.resolve(__dirname,'..');
  const saved = new Map(['index.html','screen.js','screen.css'].map(file => {
    const target = path.join(root,'dist/founder',file);
    return [target,fs.existsSync(target) ? fs.readFileSync(target) : null];
  }));
  const build = url => {
    execFileSync(process.execPath,['scripts/build.cjs'],{cwd:root,env:{...process.env,VITE_CONVEX_URL:url},stdio:'pipe'});
    const html = fs.readFileSync(path.join(root,'dist/founder/index.html'),'utf8');
    return html.match(/src="([^"]+)"/)[1];
  };
  try {
    const first = build('https://pleasant-bee-1.convex.cloud');
    assert.match(first,/\/founder\/screen\.js\?v=[a-f0-9]+/);
    assert.equal(build('https://pleasant-bee-1.convex.cloud'),first);
    assert.notEqual(build('https://dusty-dogfish-660.convex.cloud'),first);
  } finally {
    for (const [target,contents] of saved) if (contents) fs.writeFileSync(target,contents);
  }
});
