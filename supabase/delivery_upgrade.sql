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
