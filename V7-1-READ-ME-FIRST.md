# Dulce & Banana V7.1 — Cloudflare Turnstile Checkout Repair

This is a *frontend-only* update for the live GitHub Pages storefront (`https://dulceandbanana.github.io/home/`).

## Fast deployment (recommended)

1. Open the `dulceandbanana/home` repository on GitHub.
2. Replace **only** `store.js`, `delivery.js`, and `styles.css` at the repository root with the files from `Dulce-and-Banana-V7-1-Turnstile-Patch.zip`.
3. Wait for GitHub Pages to publish, then use a private/incognito browser window or hard-refresh the page.
4. Add an item to the basket, proceed to Review, and complete the Cloudflare security check.
5. Submit **one controlled test order** only after your admin dashboard login works. Verify the order reference inside Supabase before any payment.

## What changed

- Turnstile loads once and waits for its checkout area to be visible.
- A Retry security check button appears if the script/widget fails to initialize.
- Cloudflare error codes are shown for invalid site keys, unapproved hostnames, or blocked scripts.
- Delivery quote security no longer tries to render inside a hidden checkout stage.
- Missing or failed verification still **prevents order submission**. No bypass or automatic payment approval is used.

## If the error still appears

Copy only the *error code or error text* shown under the verification box. Do not share any private key.

- `110100` / `110110`: Cloudflare Site Key is incorrect or unrecognized. Compare the public site key saved in Supabase `TURNSTILE_SITE_KEY` against the widget settings.
- `110200`: Add `dulceandbanana.github.io` under the widget's hostname management, without `https://` or `/home/`.
- `200500`: Check browser content blockers / security filters for `challenges.cloudflare.com`.

Cloudflare notes: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/

## Deployment limitation

The ChatGPT GitHub connection has read-only permission, so the live repository has not been modified. The update is local only until you upload the three patch files.
