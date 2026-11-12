# United Super Store customer app

React Native / Expo Android app using the approved United identity. Owner administration is a separate website in ../admin. The customer app has no admin route or menu.

## Run

```powershell
npm ci
# The local .env is configured. For another installation, copy .env.example to .env and set its Supabase project URL and publishable key.
npm run android
```

For the web development preview use `npm run web`. No service-role key is included. Native sessions are stored with Expo SecureStore; the web preview uses Supabase's browser session storage. Passwords are cleared after successful authentication and are not saved by the app.

The web build uses static HTML for page titles and descriptions before JavaScript loads. Run `npm run build:web` and deploy only `dist`. This command validates public environment variables, checks output for exposed files/private credentials, and generates security headers. `npm run preview:web` serves the checked build locally with those headers and no development debugger. Serve `/browse`, `/cart`, `/orders` and `/account` from their matching `.html` files, and use `404.html` for unknown paths. Keep asset paths intact. The generated HTML contains no private account or order data.

## Customer features

- Email/password signup, email confirmation feedback, login, persistent session restoration and logout.
- Continue with Google on login and signup; provider activation steps are in GOOGLE_SIGN_IN.md.
- Password reset and recovery with PKCE; implicit bearer-token deep links are rejected. New passwords require 12 characters and at most 72 UTF-8 bytes in the UI; the hosted password policy must also be reviewed as described in the security audit.
- Live products and active categories, search, loading/empty/error/retry states, pull-to-refresh.
- Cart quantities, delivery or pickup, checkout details, configured fees and minimum order, cash payment.
- Server-calculated order totals, price-change checks, atomic stock reservation, duplicate-submit protection.
- Private, paginated order history with current status and original product/price snapshots.
- Responsive menu, clickable home logo, page metadata, branded favicon, custom 404, and a shared footer. The footer uses the real contact details saved in admin settings and automatically updates the copyright year.

The cart is held in memory for the current app process and is cleared on explicit logout. No products or orders were seeded. Ordering remains disabled until the owner configures store details, available fulfilment modes, delivery fee and minimum order in the separate admin website.

## Email callbacks

Configure Supabase Authentication Redirect URLs for the actual app and admin origins. The installed Android callback is unitedsuperstore://account. Web development uses http://localhost:8081/account (and http://127.0.0.1:8081/account if accessed that way). Expo Go uses the current Expo development URL. The production email sender and redirect allowlist must be configured in the project dashboard before launch; real email delivery has not been tested with a user inbox. The admin README has owner setup instructions.

## Validation and build

```powershell
npm run typecheck
npm run lint
npm run build:android
```

The EAS preview profile produces an Android APK after Expo account sign-in and project linking:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Set the public variables listed in `.env.example` in the selected EAS environment too. Firebase values are public web configuration, not OAuth client secrets. No cloud build was submitted, APK generated, or store release published. Package name: com.unitedsuperstore.app.

The security hardening pass patched the glob/minimatch toolchain advisories with reviewed overrides; both application audits currently report zero vulnerabilities. Expo SDK 58 and its matching React Native/React versions are retained. See `../SECURITY_AUDIT.md` for evidence, rate-limit scope and remaining hosted Auth settings.

Palette: src/colors.json mirrors ../design/colors.json. Logo: assets/logo.png. See VALIDATION.md for check results.
