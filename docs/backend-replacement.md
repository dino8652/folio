# Folio backend replacement

Requested 2026-11-16: replace the complete application backend rather than audit or patch the old implementation. Preserve the existing visual interface and account/data compatibility.

## Boundaries
- Cloudflare API: request policy, authentication, account capabilities, vault-key custody, merchant discovery, quotas, connector configuration, health.
- Local data engine: validated/versioned ledger, encrypted repository, serialized updates with cross-tab conflict detection, explicit restoration failures.
- Financial domain: integer cents, flow classification, reconciled balances, idempotent statement commits. Printed balances and user starting-value overrides remain distinct.
- Extraction adapters: PDF.js, CSV and XLSX convert file formats to candidates. The new import service validates and commits candidates independently of UI state. AI may suggest descriptions/layout; it cannot override money or reconciliation.

## Privacy and compatibility
No silent cloud upload of statements, ledger, original documents, or BYOK credentials. Preserve Better Auth tables, sessions and existing encrypted-key format; do not replace established cryptography with custom authentication. Preserve IndexedDB keys and envelope format. Apply additive migrations only. Local and deployed API use the same Worker.

## Verification
Unit tests for boundaries, math, imports, concurrency; Worker integration tests for authentication, ownership, validation, quotas and public endpoints; browser tests for signup, onboarding, imports, reload, editing and deletion. Build includes Worker typechecking. Deployment follows passing checks; report missing external credentials explicitly.

## Delivered and verified

2026-11-16: deployed Worker version `fa956982-87ad-4320-9b04-86a40cf26178` after migration `0003_backend_v2.sql`. Build including Worker typecheck passed. 31 unit tests and 10 browser/API tests passed. Browser tests use distinct synthetic client IPs to isolate auth rate-limit buckets; rate limiting stays enabled. Real local Worker exercised TOTP enrollment, recovery-code sign-in, disable, session ownership, persistent keys, imports, reload, concurrent tabs and deletion.

Production smoke: health version 2, anonymous vault-key access rejected, development-origin write rejected, unknown endpoint returns 404, landing/sign-in/password visibility with zero page errors. No production user ledger was opened or changed. Production secret inventory contains account secret and Firecrawl key only; email, SMS and Google require owner configuration and are reported unavailable. Live external email/SMS/Google flows remain unverified. Statement reader adapters and established cryptography/auth libraries are retained behind the replacement domain and service boundaries; scanned-PDF OCR and cross-device financial-data synchronization are not implemented.

Rollback caution: once TOTP is enabled on an account, do not roll back to a backend that does not enforce it. Keep BETTER_AUTH_SECRET unchanged; existing vault-key wrapping depends on it.
