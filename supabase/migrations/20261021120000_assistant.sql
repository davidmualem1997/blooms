-- עוזר ה-AI: רישום שאלות לצורך מגבלה יומית לכל משתמש (בלי תוכן השאלה – רק מתי)
create table public.assistant_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.assistant_usage (user_id, created_at);
alter table public.assistant_usage enable row level security;
create policy assistant_usage_own on public.assistant_usage for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
