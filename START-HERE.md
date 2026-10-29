# START HERE — Dulce & Banana website + Supabase installation

**Website:** https://dulceandbanana.github.io/dulceandbanana/  
**Supabase project:** `liplhvsthltszvdeqxwz`  
**Deployment type:** Static GitHub Pages frontend + Supabase database, Auth and Edge Functions. No Next.js server or `npm install` needed.  
**Order system status:** These are ready-to-deploy source files, **NOT** a claim that direct ordering has been activated or tested live.

The whole system is packaged. Customers will submit preorders **on the website**, receive an order reference if and only if Supabase accepts it, then track the order online. **No Facebook step is required.** The baker reviews availability and delivery fees. GCash, Maya and MariBank QR payments remain manually verified. PayMongo remains paused.

## 1. Supabase database — SQL Editor

1. Sign in to **the account that owns this exact Supabase project** at <https://supabase.com/dashboard/project/liplhvsthltszvdeqxwz/sql/new>. ChatGPT does not need to be connected to this project.
2. For a **brand-new EMPTY bakery database**, run `supabase/FULL-INSTALL-NEW-PROJECT.sql` once. This includes all three scripts in the correct order.
3. If any bakery tables already exist, **do not run the full installer**; inspect them first and apply only required upgrades (`schema.sql`, `payment_upgrade.sql`, `delivery_upgrade.sql`) using the existing setup docs. Multiple `CREATE POLICY` statements aren't intended to be rerun.
4. Run `supabase/VERIFY-SETUP-READ-ONLY.sql` to inspect RLS, products, settings and admin count. Initial `accepting_orders` is **false** for safety.

## 2. Create the administrator account

1. Supabase → **Authentication → Users** → add/invite your sister's admin user.
2. Get her user **UUID** from the Users page. In SQL Editor execute:

```sql
insert into public.admin_users (user_id) values ('REPLACE-WITH-HER-AUTH-USER-UUID') on conflict do nothing;
```

3. Never authorize everyone or disable row-level security. Admin login opens at `/admin.html` after GitHub deployment.

## 3. Cloudflare Turnstile (required to accept public orders)

1. Register a widget at <https://dash.cloudflare.com/> → Turnstile for the **hostname** `dulceandbanana.github.io` (no URL path).
2. Copy its site key and secret. The **site key** is public. The **secret** must stay in the Supabase Edge Function Secrets settings.
3. In Supabase → **Edge Functions → Secrets**, create:

```text
ALLOWED_ORIGINS=https://dulceandbanana.github.io
TURNSTILE_SITE_KEY=YOUR_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY=YOUR_PRIVATE_TURNSTILE_SECRET
```

Supabase Edge Functions also need their Supabase URL and a **server-side** service-role/secret key in runtime environment. Do not expose any secret, service-role or Turnstile secret in GitHub, frontend JavaScript or this chat.

## 4. Deploy order functions

Supabase → Edge Functions: deploy each folder's `index.ts`, ensuring auth/JWT settings match `supabase/config.toml`:

| Function | JWT verification | Purpose |
| --- | --- | --- |
| `place-order` | OFF | Public preorders, server-calculated prices, Turnstile; GET reports safe availability |
| `check-order` | OFF | Customer order status with reference and phone verification |
| `report-transfer` | OFF | Save transfer reference for manual verification |
| `lalamove-quote` | OFF | OPTIONAL live courier quotes; deploy only after Lalamove secrets are configured |
| `manage-payment-link` | ON | NOT REQUIRED while PayMongo is paused; leave undeployed |

For public functions, **JWT OFF does not mean unprotected**: they must retain the implemented origin allowlist, Turnstile checks and server-side validation. Rate limiting/WAF is recommended prior to higher-volume use.

## 5. Enable bakery order acceptance

1. Upload the **contents** of this ZIP to the root of `dulceandbanana/dulceandbanana` on GitHub (e.g., `index.html`, `store.js`, `config.js`, `styles.css`, `delivery.js`, `assets/`). Do not upload only `index.html`. Ensure GitHub Pages deploys from `main` `/ (root)`.
2. Open <https://dulceandbanana.github.io/dulceandbanana/connection-check.html>. It should show reachable, Turnstile configured, and the product list.
3. Log in to <https://dulceandbanana.github.io/dulceandbanana/admin.html> using the authorized Supabase Auth user. Check products and set baking days, cutoff, daily order limit.
4. Enable **Accept online orders** in the admin dashboard **only for testing first**. Submit one clearly labeled test preorder from the published site using a valid date and mobile number.
5. Confirm that the website shows a server-returned `DB-...` order reference and that the order appears in **Supabase `orders` AND `order_items`**, and in your sister's admin dashboard. Test retrieval by reference and phone. Cancel that test order before public launch.
6. Confirm prices, product accuracy, refund policy and customer contact arrangements before announcing the service.

**Important:** If the site shows “Online ordering is being connected,” don't hide that warning. It usually means the function or Turnstile isn't active, the order switch is off, or CORS / origin is misconfigured. The checkout cannot accept customer details until the server confirms availability.

## 6. Delivery and payments — optional upgrades

**Delivery origin:** Velmont Residences, Gatchalian, Las Piñas. A real Lalamove quote requires **private** partner API credentials and the exact pickup **latitude/longitude**. These are not provided and are intentionally NOT fabricated in source code. Enter them as Supabase Secrets, then deploy `lalamove-quote`. Quotes are estimates, not driver bookings; final fee is confirmed by the bakery. Customers can submit a preorder while Lalamove is not configured, with the fee quoted later. Pickup incurs no delivery fee.

**Payments:** GCash/Maya/MariBank QR images are included. PayMongo is **disabled** until you have an eligible merchant account. Only show QR transfers for bakery-approved amounts. Transfer details submitted on the website remain `awaiting_verification` until staff checks real incoming funds. Never claim an order is paid merely because someone entered a transfer reference or submitted a screenshot.

## 7. Website files

- `index.html`, `styles.css`, `store.js`, `delivery.js`, `sticky-nav.js` — working responsive storefront
- `config.js` — contains ONLY public Supabase URL and publishable key
- `assets/` — all food, logo and QR images (keep all files)
- `admin.html`, `admin.js`, `admin.css` — private admin UI (server Auth and RLS needed)
- `connection-check.html` — checks the public order service (does not place an order)
- `offline-preview.html` — standalone HTML with embedded images; usable for viewing but **cannot submit real orders from file://** due to origin restrictions
- `supabase/FULL-INSTALL-NEW-PROJECT.sql` — initial SQL for a new empty project; one-time
- `supabase/functions/.../index.ts` — Edge Functions for secure order receipt and optional services

**Never commit private API keys, passwords, or customer records.** The website can display products without a working backend, but real checkout must be verified before advertising it as operational.
