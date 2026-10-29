-- DULCE & BANANA — COMPLETE DATABASE INSTALL
-- PROJECT: liplhvsthltszvdeqxwz ONLY.
-- For a NEW / EMPTY bakery database. DO NOT re-run blindly on a live database.
-- Run once in Supabase SQL Editor. Review changes before running.
-- This creates tables/RLS/functions/settings, but keeps accepting_orders = false.

-- Dulce & Banana V5 | Run in a NEW/approved Supabase project via SQL Editor.
-- This script changes database schema; review before execution.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_bakery_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()) $$;

create table if not exists public.products (
  id text primary key check(length(id) between 1 and 32),
  name text not null check(length(name)<=120),
  description text not null default '',
  category text not null check(category in ('muffins','loaf','cookies')),
  price integer not null check(price>=0 and price<=200000), -- PHP pesos
  active boolean not null default true,
  sort_order integer not null default 10,
  updated_at timestamptz not null default now()
);

create table if not exists public.bakery_settings (
  id integer primary key default 1 check(id=1),
  accepting_orders boolean not null default false,
  min_notice_hours integer not null default 48 check(min_notice_hours between 0 and 720),
  daily_limit integer not null default 15 check(daily_limit between 1 and 500),
  allowed_weekdays integer[] not null default '{0,1,2,3,4,5,6}',
  updated_at timestamptz not null default now(),
  constraint valid_weekdays check(allowed_weekdays <@ array[0,1,2,3,4,5,6]::integer[])
);

create table if not exists public.blocked_dates (
  day date primary key,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_name text not null,
  phone text not null,
  email text,
  fulfillment text not null check(fulfillment in ('Delivery','Pickup')),
  preferred_date date not null,
  area text not null,
  notes text not null default '',
  gift boolean not null default false,
  gift_message text not null default '',
  subtotal integer not null check(subtotal>=0),
  extras_total integer not null default 0 check(extras_total>=0),
  delivery_fee integer check(delivery_fee is null or delivery_fee>=0),
  status text not null default 'pending_review' check(status in ('pending_review','confirmed','preparing','ready','out_for_delivery','completed','rejected','cancelled')),
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','awaiting_payment','paid','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  product_name text not null,
  quantity integer not null check(quantity between 1 and 99),
  toppings boolean not null default false,
  unit_price integer not null check(unit_price>=0),
  line_total integer not null check(line_total>=0)
);

create index if not exists idx_orders_date_status on public.orders(preferred_date,status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);

insert into public.bakery_settings(id,accepting_orders,min_notice_hours,daily_limit,allowed_weekdays)
values (1,false,48,15,array[0,1,2,3,4,5,6]) on conflict(id) do nothing;

insert into public.products(id,name,description,category,price,sort_order) values
('m4','B’ Muffins · Box of 4','Four home-baked muffins, ready to share.','muffins',150,10),
('m6','B’ Muffins · Box of 6','Six muffins for a sweet snack break.','muffins',180,20),
('ms','B’ Muffins · Solo','A little homemade pick-me-up.','muffins',50,30),
('loaf','D’ Banana Loaf','A golden banana loaf for the whole table. Optional toppings +₱20.','loaf',170,40),
('c6','B’ Cookies · Box of 6','Six cookies for little moments.','cookies',160,50),
('c12','B’ Cookies · Box of 12','Twelve cookies for celebrations.','cookies',300,60),
('cs','B’ Cookies · Solo','One cookie for a sweet break.','cookies',50,70)
on conflict(id) do nothing;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.bakery_settings enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Read-only public product catalogue and preorder dates; personal order data is never public.
create policy "Public catalogue" on public.products for select to anon,authenticated using(active=true or public.is_bakery_admin());
create policy "Public schedule" on public.bakery_settings for select to anon,authenticated using(true);
create policy "Public blocked days" on public.blocked_dates for select to anon,authenticated using(true);

-- All business administration requires a specifically permitted authenticated user.
create policy "Admins edit products" on public.products for all to authenticated using(public.is_bakery_admin()) with check(public.is_bakery_admin());
create policy "Admins edit settings" on public.bakery_settings for all to authenticated using(public.is_bakery_admin()) with check(public.is_bakery_admin());
create policy "Admins edit blocked days" on public.blocked_dates for all to authenticated using(public.is_bakery_admin()) with check(public.is_bakery_admin());
create policy "Admins manage orders" on public.orders for all to authenticated using(public.is_bakery_admin()) with check(public.is_bakery_admin());
create policy "Admins manage order lines" on public.order_items for all to authenticated using(public.is_bakery_admin()) with check(public.is_bakery_admin());

-- Prevent the public from viewing the list of administrators.
revoke all on public.admin_users from anon, authenticated;
grant select on public.products, public.bakery_settings, public.blocked_dates to anon, authenticated;
grant select,insert,update,delete on public.products, public.bakery_settings,public.blocked_dates,public.orders,public.order_items to authenticated;
grant usage, select on sequence public.order_items_id_seq to authenticated;
grant execute on function public.is_bakery_admin to authenticated;

-- Atomic capacity enforcement and server-side price calculation.
-- Invoked ONLY with a service-role credential inside the server-side Edge Function.
create or replace function public.create_preorder(
  p_customer_name text,p_phone text,p_email text,p_fulfillment text,
  p_preferred_date date,p_area text,p_notes text,p_gift boolean,p_gift_message text,p_items jsonb
) returns text language plpgsql security definer set search_path=public
as $$
declare s public.bakery_settings%rowtype; product public.products%rowtype;
 i jsonb; p_id text; q int; has_toppings boolean; price_each int;
 total int:=0; qty_total int:=0; extras int:=0; reference_code text; order_uuid uuid;
 active_count int; date_start timestamptz; normalized_phone text;
begin
 select * into s from public.bakery_settings where id=1 for update;
 if not found or not s.accepting_orders then raise exception 'Online preorders are currently closed.'; end if;
 if p_customer_name is null or length(trim(p_customer_name)) not between 2 and 100 then raise exception 'Name is required.'; end if;
 normalized_phone:=regexp_replace(coalesce(p_phone,''),'[[:space:]-]','','g');
 if normalized_phone !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then raise exception 'Provide a valid Philippine mobile number.'; end if;
 if p_email is not null and (length(p_email)>180 or p_email !~ '^[^@ ]+@[^@ ]+[.][^@ ]+$') then raise exception 'Invalid email address.'; end if;
 if p_fulfillment not in ('Delivery','Pickup') then raise exception 'Choose delivery or pickup.'; end if;
 if p_area is null or length(trim(p_area)) not between 2 and 240 then raise exception 'Delivery/pickup details required.'; end if;
 if length(coalesce(p_notes,''))>500 or length(coalesce(p_gift_message,''))>160 then raise exception 'Notes are too long.'; end if;
 if p_preferred_date is null then raise exception 'Choose a date.'; end if;
 date_start:=(p_preferred_date::timestamp + interval '23 hours 59 minutes') at time zone 'Asia/Manila';
 if date_start<now()+(s.min_notice_hours||' hours')::interval then raise exception 'Please choose a later preorder date.'; end if;
 if not (extract(dow from p_preferred_date)::int = any(s.allowed_weekdays)) then raise exception 'The bakery is closed on this date.'; end if;
 if exists(select 1 from public.blocked_dates where day=p_preferred_date) then raise exception 'This baking date is unavailable.'; end if;
 select count(*) into active_count from public.orders where preferred_date=p_preferred_date and status not in ('cancelled','rejected');
 if active_count >= s.daily_limit then raise exception 'This date has reached its order limit.'; end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 16 then raise exception 'Invalid basket.'; end if;
 for i in select * from jsonb_array_elements(p_items) loop
  p_id:=i->>'id';
  if coalesce(i->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid item quantity.'; end if;
  q:=(i->>'quantity')::int;
  if q<1 or q>40 then raise exception 'Quantity must be between 1 and 40.'; end if;
  has_toppings:=coalesce((i->>'toppings')::boolean,false);
  select * into product from public.products where id=p_id and active=true;
  if not found then raise exception 'A product is unavailable.'; end if;
  if has_toppings and p_id<>'loaf' then raise exception 'Invalid topping selection.'; end if;
  price_each:=product.price+case when has_toppings then 20 else 0 end;
  total:=total+price_each*q;qty_total:=qty_total+q;
 end loop;
 if qty_total>80 or total>200000 then raise exception 'Order is too large. Please contact us for bulk orders.'; end if;
 extras:=case when coalesce(p_gift,false) then 10 else 0 end;
 reference_code:='DB-'||to_char(now() at time zone 'Asia/Manila','YYMMDD')||'-'||upper(encode(gen_random_bytes(4),'hex'));
 insert into public.orders(reference,customer_name,phone,email,fulfillment,preferred_date,area,notes,gift,gift_message,subtotal,extras_total)
 values(reference_code,trim(p_customer_name),normalized_phone,nullif(trim(coalesce(p_email,'')),''),p_fulfillment,p_preferred_date,trim(p_area),coalesce(p_notes,''),coalesce(p_gift,false),case when p_gift then coalesce(p_gift_message,'') else '' end,total,extras)
 returning id into order_uuid;
 for i in select * from jsonb_array_elements(p_items) loop
  p_id:=i->>'id';q:=(i->>'quantity')::int;has_toppings:=coalesce((i->>'toppings')::boolean,false);
  select * into product from public.products where id=p_id;
  price_each:=product.price+case when has_toppings then 20 else 0 end;
  insert into public.order_items(order_id,product_id,product_name,quantity,toppings,unit_price,line_total)
  values(order_uuid,p_id,product.name,q,has_toppings,price_each,price_each*q);
 end loop;
 return reference_code;
end $$;

revoke all on function public.create_preorder(text,text,text,text,date,text,text,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_preorder(text,text,text,text,date,text,text,boolean,text,jsonb) to service_role;

-- Owner setup: Create a Supabase Auth user in the dashboard, then replace the UUID and run ONCE:
-- insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID');
-- DO NOT remove RLS, share service keys, or make the orders table public.


-- PAYMENT FIELDS
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


-- DELIVERY QUOTES AND TRANSFER REPORTS
-- Dulce & Banana V6.4 — Lalamove quote storage.
-- Apply after the base bakery schema and payment upgrade, in the D&B Supabase project ONLY.
-- Quotes are short-lived estimates; NOT a final fee and NOT evidence of courier booking.
create table if not exists public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  lalamove_quote_id text not null,
  dropoff_lat numeric(10,7) not null,
  dropoff_lng numeric(10,7) not null,
  dropoff_address text not null check (length(dropoff_address) between 10 and 240),
  estimate_php numeric(10,2) not null check (estimate_php >= 0),
  route_distance_m numeric(12,2),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_delivery_quotes_expires_at on public.delivery_quotes(expires_at);
alter table public.delivery_quotes enable row level security;
revoke all on public.delivery_quotes from public, anon, authenticated;
grant all on public.delivery_quotes to service_role;
-- Do not create public select policies: delivery addresses are private customer data.

alter table public.orders add column if not exists delivery_quote_id uuid references public.delivery_quotes(id) on delete set null;
alter table public.orders add column if not exists delivery_estimate_php numeric(10,2);
alter table public.orders add column if not exists delivery_distance_m numeric(12,2);
-- The original orders.delivery_fee remains the bakery's confirmed amount,
-- set by an authorized administrator. Never use an estimate as an automatic charge.

-- Manual GCash/Maya/MariBank transfer reports from customers. Never treat reports as confirmed payments.
create table if not exists public.payment_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check(method in ('gcash','maya','maribank')),
  amount numeric(10,2) not null check(amount>0),
  transfer_reference text not null check(length(transfer_reference) between 5 and 100),
  review_status text not null default 'awaiting_verification' check(review_status in ('awaiting_verification','verified','rejected')),
  created_at timestamptz not null default now(),
  unique(order_id,method,transfer_reference)
);
create index if not exists idx_payment_reports_order on public.payment_reports(order_id);
alter table public.payment_reports enable row level security;
revoke all on public.payment_reports from public,anon,authenticated;
grant all on public.payment_reports to service_role;
-- Bakery admins (and ONLY bakery admins) can read transfer reports.
grant select on public.payment_reports to authenticated;
create policy "Bakery admins view payment reports" on public.payment_reports for select
 to authenticated using (public.is_bakery_admin());

