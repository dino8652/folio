# Folio

Folio is a local-first personal finance workspace built with React, TypeScript, and Vite. New accounts start with an empty ledger. The backend is split between Cloudflare account/connector services and an encrypted on-device financial data engine.

## Run locally

Requires Node 24. Use the same origin and port each time to access the same vault.

```sh
npm ci
npm run dev
```

For the built app with production response headers on localhost, run `npm run build` followed by `npm run preview`. The development and preview URLs use separate browser storage.

## Import and review

- CSV and XLSX use common date, description, signed amount, debit, and credit headers. For XLSX, put transactions on the first worksheet. Legacy XLS needs conversion.
- Unlocked text PDFs with identifiable signed amounts are processed locally. Amounts reconciled against printed running balances are selected automatically and saved as verified. Other PDF candidates are flagged for verification. Scanned, password-protected, and unrecognized statement layouts need a CSV export.
- Select the account, date format, and sign convention. Inspect the preview, including unreadable rows and possible duplicates, then confirm the vault currency and import the selected rows.
- Each vault supports a single currency. Amounts use integer minor units. Mark transfers separately to exclude them from income, spending, and savings. Net cash flow is earned income plus other deposits less spending, excluding transfers. It does not represent an account balance.
- Monthly budget limits apply to spending in the chosen month. Recurring charges and unusual spending flags are heuristics based on imported history.

## Vault and hosting

- An IndexedDB record stores an AES-256-GCM envelope with a fresh nonce per write. For new accounts, a random account-specific key derives the non-extractable encryption key through PBKDF2-SHA256. Legacy vaults still use their original passphrase. Unlocking opens the current tab; locking or deleting broadcasts to other tabs using the same account. The vault auto-locks when idle.
- Files are passed to local readers with size limits. The app does not require an upload API, telemetry, external fonts, or an AI service. Keeping an original file is opt-in.
- Data belongs to the current browser profile and site origin. Browser data clearing can erase the vault. Folio accounts are hosted on Cloudflare Workers + D1. Financial records remain local; cross-device record sync is not enabled. Email recovery requires app-owned email configuration. A compromised browser, extension, or hosting origin remains outside the vault’s protection.
- Retention runs on open or save. Deletion removes records from the app’s storage. Copies saved outside the app, browser backups, and physical media are outside that operation.
- If hosting remotely, use a dedicated HTTPS origin. Serve `dist/` and apply the security headers from `public/_headers`. Some static hosts read that file directly. Configure and verify equivalent response headers on other hosts. Audit the actual deployment before using it with sensitive data.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm audit
```

The unit tests cover financial calculations, readers, retention, and the encrypted envelope. Browser tests exercise the built app through real files, local unlocking, concurrent edits, deletion, and isolation between browser profiles.

## Interface components

Folio adapts Unlumen UI's [Count Up](https://unlumen-ui-docs.vercel.app/docs/ui/effects/count-up) and [Kbd](https://unlumen-ui-docs.vercel.app/docs/ui/unlumen/kbd) primitives for its statement figures and search shortcut. See the [Unlumen UI license](https://unlumen-ui-docs.vercel.app/docs/license).

### Welcome and merchant discovery

Fresh browsers open the landing page. Email/password signup creates a Cloudflare account through Better Auth and opens onboarding. Session cookies are HttpOnly. Account records and sessions live in D1; financial records remain encrypted in the browser, scoped to the authenticated user ID. Account vault keys are encrypted with a server-held wrapping key derived from BETTER_AUTH_SECRET. Preserve that secret when rotating infrastructure: replacing it without rewrapping the keys would prevent vault unlock. Legacy vaults remain accessible separately. No sample ledger is loaded.

Set `FIRECRAWL_API_KEY` in `.dev.vars` for local development and in Wrangler secrets for production (never a `VITE_` variable). All local `/api` routes proxy to the same Worker used in production. Merchant requests require authentication, same-origin writes, bounded JSON bodies, and per-user minute/day quotas. Provider failures return safe messages and a request ID, never upstream credentials.

Opening an expense automatically searches Firecrawl. Results are candidate matches, not confirmed merchant identities. Structured addresses, hours, telephone and coordinates appear when published by a returned page; an OpenStreetMap embed loads only for valid coordinates. No Google Places key or API is used. Gmail and AI retain their separate authorization requirements.

### Cloudflare account service

Live app: https://folio-finance.prahaaladh64.workers.dev

Use `npx wrangler d1 migrations apply folio-accounts --local`, then `npx wrangler dev --port 8787` alongside Vite for local development. Local D1 accounts are separate from production. Deploy with `npm run build` and `npx wrangler deploy`; apply new migrations remotely before deploying code that needs them. `.dev.vars` holds local secrets; production secrets are set with Wrangler. Never commit them.

Account services include signup/signin, authenticator TOTP with one-time recovery codes, persistent account-specific vault keys, and conditional reset/verification email and Google login. SMS uses Twilio Verify when configured. `/api/account-capabilities` and Settings report actual configured availability. The user provides only an optional AI key. Deleting a local vault does not delete the hosted account.

Backend v2 service configuration (app-owner secrets, never requested from end users):
- Required: `BETTER_AUTH_SECRET` (preserve existing value), D1 `DB` binding.
- Merchants: `FIRECRAWL_API_KEY`.
- Email verification/recovery: `RESEND_API_KEY`, `EMAIL_FROM` with a verified sending domain.
- Google sign-in/receipt client: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; register `/api/auth/callback/google` on the Folio origin. Gmail additionally needs approved read-only Gmail scopes and authorized browser origins.
- SMS verification: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- Optional canonical origin: `APP_ORIGIN`. Production never trusts localhost origins.

## Backend v2 layout

- `worker/index.ts`: routing and authenticated service boundaries; compatible legacy paths and `/api/v2` aliases.
- `worker/services/`: workspace keys, bounded merchant discovery, quotas, account capabilities, email and phone adapters.
- `src/data/workspace.ts`: encrypted repository with queued operations, revision conflicts, generation checks and validated migrations.
- `src/domain/`: deterministic integer-money summaries, runtime ledger schema, atomic import commands and reconciliation. Readers remain file-format adapters, never an authority on balances.
- `src/use-vault.ts`: lifecycle adapter; network/storage failures surface explicitly instead of returning users to signup.

Text PDF, CSV and XLSX imports are supported. This is not a universal PDF reader: image-only documents need a compatible vision model in AI mode, and password-protected PDFs must first be unlocked. AI extraction is now available as an explicit import option; see the BYOK pipeline below. On-device mode never uploads statement files. External email, SMS and Google flows require live credentials and provider approval before end-to-end verification.

## BYOK statement pipeline

In Import statement, enable **Extract with my AI provider** after configuring a provider/key/model. This explicitly opts into external processing; on-device extraction remains the default. No extraction model is hardcoded.

- CSV/TSV/TXT: parse exact dates and signed cents in TypeScript; if headers are unfamiliar, request a bounded AI column mapping using the header/sample rows. Enrich merchant/category in batches of 80 using user-edited categories as hints. AI cannot write spreadsheet amounts or dates. XLSX uses the existing local worksheet reader, followed by the same enrichment.
- PDF/PNG/JPEG/WebP: inline file input to the selected model, with a 12 MB client limit. Extracted values must parse as exact cents and reconcile opening plus signed transactions to closing. Incomplete/mismatching results fail without saving. Reconciliation alone is not proof of accurate transcription. Documents without identifiable opening/closing balances need the local reader or a spreadsheet export.
- Gemini/OpenAI/OpenRouter: authenticated same-origin `/api/statements/parse` Worker endpoint, bounded payload, quota, timeout, fixed provider endpoints. Key and raw upload are transient and not written to D1. Custom compatible endpoints are contacted directly from the browser to avoid a server-side arbitrary-URL proxy, so CORS and file support are required.
- Retained originals are opt-in encrypted browser storage. Provider retention policies apply to external processing. No promise of universal PDF/model support; choose a model supporting your document format.
- File SHA-256 and signed account-scoped transaction duplicate comparisons run before commit. Original spreadsheet descriptions are preserved separately from enriched display names, so cleanup cannot break overlap detection.

Verification: 35 unit tests; existing 10 browser/API flows; additional BYOK browser flow with controlled provider responses verifies chosen credentials/model, unchanged CSV numbers/dates, and reconciled PDF import. Live extraction using a user's private provider key was not exercised by the agent.
