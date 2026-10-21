-- התראות של אפל (APNs) לאפליקציית האייפון. כל מכשיר נרשם עם token משלו.
-- env: sandbox = התקנה מ-Xcode, production = TestFlight/החנות (מתגלה אוטומטית בשליחה הראשונה)
create table public.native_push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null unique,
  platform   text not null default 'ios' check (platform in ('ios', 'android')),
  env        text check (env in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);
create index on public.native_push_tokens (user_id);
alter table public.native_push_tokens enable row level security;
create policy native_push_own on public.native_push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
