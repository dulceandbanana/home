# Dulce & Banana V6.4 — Delivery and payments deployment

**Status: integration code prepared; real-time prices / direct orders NOT live until all steps below are completed and a real test succeeds.** The connected Supabase plugin currently cannot administer project `liplhvsthltszvdeqxwz` (permission denied). Changes in this package have NOT been installed on that remote database or on live GitHub Pages.

## A. Why this is the correct pricing model

Lalamove's V3 quotation endpoint returns the actual courier route price and distance. Do not calculate a fake price from straight-line kilometers. Quotation IDs generally expire after approximately 5 minutes. For baked goods ordered days in advance, the fee displayed now is only indicative; the bakery rechecks the quote close to fulfillment and confirms the amount *before payment*.

The website NEVER automatically books Lalamove. Booking a rider requires separate partner API credentials, billing/wallet setup, order creation and staff authorization. This update **quotes only**.

## B. Prerequisites

1. **Exact pickup pin**: Open Google Maps at the real pickup entrance inside Velmont Residences, Gatchalian, Las Piñas; copy its exact latitude and longitude. Do not substitute a neighborhood midpoint. Keep the exact coordinates in server secrets (not public source code).
2. **Lalamove Partner Portal**: register and retrieve API key + secret from the developer portal. Start with sandbox. Production use requires the applicable merchant activation / wallet funding. See https://developers.lalamove.com/ and https://www.lalamove.com/en-ph/business/api-solutions.
3. **Supabase access**: verify the correct authorized account can open project https://supabase.com/dashboard/project/liplhvsthltszvdeqxwz . Run the base schema before running the add-on SQL.
4. **Cloudflare Turnstile**: set site key and secret and add the actual published website hostname to the site allowlist.

## C. Apply database changes

Within the approved **Dulce & Banana** project only, run in SQL Editor:

1. `supabase/schema.sql` (if base bakery tables are not already installed)
2. `supabase/payment_upgrade.sql` (only if the payment columns have not been installed; inspect existing schema first)
3. `supabase/delivery_upgrade.sql` (new quote tokens, private delivery estimates, private payment reports)

The `delivery_quotes` and `payment_reports` tables have row-level security. Anonymous visitors are **not** granted direct access to either table.

## D. Edge Function secrets

In Supabase Edge Function Secrets, set:

| Secret | Value / note |
| --- | --- |
| `ALLOWED_ORIGINS` | `https://dulceandbanana.github.io` (add preview origin only when trusted) |
| `TURNSTILE_SECRET_KEY` | Cloudflare secret, server only |
| `TURNSTILE_SITE_KEY` | Public site key (also returned by the order service GET) |
| `LALAMOVE_API_KEY` | Lalamove partner key (private) |
| `LALAMOVE_API_SECRET` | Lalamove HMAC secret (private) |
| `LALAMOVE_MODE` | `sandbox` for test; `production` only after approval |
| `LALAMOVE_PICKUP_LAT` | Exact verified Velmont pickup latitude |
| `LALAMOVE_PICKUP_LNG` | Exact verified Velmont pickup longitude |
| `LALAMOVE_SERVICE_TYPE` | Confirm supported PH service type via Lalamove Get City Info, often `MOTORCYCLE` |

Supabase's own `SUPABASE_URL` and service-role environment values must remain server-side. **Never put Lalamove secret, PayMongo secret, or Supabase service-role key in `config.js`, GitHub Pages, or HTML**.

## E. Deploy Edge Functions

Use Supabase Dashboard / CLI for the specific project:

- `supabase/functions/place-order/` — guest orders, Turnstile, server-side prices; now associates an already-verified, server-issued quote token when available.
- `supabase/functions/check-order/` — tracking after order is received.
- `supabase/functions/lalamove-quote/` — live Lalamove quotation (public + Turnstile, **not courier booking**).
- `supabase/functions/report-transfer/` — receives a transfer reference **only for manual verification**, never marks paid.

The provided `supabase/config.toml` sets these guest functions to `verify_jwt = false` and they enforce allowed origins plus other server checks. For deployment commands, first check your Supabase CLI `--help`, then link project `liplhvsthltszvdeqxwz` and deploy the functions.

Set a live `bakery_settings.accepting_orders = true` only after verifying daily limits, baking days, Turnstile, permissions, and customer notification process. See base README.

## F. Customer journey

1. Choose products → basket → customer details.
2. Delivery customer enters full address and **selects exact destination pin** on map or opts into device location sharing.
3. Complete CAPTCHA and click **Get Lalamove delivery estimate**. Backend returns PHP quote and route distance. No credentials touch browser.
4. Review order. Quote shows in *estimated* total if valid; otherwise the bakery confirms delivery manually. Pickup is free.
5. Place direct preorder → server returns a genuine `DB-...` reference. No money collected yet.
6. Bakery confirms availability, near-term courier fee and final amount in admin dashboard.
7. Customer tracks order on site and uses approved GCash, Maya or MariBank QR.
8. Customer can report method/amount/reference on site; bakery verifies **actual receipt in bank/wallet** then (and only then) marks order paid. No PayMongo account is required for this manual flow.

## G. Important limits

- The map uses Leaflet and OpenStreetMap tiles online; no offline maps or paid geocoding is included. Customers must place the correct pin; a typed address alone cannot be reliably geocoded without a separate provider.
- Live courier quote exists **only** when credentials, pickup coordinates, access and endpoint are active. There is no invented peso-per-km fallback.
- Future delivery prices are not guaranteed. The bakery reconfirms near dispatch.
- Delivery quotes do not book drivers. Consider later adding authorized Lalamove booking and tracking.
- Manual transfer reports are not payment verification; staff checks receiving accounts.
- The existing PayMongo links UI is paused via `paymentMode: 'manual-qr'` in `config.js`. If PayMongo refused another merchant/account or payment setup, resolve it with their team before enabling it again.
- Never share private API keys in chat or source control.

## H. Smoke test before publishing

- On a mobile browser confirm all 8 products show photos; add box of 4 and loaf → basket totals match.
- Try pickup → delivery fee is ₱0; try delivery → request a real *sandbox* Lalamove quote with a pinned destination.
- Check quote expiry and changing the address invalidates the quote.
- Turn off Lalamove secrets → no fake delivery price shown; order remains pending review.
- Send a real low-value test preorder; confirm a row appears in `orders` and quote association is recorded where applicable.
- Confirm tracking requires correct order reference + phone; payment-report status is Awaiting verification.
- Confirm an unverified report does not mark an order paid.
- Validate PayMongo is not shown as a live payment method.
- Confirm customer details are not public and RLS security advisor is clean.
