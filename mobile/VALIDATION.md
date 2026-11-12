# Validation record

## Runtime checks

- Customer app: live email/password login against Supabase, session restoration after reload, logout, signup validation and five customer-only tabs passed. A temporary confirmed validation user was used; it and its sessions were removed afterward.
- Separate admin website: live login and database-backed role gate, dashboard counts, product form validation, categories/orders/settings pages, responsive layout and logout passed.
- A valid customer carrying spoofed admin user metadata was denied access to the admin panel.
- Real product photo upload using the approved logo, public retrieval, and removal passed. The validation image was removed.
- No signup, confirmation, reset or other test emails were sent. Delivery to a real inbox and deployment redirect configuration still need owner setup.

## Database checks

supabase/security-check.sql runs inside a transaction and rolls back every fixture. Assertions cover customer write denial, self-admin-grant denial, user-metadata spoofing, server order totals, inventory reservation, idempotent retries, cross-customer order isolation, overselling rejection, owner access, status transitions, cancellation restoring stock exactly once, stale inventory update rejection, configuration requirements, changed/tampered price rejection, and a complete pickup order lifecycle.

The original setup checks removed their validation fixtures. The owner was subsequently activated with the user-provided passcode; its local plaintext setup file was cleared. Real store inventory and settings may now have been added by the owner. Security validation must not delete or overwrite that data.

Supabase security advisors, TypeScript, lint, admin production build and Android export checks are recorded by the development run. The mobile UI was exercised through React Native Web, not on a physical Android device. No APK or production deployment has been created.

The 10 November 2026 hardening pass is recorded in `../SECURITY_AUDIT.md`. It includes real HTTP authorization/revocation/quota checks, 51 browser layout checks under the production CSP, XSS injection rejection, legacy owner-token cleanup and idle sign-out tests. Temporary accounts were deleted and transactional product/order fixtures rolled back.
