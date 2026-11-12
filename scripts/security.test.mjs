import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep, join } from 'node:path';
import { createLimiter } from './serve-built.mjs';
import { validatePublicEnv } from './check-env.mjs';
import { headersFor, inlineScripts, scriptHash } from './security-policy.mjs';
import { validateNewPassword } from '../mobile/src/lib/password.ts';
import { checkBuild } from './check-build.mjs';

test('frontend environment rejects privileged and unreviewed variables',()=>{
  const env={VITE_SUPABASE_URL:'https://cforjvxhxduyasgllfhj.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
  validatePublicEnv('admin',env);
  assert.throws(()=>validatePublicEnv('admin',{...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_not_allowed'}));
  assert.throws(()=>validatePublicEnv('admin',{...env,VITE_DATABASE_PASSWORD:'not-allowed'}));
  assert.throws(()=>validatePublicEnv('admin',{...env,VITE_SUPABASE_URL:'https://attacker.example'}));
  assert.throws(()=>validatePublicEnv('admin',{...env,VITE_SUPABASE_URL:'https://user:pass@cforjvxhxduyasgllfhj.supabase.co'}));
});
test('rate limiter rejects bursts and resets at the window boundary',()=>{
  const allow=createLimiter(2,60000,2);
  assert(allow('a',0).allowed); assert(allow('a',0).allowed);
  assert.deepEqual(allow('a',1),{allowed:false,retryAfter:60});
  assert(allow('b',1).allowed); assert(allow('a',60000).allowed);
});
test('CSP prohibits arbitrary inline scripts, eval, frames and objects',()=>{
  for(const app of ['admin','mobile']) {
    const headers=headersFor(app),csp=headers['Content-Security-Policy'];
    assert(!csp.includes('unsafe-eval'));
    assert(!csp.split('script-src ')[1].split(';')[0].includes('unsafe-inline'));
    for(const script of inlineScripts) assert(csp.includes(scriptHash(script)));
    assert(csp.includes("frame-ancestors 'none'")); assert(csp.includes("object-src 'none'"));
    assert(!('Access-Control-Allow-Origin' in headers));
    const config=JSON.parse(readFileSync(new URL(`../${app}/vercel.json`,import.meta.url),'utf8'));
    assert.deepEqual(Object.fromEntries(config.headers[0].headers.map(x=>[x.key,x.value])),headers);
  }
});
test('new passwords respect bcrypt byte limits without rejecting existing login passwords',()=>{
  validateNewPassword('a-long-passphrase'); validateNewPassword('a'.repeat(72));
  assert.throws(()=>validateNewPassword('too-short'));
  assert.throws(()=>validateNewPassword('a'.repeat(73)));
  assert.throws(()=>validateNewPassword('😀'.repeat(19)));
  assert.throws(()=>validateNewPassword('😀'.repeat(6)));
});
test('stale build markers cannot allow injected scripts or private credentials',()=>{
  const root=mkdtempSync(join(tmpdir(),'uss-security-'));
  try {
    writeFileSync(join(root,'index.html'),'<html><body>Store</body></html>');
    writeFileSync(join(root,'404.html'),'<html><body>Not found</body></html>');
    checkBuild('admin',root);
    writeFileSync(join(root,'index.html'),'<script>window.attacker=true</script>');
    assert.throws(()=>checkBuild('admin',root),/Unreviewed inline script/);
    writeFileSync(join(root,'index.html'),'sb_secret_'+'fixture');
    assert.throws(()=>checkBuild('admin',root),/Private credential/);
  } finally {
    assert(resolve(root).startsWith(resolve(tmpdir())+sep+'uss-security-'));
    rmSync(root,{recursive:true,force:true});
  }
});
