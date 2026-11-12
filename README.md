# United Super Store

Android-first customer app for Ahmad's store, with a separate owner administration website and Supabase backend.

- [Customer app setup](mobile/README.md)
- [Separate admin setup](admin/README.md)
- [Security audit and remaining launch requirements](SECURITY_AUDIT.md)
- [Responsive usability checks](design/USABILITY_CHECK.md)

For a local preview with production security headers and no development debugger:

```powershell
cd mobile
npm ci
# Configure the public variables from .env.example in your ignored .env file.
npm run build:web
npm run preview:web
```

In another terminal, run `npm ci`, `npm run build`, then `npm run preview` inside `admin`. Customer preview: http://localhost:8081; admin preview: http://127.0.0.1:5173. Both preview servers bind only to the local computer.

The browser uses publishable Supabase and public Firebase configuration. Private service keys, database passwords and OAuth client secrets must stay outside frontend code and public environment variables. Builds validate configuration and scan the output before serving it.

Database access is enforced by permissions, live-session checks and row-level security. A customer can read their own orders; owner membership is stored in a private database table. The admin passcode is checked by Supabase Auth.

Database migrations are in `supabase/migrations`, ordered by their actual hosted migration versions. `supabase/security-check.sql` verifies permissions and order invariants in a transaction that rolls back every fixture. Owner provisioning remains a separate server-only operation.

The root `index.html` is the original design reference and can be opened directly as a local file. Do not serve the repository directory as a website: serve only an app's checked `dist` build.

Approved identity: assets/brand/united-super-store-logo.png. Palette: design/colors.json; matching web tokens: design/tokens.css. Screens use a 4px spacing grid, 44px minimum touch targets, visible keyboard focus, and reduced-motion support.

Design guidance: UI/UX Pro Max, Hallmark and Unslop. Unslop by Damir Sokolovsky, https://github.com/heydamir/unslop, CC BY 4.0.
