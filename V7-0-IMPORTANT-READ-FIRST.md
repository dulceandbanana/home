# Dulce & Banana V7.0 — Fix preorder security and QR visibility

## What changed
- Cloudflare Turnstile is now mounted **after** the final review step is shown, instead of while hidden.
- The checkout checks for a valid Turnstile token **before** calling Supabase. If missing, it explains what to do.
- The payment-preview card explains that QR codes appear only after the bakery confirms an order and total.
- In **Track Order**, a server-confirmed order with a finalized amount now displays its GCash QR directly without a redundant confirmation checkbox. Customers may choose Maya or MariBank and save the original uploaded QR image.
- No changes to product prices, QR assets, database schema or server-side payment verification.

## Publish
Upload the entire ZIP contents to https://github.com/dulceandbanana/home (same directory layout). At minimum, update `store.js`, `index.html`, and `styles.css`. Once GitHub Pages deploys, hard-refresh the site.

## Important safety/activation
A connection checker reporting API reachable does not mean a preorder was saved. The bakery must have `accepting_orders=true` only during a controlled test, an authorized admin, and the `check-order` / `report-transfer` Edge Functions deployed. Do NOT submit payment before your approved final amount; a transfer reference is **not** payment verification.

## Live test
1. On a desktop or mobile browser open Basket > Details > Review. Confirm the Turnstile widget is visible. Complete it.
2. Test one small preorder. Do not assume success unless Supabase returns a reference.
3. Verify the same reference in Supabase Orders and the bakery dashboard.
4. After the bakery marks the order Confirmed with a final fee, use Track Order with the reference and phone number. The QR payment card should display, and changing payment methods should swap the corresponding QR.
5. Pay only after bakery confirms the final amount. Admin must independently verify funds in GCash, Maya or MariBank.
