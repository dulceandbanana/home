-- D&B read-only deployment checks. Run via Supabase SQL Editor.
-- DO NOT share these results publicly if they include live customer data.
select current_database() as database_name,
       to_regclass('public.orders') is not null as orders_table_present,
       to_regclass('public.order_items') is not null as order_items_present,
       to_regclass('public.admin_users') is not null as admin_users_present,
       to_regclass('public.payment_reports') is not null as payment_reports_present,
       to_regclass('public.delivery_quotes') is not null as delivery_quotes_present;
select relname as table_name, relrowsecurity as rls_enabled
from pg_class where relnamespace='public'::regnamespace
and relname in ('orders','order_items','products','bakery_settings','blocked_dates','admin_users','delivery_quotes','payment_reports')
order by relname;
select accepting_orders, min_notice_hours, daily_limit, allowed_weekdays
from public.bakery_settings where id = 1;
select id,name,price,active from public.products order by sort_order;
select count(*) as authorized_admin_count from public.admin_users;
