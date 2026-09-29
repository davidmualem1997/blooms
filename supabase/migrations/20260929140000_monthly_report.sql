-- הדוח החודשי: מה קרה החודש, מה עבד, ומה זה אומר לעסק.
-- הנתונים מוזנים ידנית מהתובנות של כל פלטפורמה (עד שיהיה חיבור ל-API) – אותם שדות ימולאו אוטומטית בהמשך

-- נתוני חודש לכל פלטפורמה – שדות נוספים
alter table public.metrics
  add column views          integer,
  add column profile_visits integer,
  add column link_clicks    integer,
  add column unfollows      integer;

-- מה שלא שייך לפלטפורמה: תוצאה עסקית, תובנות, מה עושים בחודש הבא
create table public.monthly_reports (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  business     jsonb not null default '{}'::jsonb, -- { "reservations": 42, "calls": 18, ... } לפי תחום העסק
  insights     text[] not null default '{}',
  next_steps   text[] not null default '{}',
  published_at timestamptz,                       -- הלקוח רואה את הדוח רק אחרי שפורסם
  updated_at   timestamptz not null default now(),
  unique (client_id, month)
);
create trigger monthly_reports_studio before insert or update of client_id on public.monthly_reports
  for each row execute function public.set_studio_from_client();
alter table public.monthly_reports enable row level security;
create policy mr_select on public.monthly_reports for select using (
  public.can_staff_client(client_id) or (published_at is not null and public.can_view_client(client_id))
);
create policy mr_write on public.monthly_reports for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

-- דוח שפורסם נרשם בפיד הפעילות
create or replace function public.activity_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    perform log_activity(new.client_id, 'report', new.id::text,
      'הדוח החודשי של ' || (array['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'])[extract(month from new.month)::int] || ' מוכן',
      '/c/' || new.client_id || '/report?m=' || to_char(new.month, 'YYYY-MM'), false);
  end if;
  return new;
end $$;
create trigger monthly_reports_activity after insert or update on public.monthly_reports
  for each row execute function public.activity_report();
