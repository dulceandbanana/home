# Dulce & Banana — V6.1 checkout update

## What changed

- Checkout now flows through **Basket → Customer details → Review**.
- Product list, pricing, quantities, gift packaging, pickup/delivery and date selection are preserved.
- Confirmed direct preorders show an order reference and a short confirmation instead of a large copy/paste panel.
- The previous QR payment section has moved out of the basket to **Track order**, which displays payment choices **only after the backend confirms an approved order and final amount**.
- If a backend is **not** configured, the review step explains that no direct order was submitted and offers Facebook as a deliberate fallback.
- PayMongo links are generated server-side after bakery confirmation; the site never treats a screenshot or link creation as verified payment.

## GitHub Pages

Upload the full contents of this ZIP to the repository root, not an enclosing folder. The root must contain `index.html`, `styles.css`, `store.js`, `sticky-nav.js`, `config.js`, `admin.html`, `admin.js`, `admin.css`, `assets/`, `supabase/` and `.nojekyll`.

Published site: `https://dulceandbanana.github.io/dulceandbanana/`.

## Dedicated backend is required before enabling Place Preorder

1. Create a **new, dedicated Supabase project** for the bakery (don't reuse other product databases).
2. Run `supabase/schema.sql` and then `supabase/payment_upgrade.sql` in that project's SQL editor (read both files first; do not run in an unrelated database).
3. Add a bakery administrator in Supabase Auth and record that user's UUID in `public.admin_users`. Set the final baking schedule and production limit. `bakery_settings.accepting_orders` starts **false**.
4. Deploy functions `place-order`, `check-order` and `manage-payment-link`. Respect `supabase/config.toml`: only the two public guest endpoints have `verify_jwt=false`; admin payment management requires JWT. Public endpoints must validate requests server-side.
5. In Supabase project Edge Functions secrets, set `ALLOWED_ORIGINS=https://dulceandbanana.github.io` (plus an explicit local test origin for testing), `TURNSTILE_SECRET_KEY`, `PAYMONGO_SECRET_KEY`, and `PAYMONGO_MODE=test` first. Never commit secrets into GitHub or `config.js`.
6. Register a Cloudflare Turnstile site key for the GitHub Pages origin. Update `config.js` with the bakery's public Supabase URL, publishable API key and Turnstile site key. These are safe public client values; never put a Supabase service role key or PayMongo secret in frontend code.
7. Use PayMongo **test** mode first with your activated merchant account, and check an entire cycle: place order → admin approval and delivery fee → create payment link → customer tracking → test payment → verify payment as admin. The existing code uses `/v1/payment_links`, not deprecated `/v1/links`.
8. Configure security controls before accepting real orders: Turnstile verification, rate limiting for the public `check-order` and `place-order` endpoints (e.g. gateway rules), review RLS, and test allowed origins. Then switch the PayMongo key/mode to live and set `bakery_settings.accepting_orders=true` after your sister confirms capacity.

**Payment verification limitation:** V6.1 retains the admin-triggered verification of matching paid PayMongo transactions, rather than a webhook listener. Payments do not automatically become "Paid" until the bakery verifies them through its admin interface. For higher volumes, implement an authenticated, idempotent PayMongo webhook for `link.payment.paid`.

### Operational cautions

- A customer clicking **Continue through Facebook** is not a direct preorder submission. The browser clearly says this when the backend is disconnected.
- Manual GCash/Maya/MariBank transfers must be checked in the actual receiving account before being marked paid.
- Protect customer personal information and never publicly expose the `orders` table through permissive RLS policies.
- Inspect and verify AI-generated concept product photographs against what the bakery actually sells before live marketing.
