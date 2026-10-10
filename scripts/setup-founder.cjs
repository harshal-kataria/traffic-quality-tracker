// Owner-only setup; credentials and signing keys are never written to public assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
async function main() {
  const {generateKeyPair,exportPKCS8,exportJWK} = await import('jose');
  const filename = path.join(root,'.founder-access.json');
  const access = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename,'utf8')) : {email:process.argv[2] || 'founder@chasma-kart.local',password:crypto.randomBytes(24).toString('base64url')};
  fs.writeFileSync(filename,JSON.stringify(access,null,2),{mode:0o600});
  const keyFile = path.join(root,'.auth-keys.json');
  let values;
  if (fs.existsSync(keyFile)) values = JSON.parse(fs.readFileSync(keyFile,'utf8'));
  else {
    const keys = await generateKeyPair('RS256',{extractable:true});
    values = {JWT_PRIVATE_KEY:(await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g,' '),JWKS:JSON.stringify({keys:[{use:'sig',...await exportJWK(keys.publicKey)}]})};
    fs.writeFileSync(keyFile,JSON.stringify(values),{mode:0o600});
  }
  for (const production of [false,true]) {
    const flags = production ? ['--prod'] : [];
    for (const [name,value] of Object.entries({...values,SITE_URL:production?'https://dusty-dogfish-660.convex.site':'http://127.0.0.1:8082',FOUNDER_EMAIL:access.email,FOUNDER_INITIAL_PASSWORD:access.password})) {
      try { execFileSync(path.join(root,'node_modules/.bin/convex'),['env','set',...flags,`${name}=${value}`],{cwd:root,stdio:['ignore','ignore','pipe']}); }
      catch { throw new Error(`Could not set ${name} on ${production?'production':'development'}`); }
    }
  }
  console.log('Founder credentials saved locally; signing keys and setup credentials set in Convex.');
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
