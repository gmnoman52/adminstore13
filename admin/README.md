# United Super Store admin website

This is a separate React/Vite website. No admin screens or links are included in the customer Android app.

## Run

```powershell
npm ci
# Local .env is already configured. For another installation, copy .env.example to .env and fill in the project URL and publishable key.
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173. For a preview with production security controls, run `npm run build` then `npm run preview`. Deploy only `dist`, with the two VITE_SUPABASE public environment variables set during the build. `vercel.json` and the generated `_headers` provide hosting headers. Never put a service-role key in this website.

## Owner setup

The admin website asks only for a passcode. There is no email field, public admin signup or email reset flow. Customer authentication in the mobile app is unchanged.

Owner tokens use tab-scoped session storage. Existing persistent owner tokens are removed during upgrade, so the owner needs to log in again. The UI signs out after 30 minutes without activity; the database independently expires owner privileges after eight hours and rejects revoked sessions immediately. The passcode itself is not changed.

1. Enter a passcode of at least 12 characters into the private local file C:/Users/faisa/.codex/secrets/united-super-store-owner-passcode.txt. It is outside the repository and dev-server roots.
2. Run node ../scripts/hash-owner-passcode.mjs from this directory to prepare a bcrypt hash locally. The helper never prints the plaintext.
3. An authorised project administrator provisions the account with ../supabase/provision-passcode-owner.sql using that hash. This is deliberately not a public API. Once provisioned, clear the local plaintext file.
4. Unlock the website using the passcode. Supabase Auth verifies it, hashes it server-side and applies its authentication rate limits. Database and image writes still require private owner membership.

The internal identifier owner@united-super-store.invalid is a technical username, not a mailbox or secret. No owner email or confirmation email is required. The passcode must never be embedded in browser code, VITE_ variables, Git or chat. The owner account has been activated with the user-provided passcode; no default passcode is used. Live passcode unlock and database owner access were verified. The temporary local plaintext file was cleared afterward. Passcode changes go through the project administrator; session revocation and existing admin access must be handled during rotation.

Customer confirmation and password-reset email callback setup remains described in ../mobile/README.md.

## Features

- Actual dashboard counts, with no fabricated metrics.
- Product search, visibility filter and pagination; create, edit and delete products; available stock and exact rupee/paisa prices.
- Product photo upload to a public product-images bucket, restricted to owner writes, JPG/PNG/WebP up to 5 MB; photos are resized to at most 1200px and compressed before upload.
- Category creation, editing, visibility and deletion.
- Order filters, paging, customer details, immutable item/price snapshots and cash payment information.
- Database-enforced status transitions, inventory reservation and cancellation stock restoration.
- Store name, address, phone, optional public contact email, fulfilment options, delivery fee, minimum order and accepting-orders switch. Saved contact details become clickable footer links in both apps.
- Optimistic concurrency prevents stale product forms from overwriting newer inventory updates.

Store ordering remains disabled. No demo product, category, price, order, customer or delivery fee was seeded. Real business contact details are configured; fulfilment fees/options still need confirmation before ordering is enabled.

## Validation

`npm run build` and `npm run lint` validate this website. See ../mobile/VALIDATION.md for cross-app runtime and backend checks. Apply files in `../supabase/migrations` in timestamp order for a new database. Existing hosted migrations are already applied. `../supabase/security-check.sql` verifies permissions, session revocation, quotas, prices, inventory and order invariants in a rolled-back transaction.

On production hosting, keep the supplied `404.html` as the unknown-path fallback. The admin pages use hash routes under `/`.

See `../SECURITY_AUDIT.md` before public deployment. The Supabase plugin does not expose hosted Auth configuration updates, so outstanding password/rate-limit settings require the owner to review those controls separately.

The Messages page reads authenticated customer inquiries, allows the owner to mark them read and opens an email reply in the owner’s mail app. Replies include business details and a promotional-email opt-out instruction; no automatic email is sent. Ahmad's supplied international WhatsApp number is configured in store settings. Contact authorization and throttling are covered by `../supabase/contact-check.sql`.

The Privacy page tracks account/data deletion, access, correction and promotional-email opt-out requests. Status changes do not delete accounts or unsubscribe external lists; the owner must fulfil or explain each request securely before closing it. Customer identity fields are immutable from the panel. New/changed photos require ownership/commercial-permission acknowledgement and use the store's own product-image bucket. See `../PRIVACY_AUDIT.md`, `../ASSET_PROVENANCE.md` and `../supabase/privacy-check.sql`.

The photographed catalogue now contains 140 imported entries plus the preserved Banana product. Bundled, labelled AI illustrations provide images until the owner uploads real photos. Product editors show source review notes, an optional product code, **Price confirmed** and **Stock confirmed** controls. Six candidate prices and all imported stock quantities remain unconfirmed; those products cannot be ordered until the owner confirms the actual values. See `../catalogue/README.md` and `../supabase/catalogue-check.sql`.
