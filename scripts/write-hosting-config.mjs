import { writeFileSync } from 'node:fs';
import { headersFor } from './security-policy.mjs';
for (const app of ['admin','mobile']) {
  const config={
    $schema:'https://openapi.vercel.sh/vercel.json',
    buildCommand:app==='admin'?'npm run build':'npm run build:web',
    outputDirectory:'dist', cleanUrls:true,
    headers:[{source:'/(.*)',headers:Object.entries(headersFor(app)).map(([key,value])=>({key,value}))}],
  };
  writeFileSync(new URL(`../${app}/vercel.json`,import.meta.url),JSON.stringify(config,null,2)+'\n');
}
