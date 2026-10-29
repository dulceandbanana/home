# Dulce & Banana V6.2 — Activate direct on-site ordering

The public project reference supplied by the bakery owner is **`liplhvsthltszvdeqxwz`**. The static storefront has already been set to `https://liplhvsthltszvdeqxwz.supabase.co` in `config.js`. **A project ID alone does not grant permission to deploy functions or enable database access.**

**Current state:** The site will NOT send orders to Facebook. It will only accept direct orders when the Supabase `place-order` endpoint confirms that ordering is enabled. Otherwise, the final order button is disabled and clearly states that no order was received. This protects customers from false confirmations.

## Activate once Supabase project access is granted

1. In the **Dulce & Banana Supabase project**, open **SQL Editor**, carefully review and run `supabase/schema.sql` **once**, then `supabase/payment_upgrade.sql`. Do **not** apply these SQL files to any other application's project. The schema defaults to `accepting_orders=false`.
2. Under **Authentication → Users**, create or invite the bakery owner's admin account. Copy that account's Auth UUID and run in the SQL Editor: `insert into public.admin_users(user_id) values ('ADMIN_UUID') on conflict do nothing;`. This is the only user who can read the private order dashboard until more admins are explicitly added. Never grant anonymous SELECT on `orders` or `order_items`.
3. Set up **Cloudflare Turnstile** for `dulceandbanana.github.io` (and any custom domain you plan to use). Copy the **public site key** and **secret key** from its dashboard.
4. Configure Supabase **Edge Function secrets** (never in GitHub files):
   - `ALLOWED_ORIGINS=https://dulceandbanana.github.io` (origin only, no `/dulceandbanana/` path; add exact additional origins separated by commas if required).
   - `TURNSTILE_SITE_KEY=your public Turnstile site key`
   - `TURNSTILE_SECRET_KEY=your private Turnstile secret`
   - Supabase runtime `SUPABASE_URL` and an appropriate `SUPABASE_SERVICE_ROLE_KEY` (or the provider's documented current secret-key environment variable) are available to the function environment. **Do not paste these into `config.js`.**
5. Deploy the public Edge Functions from `supabase/functions/`:
   - `place-order` with `verify_jwt=false` (but Turnstile, origin allowlist and server validation REQUIRED)
   - `check-order` with `verify_jwt=false` (rate-limit tracking requests in production)
   - `manage-payment-link` with JWT verification ON, and only after PayMongo credentials are available.
   - Deployment should follow `supabase/config.toml`; inspect auth settings in the Supabase dashboard to ensure they match.
6. `config.js` **already includes** the supplied public/publishable key for the storefront and the **`admin.html`** login. This is *not* a database administrator key. Do not add any service role/secret key to browser code. To rotate the public key, update only this config file.
7. In the private admin dashboard, configure permitted baking days, minimum notice, and daily capacity with the baker. Then turn **Accepting online orders** ON after a successful end-to-end test.
8. Upload the contents of this package to your GitHub repository **root** (including `store.js`, `styles.css`, `config.js`, `sticky-nav.js`, `assets/`, and `supabase/`) to publish V6.2. Keep GitHub Pages settings pointing at `main` and `/ (root)`.

## Checkout behavior

- Visitor sees **Basket → Details → Review** and presses **Place preorder on this website**.
- The browser submits to `/functions/v1/place-order` at the configured project URL without Facebook.
- Turnstile protects guest order requests. Server code verifies the item IDs and recalculates the order total from database prices via `create_preorder`; it never trusts prices typed into the browser.
- Only after Supabase returns `201` with an order reference does the site show **Request received** and save the reference in the tracking form. Order records appear in **admin.html** for the authorized baker.
- Order status is initially **pending_review**. No payment has been collected. Your sister confirms the baking date and delivery fee before requesting payment.
- PayMongo is a separate approval-stage integration; its **secret key stays server-side** and the hosted link only appears after bakery confirmation. For manual QR transfers, your sister must verify the receiving account herself.

## Testing (do this before announcing that checkout is live)

1. From the published website, verify that a closed bakery or missing Edge Function shows **Online ordering unavailable** (not a false placed order and not a Facebook redirect).
2. In a staging setup, enable online orders and send a **test** one-item preorder using an eligible date and Turnstile. Verify the site shows a reference **and** the entry appears in the Supabase `orders` and `order_items` tables/admin dashboard.
3. Verify incorrect phone numbers cannot retrieve order tracking. Test blocked dates, quotas, unavailable products and invalid quantities.
4. Test the admin sign-in with one explicitly authorized account and confirm public visitors cannot read customer records (RLS).
5. Test an order approval and its payment link with PayMongo *test keys* before using live merchant credentials. Never change an order to paid based only on screenshots.
6. For spam resilience, add upstream rate limiting / WAF and monitor Edge Function error rates. Cloudflare Turnstile is used for public submissions; strict CORS alone does not prevent bots outside browsers.
7. Ensure the product images represent actual baked goods and clearly state fulfillment, cancellation and privacy policies.

## Notes

- In a standalone `file://` preview, the browser origin is `null`, so secure direct ordering is intentionally unavailable. Serve the site from the allowed published HTTPS domain for real use.
- The project reference is a public identifier, **not** a credential that grants ChatGPT deployment permission. The connected Supabase account returned a permission error for this specific project. Until access is granted or you manually deploy the files, no live database order can be asserted or demonstrated.
- GitHub Pages is static hosting. It cannot securely receive and store orders by itself. The Supabase Edge Function and database are required.
- Administrator keys, PayMongo secret keys, and Turnstile secret keys must never be committed to GitHub.
