import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFor } from './security-policy.mjs';
import { checkBuild } from './check-build.mjs';

export function createLimiter(limit=120, windowMs=60000, maxClients=10000) {
  const clients = new Map();
  return (key,now=Date.now()) => {
    let entry = clients.get(key);
    if (!entry || now>=entry.reset) entry={count:0,reset:now+windowMs};
    clients.delete(key); clients.set(key,entry);
    if (clients.size>maxClients) clients.delete(clients.keys().next().value);
    entry.count++;
    return {allowed:entry.count<=limit,retryAfter:Math.max(1,Math.ceil((entry.reset-now)/1000))};
  };
}
export function createStaticServer(app) {
  if (!['admin','mobile'].includes(app)) throw new Error('Choose admin or mobile');
  const root=fileURLToPath(new URL(`../${app}/dist/`,import.meta.url));
  if (!existsSync(root)) throw new Error('Run the production build first');
  // Revalidate at startup; an old _headers file cannot certify a failed new build.
  checkBuild(app);
  const publicFiles=new Set();
  const allowed=/\.(?:html|js|css|png|jpe?g|webp|ico|svg|ttf|woff2?)$/i;
  function walk(dir,prefix='') { for(const entry of readdirSync(dir,{withFileTypes:true})) { if(entry.name.startsWith('.') || entry.isSymbolicLink()) continue; const name=prefix+'/'+entry.name; if(entry.isDirectory()) walk(resolve(dir,entry.name),name); else if(allowed.test(entry.name)) publicFiles.add(name); } }
  walk(root);
  const limit=createLimiter();
  const assetLimit=createLimiter(1200);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'};
  return createServer((req,res)=>{
    for(const [key,value] of Object.entries(headersFor(app))) res.setHeader(key,value);
    res.setHeader('Cache-Control','no-store');
    let hostname;
    try { hostname=new URL('http://'+req.headers.host).hostname; } catch { res.writeHead(400); return res.end('Invalid host'); }
    if(!['localhost','127.0.0.1','[::1]'].includes(hostname)) {res.writeHead(421);return res.end('Unapproved host');}
    if(!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}); return res.end('Method not allowed'); }
    let pathname;
    try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Invalid path'); }
    const selected=pathname==='/'?'/index.html':publicFiles.has(pathname)?pathname:publicFiles.has(pathname+'.html')?pathname+'.html':'/404.html';
    const quota=(extname(selected)==='.html'?limit:assetLimit)(req.socket.remoteAddress);
    if(!quota.allowed) { res.writeHead(429,{'Retry-After':quota.retryAfter}); return res.end('Too many requests'); }
    const status=selected==='/404.html'&&pathname!=='/404.html'?404:200;
    res.writeHead(status,{'Content-Type':types[extname(selected)]});
    if(req.method==='HEAD') return res.end();
    createReadStream(resolve(root,'.'+selected)).on('error',()=>res.destroy()).pipe(res);
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=process.argv[2],port=Number(process.env.PORT || (app==='admin'?5173:8081));
  if(!Number.isInteger(port)||port<0||port>65535) throw new Error('Invalid port');
  const server=createStaticServer(app);
  server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({app,url:`http://127.0.0.1:${server.address().port}`,mode:'production'})));
}
