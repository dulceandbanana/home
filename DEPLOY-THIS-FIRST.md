# Dulce & Banana — actual GitHub + Supabase repair

**GitHub:** https://github.com/dulceandbanana/dulceandbanana  
**Published site:** https://dulceandbanana.github.io/dulceandbanana/  
**Supabase project:** liplhvsthltszvdeqxwz  

## What was actually verified
- GitHub repository can be read, but connector **cannot write** (HTTP 403).
- Live GitHub `config.js` had empty Supabase URL/key; this package fixes those public fields.
- Supabase integration in ChatGPT cannot read the specified project (permission denied).
- PostgreSQL connection string provided contains literal `[YOUR-PASSWORD]`; it is **not** usable as supplied and must never go in GitHub.
- The system is not confirmed live; **do not open orders before the end-to-end test**.

## Publish the updated storefront (GitHub Pages)
1. Download/extract the ZIP package.
2. In `https://github.com/dulceandbanana/dulceandbanana`, upload **the contents** of this folder to the `main` branch root, including hidden `.github/` and `.nojekyll`, and replace files when prompted.
3. IMPORTANT: `index.html`, `store.js`, `config.js`, `delivery.js`, `styles.css`, `assets/`, `admin.js`, `admin.html`, `supabase/` must all be included. Never upload `index.html` alone.
4. Check GitHub Actions > `Verify Dulce and Banana storefront` for syntax/image-file checks. Verify actual website at https://dulceandbanana.github.io/dulceandbanana/.

## Activate the Supabase database (without sharing a password)
1. Open https://supabase.com/dashboard/project/liplhvsthltszvdeqxwz/sql/new.
2. Run `supabase/SAFE-PREFLIGHT-READ-ONLY.sql` first and inspect the results. This does not reveal customer information.
3. **Only if all bakery tables are missing and it is a new, EMPTY project**, run `supabase/FULL-INSTALL-NEW-PROJECT.sql` once.
4. If existing bakery tables are present, **do not run the full installer blindly**. Review existing schema and apply only needed upgrades. Running policies twice can fail; replacing tables can destroy customer orders.
5. Create your sister's account in Supabase Authentication > Users, then add ONLY its actual UUID to `public.admin_users` using the instruction in `START-HERE.md`. Do not make admin access public.

## Configure required Edge Function secrets IN SUPABASE (not GitHub)
From Supabase dashboard > Edge Functions > Secrets, set:

- `ALLOWED_ORIGINS` = `https://dulceandbanana.github.io`
- `TURNSTILE_SITE_KEY` = public key from Cloudflare Turnstile widget authorized for `dulceandbanana.github.io`
- `TURNSTILE_SECRET_KEY` = private key from the same widget

Supabase-provided `SUPABASE_URL` and server-side secret credentials must also be available to the functions; **never put secret keys in public JavaScript, GitHub files, or this chat**.

Lalamove is OPTIONAL at this stage and needs its own private API credentials and verified Velmont Residences pickup coordinates. Until those are configured, tell customers the bakery must confirm delivery fee. PayMongo remains paused; customers use GCash/Maya/MariBank manually only after approval.

## Deploy Supabase Edge Functions using GitHub Actions
1. Create a Supabase **personal access token** with access to this exact project. Do not paste it into ChatGPT or a public file.
2. Open `https://github.com/dulceandbanana/dulceandbanana/settings/secrets/actions` and add an Actions secret named `SUPABASE_ACCESS_TOKEN`.
3. After uploading `.github/workflows/deploy-supabase-functions.yml`, go to GitHub Actions > **Deploy Dulce and Banana Supabase Functions** > Run workflow.
4. This deploys `place-order`, `check-order`, and `report-transfer`. It does **not** deploy PayMongo or Lalamove functions until those merchant/courier credentials are ready.
5. The workflow never applies SQL automatically. Run and verify your database schema first.

## Check the order system before accepting customers
1. Visit `/connection-check.html` on the GitHub Pages site and click **Check order connection**.
2. Verify: `api_reachable=true`, `turnstile_configured=true`, catalogue items populated, and `accepting_orders=false` until you are ready.
3. Sign in to `/admin.html` as the specifically authorized bakery admin.
4. After a test on a blocked/available date and confirming delivery/pickup data, enable `Accept direct online preorder requests` in the dashboard.
5. Submit a genuine **test preorder from the real published website**, confirm a DB reference appears, and verify the same order in the private dashboard and database. Mark/cancel the test in the dashboard afterward.
6. Verify no browser secrets appear, no false payment confirmation, and that delivery pricing is not invented.

**Why the banner appears:** the storefront intentionally won't accept online orders until the Edge Function returns operational readiness and Turnstile is configured. Removing that safety check would lose customer orders.
