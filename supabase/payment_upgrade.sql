-- DULCE & BANANA V6 — review and run AFTER schema.sql in a dedicated Supabase project.
-- Never run this in an unrelated product's Supabase project.
ALTER TABLE public.orders
 ADD COLUMN IF NOT EXISTS paymongo_link_id text,
 ADD COLUMN IF NOT EXISTS paymongo_link_url text,
 ADD COLUMN IF NOT EXISTS paymongo_payment_id text,
 ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'unselected',
 ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;

-- Track payment method securely. A screenshot is never proof of payment.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method in ('unselected','paymongo','manual_qr'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_link_url_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_link_url_check
  CHECK (paymongo_link_url IS NULL OR paymongo_link_url ~ '^https://(pm[.]link|([a-z0-9-]+[.])*paymongo[.]com)/');
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paymongo_link ON public.orders(paymongo_link_id)
  WHERE paymongo_link_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paymongo_payment ON public.orders(paymongo_payment_id)
  WHERE paymongo_payment_id IS NOT NULL;
-- Existing RLS (admins only) protects these fields. Public access is through check-order Edge Function.

REVOKE EXECUTE ON FUNCTION public.is_bakery_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_bakery_admin() TO authenticated;
