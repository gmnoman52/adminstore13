import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createStaticServer } from './serve-built.mjs';

for(const app of ['admin','mobile']) {
  const server=createStaticServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const home=await fetch(base); assert.equal(home.status,200);
    assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal(home.headers.get('x-content-type-options'),'nosniff');
    assert.equal(home.headers.get('cache-control'),'no-store');
    assert.equal(home.headers.get('access-control-allow-origin'),null);
    const badHost=await new Promise((resolve,reject)=>{const req=request(base,{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()});
    assert.equal(badHost,421);
    for(const path of ['/.env','/.git/config','/package.json','/src/App.tsx','/%2e%2e%2f.env','/supabase/security-check.sql','/missing-page']) {
      const response=await fetch(base+path); assert.equal(response.status,404,path); assert(!(await response.text()).includes('sb_publishable_'),path);
    }
    assert.equal((await fetch(base,{method:'POST'})).status,405);
    const head=await fetch(base,{method:'HEAD'}); assert.equal(head.status,200); assert.equal(await head.text(),'');
    let denied=false;
    for(let i=0;i<125;i++) {const response=await fetch(base,{headers:{'x-forwarded-for':`10.0.0.${i}`}});if(response.status===429){assert(response.headers.has('retry-after'));denied=true;break}}
    assert(denied,'Spoofing X-Forwarded-For bypassed the local rate limit');
    console.log(`${app}: security headers, exposed-file denials, methods, HEAD and rate limits passed`);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
