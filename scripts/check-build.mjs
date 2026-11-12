import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScripts, scriptHash, headersFor } from './security-policy.mjs';

export function checkBuild(app, outputRoot) {
if (!['admin','mobile'].includes(app)) throw new Error('Choose admin or mobile');
const root = outputRoot || fileURLToPath(new URL(`../${app}/dist/`,import.meta.url));
const allowedHashes = new Set(inlineScripts.map(scriptHash));
if (!existsSync(resolve(root,'index.html')) || !existsSync(resolve(root,'404.html'))) throw new Error('Required HTML documents are missing');
let files = 0;
function inspect(dir) {
  for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const file = resolve(dir,entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in public builds');
    if (entry.isDirectory()) { if (entry.name.startsWith('.')) throw new Error('Hidden build directory'); inspect(file); continue; }
    if (/^(?:\.env|\.git|package(?:-lock)?\.json)|\.(?:map|sql|pem|key|p12|jks|ts|tsx|md)$/i.test(entry.name)) throw new Error(`Non-public file in build: ${entry.name}`);
    files++;
    if (!/\.(?:html|js|json)$/i.test(entry.name)) continue;
    const text = readFileSync(file,'utf8');
    if (/(?:sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text)) throw new Error('Private credential found in build');
    for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      let claims;
      try { claims=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8')); } catch { continue; }
      if (claims.role==='service_role') throw new Error('Service-role token found in build');
    }
    if (entry.name.endsWith('.html')) {
      for (const [,attrs,body] of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/.test(attrs) || /type=["']application\/(?:json|ld\+json)["']/.test(attrs)) continue;
        if (!allowedHashes.has(scriptHash(body))) throw new Error(`Unreviewed inline script in ${entry.name}`);
      }
      if (/\bon(?:error|load|click)\s*=/i.test(text)) throw new Error(`Inline event handler in ${entry.name}`);
    }
  }
}
inspect(root);
writeFileSync(resolve(root,'_headers'),'/*\n'+Object.entries(headersFor(app)).map(([key,value])=>`  ${key}: ${value}`).join('\n')+'\n');
return files;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app=process.argv[2],files=checkBuild(app);
  console.log(`${app}: ${files} built files checked; strict security headers generated`);
}
