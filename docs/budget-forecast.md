# Budget & Cash Forecast

Office & Finance includes a native, lazy-loaded forecasting workspace. It uses the Hub's Supabase sign-in and one shared school document. The standalone application remains separate; this integration does not transfer or overwrite its data.

The module includes seasonal expense rules, monthly adjustments, tuition collection schedules, fundraising scenarios, report preview/import, planned versus actual monthly results, immutable board-report snapshots, and a cash outlook through July 31. Print uses its own portrait page definition so the scheduler's landscape layout stays separate. Styles apply only inside the forecast module.

## Access

Only `mconniry@wvcs.org` and `hmiller@wvcs.org` can open the module or read its records. General administrators and other Office & Finance users do not inherit this permission.

- Navigation and global search hide the feature from other accounts.
- The `budget-forecast` Edge Function verifies the bearer token with Supabase Auth on every operation, checks the confirmed email, and ignores client-supplied identities and roles.
- Database row-level security restricts direct workspace/audit reads to those same two accounts. Browser credentials cannot write the tables or execute the save RPC.
- The service-only save RPC rechecks the actor against `auth.users`, saves with an expected revision, preserves approved plans and archived reports, and records activity in the same transaction.
- OAuth nonces and encrypted QuickBooks tokens have no anonymous or authenticated grants.

The narrow forecast permission does not grant unrelated Office & Finance privileges. Both accounts must already have an enabled Hub login. A permitted user without general office access sees only the forecast tab.

## Activate in the existing Supabase project

Deploy the backend before releasing the frontend:

1. Apply only `supabase/migrations/20261023120000_add_budget_forecast.sql` to the Hub's existing Supabase project. It adds isolated tables and functions; it does not change existing school records or staff permissions.
2. Deploy `supabase/functions/budget-forecast` with its `deno.json` and the shared `financeForecast` files. Use `supabase functions deploy budget-forecast --project-ref <existing-project-ref> --no-verify-jwt` or the connected Supabase deployment tool. JWT gateway verification is disabled for Intuit's OAuth callback; the handler explicitly verifies all other operations. `supabase/config.toml` records this setting.
3. Set `HUB_PUBLIC_URL` to the exact production origin if it differs from `https://wvcshub.org`. Supabase supplies the server URL and service-role key automatically; never expose a service-role key in a frontend variable.
4. Deploy the Hub frontend through its existing Netlify pipeline.
5. Sign in as each permitted account and verify they see the same revision. Confirm an ordinary staff/admin account cannot load the feature or query its records. Start the school workspace, review cash balances, and import real reports. The initial screen uses clearly marked illustrative figures until a school workspace is created.

If the function or migration is missing, the module displays an unavailable state. It never falls back to storing school financial records in local storage or in an existing broadly accessible settings table.

The default route is `#/office-finance/forecast`; the board report is `#/office-finance/forecast?view=board`. The existing school login protects both routes.

## QuickBooks Online

File imports work without an Intuit connection. Optional server secrets are:

```text
QBO_CLIENT_ID
QBO_CLIENT_SECRET
QBO_TOKEN_ENCRYPTION_KEY
QBO_ENVIRONMENT=production
QBO_REDIRECT_URI
```

Use a base64-encoded random 32-byte encryption key. The default redirect URI is the existing Supabase project's `/functions/v1/budget-forecast` URL; register that exact URI with Intuit. Set `QBO_ENVIRONMENT=sandbox` for sandbox testing. Reauthorize for the Hub rather than copying standalone tokens.

The implementation retrieves only `ProfitAndLoss`, `BalanceSheet`, and `CashFlow` reports with GET requests, followed by review before import. Authorization uses Intuit's accounting scope. State is hashed, bound to an authorized user, expires after ten minutes, and is consumed once. Tokens are encrypted with AES-GCM; refresh and disconnect operations use a shared lock. No background synchronization is enabled.

## Development and verification

```bash
npm test
npm run typecheck:forecast
npm run build
deno check --node-modules-dir=manual --no-remote --no-lock --config supabase/functions/budget-forecast/deno.json supabase/functions/budget-forecast/index.ts
```

Tests cover forecast math, actual coverage dates, saved report history, both allowed users, denied staff/admin access, actor spoofing, stale revisions, direct SQL grants/RLS, and transactional audit/history preservation in PostgreSQL via PGlite. Browser QA uses illustrative data; real Supabase and Intuit authorization need the project connection and Intuit credentials. Before release, verify the deployed function and policies in the target project.

The reusable calculation/data package is under `supabase/functions/_shared/financeForecast`; React components and the host adapter are under `src/modules/financeForecast`.
