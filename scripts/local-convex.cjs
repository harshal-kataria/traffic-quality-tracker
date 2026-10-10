const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const local = path.join(root, '.local-convex');
fs.mkdirSync(local, { recursive: true });
for (const name of ['convex', 'node_modules']) {
  if (!fs.existsSync(path.join(local, name))) fs.symlinkSync(path.join(root, name), path.join(local, name));
}
fs.copyFileSync(path.join(root, 'package.json'), path.join(local, 'package.json'));
const child = spawn(path.join(root, 'node_modules/.bin/convex'), ['dev', '--typecheck', 'enable', '--local-cloud-port', '3210', '--local-site-port', '3211'], {
  cwd: local, stdio: 'inherit', env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
});
child.on('exit', code => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
