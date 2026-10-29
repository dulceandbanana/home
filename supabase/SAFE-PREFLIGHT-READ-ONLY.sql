-- DULCE & BANANA: SAFE READ-ONLY SUPABASE PREFLIGHT.
-- This query also succeeds if no bakery tables exist yet.
-- Run in SQL Editor of project liplhvsthltszvdeqxwz.
-- Does not display customer names, phones, addresses or secrets.
SELECT current_database() AS database_name,
       now() AS verified_at,
       to_regclass('public.orders') IS NOT NULL AS orders_table_exists,
       to_regclass('public.order_items') IS NOT NULL AS order_items_table_exists,
       to_regclass('public.products') IS NOT NULL AS products_table_exists,
       to_regclass('public.admin_users') IS NOT NULL AS admin_users_table_exists,
       to_regclass('public.bakery_settings') IS NOT NULL AS bakery_settings_table_exists,
       to_regclass('public.blocked_dates') IS NOT NULL AS blocked_dates_table_exists,
       to_regclass('public.payment_reports') IS NOT NULL AS payment_reports_table_exists,
       to_regclass('public.delivery_quotes') IS NOT NULL AS delivery_quotes_table_exists;

SELECT relname AS table_name, relrowsecurity AS row_level_security_enabled
FROM pg_class
WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')
  AND relname IN ('orders','order_items','products','bakery_settings','blocked_dates','admin_users','delivery_quotes','payment_reports')
ORDER BY relname;

SELECT routine_name FROM information_schema.routines
WHERE routine_schema='public' AND routine_name IN ('create_preorder','is_bakery_admin')
ORDER BY routine_name;
