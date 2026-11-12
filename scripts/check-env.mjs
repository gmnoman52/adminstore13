import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { backendOrigin } from './security-policy.mjs';

export function validatePublicEnv(app, env) {
  const prefix = app === 'admin' ? 'VITE_' : 'EXPO_PUBLIC_';
  const allowed = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY', ...(app === 'mobile' ? ['FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID'] : [])];
  for (const name of Object.keys(env).filter(key => key.startsWith(prefix))) {
    if (!allowed.includes(name.slice(prefix.length))) throw new Error(`Unreviewed public variable: ${name}`);
  }
  const url = env[prefix+'SUPABASE_URL'];
  if (!url || new URL(url).origin !== backendOrigin || new URL(url).username || new URL(url).password || new URL(url).pathname!=='/' || new URL(url).search || new URL(url).hash) throw new Error('Configure the approved HTTPS Supabase URL; review the CSP policy before changing projects');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env[prefix+'SUPABASE_PUBLISHABLE_KEY'] || '')) throw new Error('Only a publishable Supabase key belongs in frontend configuration');
  if (app === 'mobile') {
    for (const key of allowed.slice(2)) if (!env[prefix+key]) throw new Error(`Missing ${prefix+key}`);
    if (!/^AIza[A-Za-z0-9_-]{35}$/.test(env.EXPO_PUBLIC_FIREBASE_API_KEY)) throw new Error('Use a public Firebase API key, never an OAuth client secret');
    if (!/^1:\d+:web:[a-f0-9]+$/.test(env.EXPO_PUBLIC_FIREBASE_APP_ID)) throw new Error('Use the Firebase public web app identifier');
    if (!/^[a-z0-9-]+\.firebaseapp\.com$/.test(env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN)) throw new Error('Use a Firebase auth domain');
    if (env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN !== 'united-super-store-e6131.firebaseapp.com') throw new Error('Review CSP before changing Firebase projects');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = process.argv[2];
  if (!['admin','mobile'].includes(app)) throw new Error('Choose admin or mobile');
  const root = fileURLToPath(new URL(`../${app}/`, import.meta.url));
  let env = {};
  for (const name of ['.env','.env.local','.env.production','.env.production.local']) {
    const file = resolve(root,name); if (existsSync(file)) env = {...env,...parseEnv(readFileSync(file,'utf8'))};
  }
  validatePublicEnv(app,{...env,...process.env});
  console.log(`${app}: public environment validated; values are not logged`);
}
