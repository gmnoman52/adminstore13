# United Super Store security audit

Date: **10 November 2026, Asia/Karachi**. Scope: customer Expo app, separate React admin website, connected Supabase database/storage, local environment configuration, production web artifacts and all locally available Git history. Assumed use: one society's store, one owner and ordinary customer traffic. No public web deployment currently exists.

**Verdict:** application/database hardening is implemented and tested. Hosted Auth policy settings still need an owner review before public launch. This is a source/configuration audit with targeted attack tests, not a guarantee against every attack or a public-site penetration test.

## Fixed and verified

| Area | Finding or hardening | Result |
| --- | --- | --- |
| Session revocation | A signed access token could retain authority until token expiry after its session ended. | Data API checks and private-order RLS now verify a live `auth.sessions` record, account status and confirmation. A real revoked token received HTTP 401. |
| Owner authorization | Existing private owner membership was correct, but owner sessions were persistent and had no app-specific lifetime. | Membership stays server-controlled. Owner privileges expire after eight hours. Tokens use tab-scoped storage; legacy persistent owner tokens are cleared. The UI locks after 30 idle minutes, including when logout cannot reach the server. |
| Native authentication | Legacy callback handling accepted raw bearer-token fragments, allowing session-injection links. | Only the exact installed-app callback and a PKCE code are accepted. Codes are exchanged with the device's private verifier. Unexpected destinations and implicit token links are rejected. |
| Mutation abuse | No application-specific write/order quotas existed. | Atomic per-account quota: 120 committed mutations/minute. New orders: at most 5/10 minutes and 30/24 hours, across cancelled/completed orders too. Idempotent retries still return the original order. |
| Future database objects | New objects should not become reachable through default grants. | Future public grants are opt-in; client roles cannot create public objects. Privileged helpers stay private, fix their search path and derive identity from verified JWT claims. |
| Browser hardening | No checked production-header setup existed. | Enforced CSP, frame denial, MIME protection, referrer/permissions policy, HSTS and appropriate opener/resource policies. Only reviewed inline-script hashes are allowed; script `unsafe-inline` and `unsafe-eval` are absent. Google popup transport still opens without CSP violations. |
| Exposed files/debug | Serving a repository directory could publish source, environment files or Git metadata. | Production preview serves only approved built assets, binds to loopback, validates Host, denies unsupported methods and has request quotas. Sensitive paths return 404; production builds reject source maps, SQL, hidden directories, symlinks and credential material. Old development servers were stopped. |
| Environment safety | Public configuration and private credentials needed explicit separation. | Firebase public configuration moved to ignored environment variables. Default dev/build commands reject unreviewed public names, privileged Supabase keys, unexpected backend URLs and OAuth secrets in Firebase-key fields. Environment values are not logged. |
| Input/XSS | Text is already rendered through React escaping, but some length limits were missing at the database boundary. | Added server limits for descriptions, image URLs and store contacts, bounded cart payload size, matching form limits, and repaired the contact-email constraint. An HTML-shaped product name remained text; a real inline-script injection was blocked by CSP. No raw HTML rendering or dynamic SQL is used for form data. |
| Dependencies/cleanup | Mobile tooling had 12 moderate advisory entries; templates and old audit snapshots were unused. | Patched glob/minimatch with reviewed overrides, updated compatible admin tooling, and removed unused template assets/obsolete snapshots. Both full npm audits now report zero vulnerabilities. Lockfiles, future Dependabot updates and a pinned/read-only security workflow are included. |

Existing strengths were retained and re-tested: private owner membership, customer/order ownership, explicit table grants, RLS on all business tables, server-calculated prices, atomic stock reservation, stale-update protection, controlled order transitions and owner-only image writes. These were not reported as newly discovered leaks.

## Keys and Git history

- Gitleaks 8.30.1, verified against its official release SHA-256, scanned **all three existing commits across local branches/reflogs**.
- The scan identified two historical occurrences of the same public Firebase web identifier. No private service key, OAuth client secret, database password or plaintext owner passcode was detected.
- `.gitleaksignore` records only those exact reviewed historical fingerprints. New occurrences/credentials remain detectable. The reviewed history scan is clean; history was not rewritten.
- Current frontend `.env` files contain only the reviewed publishable/public configuration and are ignored by Git. Builds require a publishable Supabase key, not a service-role key.
- Public client configuration will still appear in browser/Android bundles and requests. It cannot be made secret by moving it into `.env`. Access is protected by authentication, database permissions and RLS. See [Firebase's API-key guidance](https://firebase.google.com/docs/projects/api-keys) and [Supabase API-key guidance](https://supabase.com/docs/guides/api/api-keys).

The owner password verifier was inspected by algorithm/cost only: **bcrypt, cost 12**. The plaintext owner passcode was not read, changed, logged or committed. Customer password handling remains with Supabase Auth rather than custom browser hashing. New-password UI validation requires 12 Unicode characters and at most 72 UTF-8 bytes; existing login passwords are not rejected by a new client minimum.

## Rate-limit and CORS scope

- `private.check_request` rejects unapproved browser origins and ended sessions before Data API requests. The only current browser origins are localhost/127.0.0.1 on customer port 8081 and admin port 5173.
- Native/non-browser clients may omit Origin. CORS/Origin checks are defense in depth, **not authentication**; a caller that omits/spoofs Origin still needs a valid token and row permissions.
- Supabase's gateway reflects browser CORS headers, but the application hook returned HTTP 403 to an unapproved Origin without returning catalogue data. No private data depends on CORS for protection.
- The database write quota is enforced in writable PostgREST transactions. GET/HEAD and stable read-only RPCs do not write counters. Failed transactions roll back counters; this is not a complete failed-request or DDoS limiter.
- The order quota serializes concurrent requests per account and counts saved orders. It cannot be bypassed by refreshing the page or changing request IDs.
- Local production-preview limits use the actual socket peer, ignore spoofed `X-Forwarded-For`, and separately allow 120 document requests/minute and 1,200 asset requests/minute. They are bounded and per process, not a distributed public-edge WAF.
- Supabase Auth/Storage/Realtime are separate services; a Data API hook does not change their settings. Managed Auth limits and a hosting-layer abuse policy still need a launch review. See [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## Evidence

| Check | Observed result |
| --- | --- |
| Customer TypeScript/lint; admin TypeScript/build/lint | Passed |
| Production web and Android bundle exports | Passed; no APK/device installation performed |
| Expo fingerprint generation with patched glob/minimatch | Passed; 32 native/configuration sources hashed successfully |
| `npm audit --json` in both apps | 0 info/low/moderate/high/critical vulnerabilities |
| Source environment guards; both build-output checks | Passed; no privileged credential material or source maps in checked outputs |
| Node security regression tests | Passed: environment rejection, limiter boundaries, CSP/config consistency and password limits |
| Native callback tests | Passed: PKCE/recovery, destination checks, incomplete callbacks and bearer-token injection rejection |
| HTTP production-server checks | Passed: headers, source/environment/Git path denials, methods, HEAD, Host rejection and spoof-resistant rate limits |
| Browser checks under enforced production CSP | 51 responsive route/editor/login checks at 320/375/768/1440px; zero page errors |
| Browser attacks and session tests | XSS text escaped; injected script blocked; old owner storage removed; non-owner denied; simulated idle and failed/offline-logout locking passed |
| Google popup transport | Reached the approved Firebase/Google sign-in popup with zero CSP violations; no real Google account login completed |
| Live anonymous/native API requests | Approved Origin and no-Origin catalogue reads: 200; unapproved Origin: 403; anonymous orders: 401; forged JWT: 401 |
| Live authenticated API tests | Spoofed admin metadata denied; fresh customer's orders isolated; real private owner membership recognized; mutation quota returned 429 + Retry-After; revoked token denied |
| Private schema exposure | Data API rejected the private schema with HTTP 406 |
| SQL transaction tests | RLS, totals, stock, idempotency, order isolation, status lifecycle, revocation, owner age, write/order quotas, Origin rejection and valid contact email passed |
| Cleanup | Temporary real Auth account/sessions/membership/quota removed; product/order fixtures rolled back; real inventory and orders untouched |
| Public Auth settings | Google/email enabled; signup enabled; automatic email confirmation disabled |
| Supabase advisors | No health findings. One warning: leaked-password protection disabled. Two informational notices describe intentionally private RLS tables with no client policies/grants; those tables deny client access. |

Security tests used isolated browser fixtures for UI attacks and a disposable real Auth identity for API checks. No real owner passcode was used in this pass, no test email was sent, and no permanent sample products/orders were added.

## Owner actions still required before a public launch

1. **Enable leaked-password protection where available.** The connected project still reports it disabled. The Supabase plugin has no Auth-configuration update tool, and the user requested plugin-only access rather than dashboard automation. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
2. **Verify the hosted password/reauthentication policy and Auth abuse settings.** Enforce the intended password minimum on the server; client checks alone cannot do this. Review managed sign-in/reset/signup IP quotas, CAPTCHA and owner MFA. Project-specific settings were not changed or inferred from local CLI defaults.
3. **Review authentication callbacks and Google restrictions.** Confirm the exact localhost account callbacks and `unitedsuperstore://account`, then add the eventual HTTPS production callback without wildcards. Review Firebase API restrictions/authorized domains. Real inbox recovery and complete Google sign-in remain unverified.
4. **Apply hosting controls when a real domain exists.** Serve only checked `dist` artifacts, activate the included headers on the selected host, add exact HTTPS origins to the private allowlist, and configure public-edge abuse protection. The app is currently local; no public deployment or WAF configuration was performed.
5. **Review platform-level controls.** Direct PostgreSQL SSL/network restrictions, backup restore, provider-account security and device security were outside the plugin-accessible changes in this pass. No live outage, destructive fuzzing or load test was attempted.

Owner tokens remain accessible to JavaScript in this static-app architecture. Tab-scoped storage and CSP reduce exposure; they do not provide an HttpOnly backend-cookie design. An offline lock clears the local UI/token; it cannot guarantee remote revocation while the Auth service is unreachable. The database's independent eight-hour owner-privilege limit still applies.

## Re-run the checks

```powershell
node --test scripts/security.test.mjs
node mobile/scripts/auth-callback.test.mjs
node scripts/check-http.mjs
```

From `admin`: `npm audit`, `npm run typecheck`, `npm run lint`, `npm run build`.

From `mobile`: `npm audit`, `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run build:android`.

Run `supabase/security-check.sql` as the project administrator; its fixtures always roll back. The applied hardening migration is `supabase/migrations/20261109192059_security_hardening.sql`. All eight local migration versions now match hosted history.

`scripts/security-policy.mjs` is the shared header policy. After a reviewed policy change, regenerate source hosting configuration with `node scripts/write-hosting-config.mjs`. An unexpected new inline script causes the artifact check to fail rather than weakening the CSP automatically.

The GitHub security workflow and Dependabot configuration are prepared locally. They have not run on GitHub because this security branch has not been pushed. No public deployment, paid upgrade or secret rotation was performed.
