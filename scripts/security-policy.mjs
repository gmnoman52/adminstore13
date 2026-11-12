import { createHash } from 'node:crypto';

export const backendOrigin = 'https://cforjvxhxduyasgllfhj.supabase.co';
const firebaseOrigin = 'https://united-super-store-e6131.firebaseapp.com';
// Only these reviewed inline scripts may run. Builds fail if another appears.
export const inlineScripts = [
  'globalThis.__EXPO_ROUTER_HYDRATE__=true;',
  "document.getElementById('year').textContent=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Karachi'}).format(new Date());",
];
export const scriptHash = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
export function headersFor(app) {
  if (!['admin','mobile'].includes(app)) throw new Error('Unknown application');
  const google = app === 'mobile';
  const directives = [
    "default-src 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
    `script-src 'self' ${inlineScripts.map(scriptHash).join(' ')}${google ? ' https://apis.google.com https://www.gstatic.com' : ''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    `connect-src 'self' ${backendOrigin} ${backendOrigin.replace('https:','wss:')}${google ? ` ${firebaseOrigin} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://apis.google.com https://www.gstatic.com` : ''}`,
    `frame-src ${google ? `${firebaseOrigin} https://accounts.google.com` : "'none'"}`,
    "form-action 'self'", 'upgrade-insecure-requests',
  ];
  return {
    'Content-Security-Policy': directives.join('; '),
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Strict-Transport-Security': 'max-age=31536000',
    'Cross-Origin-Opener-Policy': google ? 'same-origin-allow-popups' : 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
}
