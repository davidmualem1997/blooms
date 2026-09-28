-- אירועים מיוחדים ללקוח (הצוות מוסיף ידנית ללוח השנה)
create table public.client_events (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  date       date not null,
  title      text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.client_events (client_id, date);
create trigger client_events_studio before insert or update of client_id on public.client_events
  for each row execute function public.set_studio_from_client();
alter table public.client_events enable row level security;
create policy ce_select on public.client_events for select using (public.can_view_client(client_id));
create policy ce_write on public.client_events for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

-- פגישות צוות: מנהלת הסטודיו קובעת; המשתתפים רואים ומוסיפים נושאים
-- topics: [{ "text": "...", "done": false }]
create table public.team_meetings (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios (id) on delete cascade,
  starts_at    timestamptz not null,
  kind         public.meeting_kind not null default 'meet',
  location     text not null default '',
  attendee_ids uuid[] not null default '{}',
  topics       jsonb not null default '[]'::jsonb,
  summary      text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.team_meetings (studio_id, starts_at);
alter table public.team_meetings enable row level security;
create policy tm_select on public.team_meetings for select
  using (public.is_studio_owner(studio_id) or auth.uid() = any (attendee_ids));
create policy tm_insert on public.team_meetings for insert with check (public.is_studio_owner(studio_id));
create policy tm_delete on public.team_meetings for delete using (public.is_studio_owner(studio_id));
create policy tm_update on public.team_meetings for update
  using (public.is_studio_owner(studio_id) or auth.uid() = any (attendee_ids));

-- משתתף/ת יכול/ה לעדכן רק נושאים; סיכום, מועד ומשתתפים – רק מנהלת הסטודיו
create or replace function public.guard_team_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_studio_owner(old.studio_id)
     and (new.summary <> old.summary or new.starts_at <> old.starts_at
          or new.attendee_ids <> old.attendee_ids or new.studio_id <> old.studio_id) then
    raise exception 'only the studio owner can change this meeting';
  end if;
  return new;
end $$;
create trigger team_meetings_guard before update on public.team_meetings
  for each row execute function public.guard_team_meeting();

-- טרנדים שבועיים בסושיאל (משותף לכל הסטודיואים). נכתב רק מהשרת עם מפתח שירות
create table public.weekly_trends (
  week_start date primary key,
  items      jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.weekly_trends enable row level security;
create policy trends_read on public.weekly_trends for select to authenticated using (true);

-- תמונת פרופיל שהמשתמש/ת העלה/תה (עדיפה על תמונת Google)
alter table public.profiles add column avatar_path text;

-- דלי תמונות פרופיל ציבורי; כל אחד/ת כותב/ת רק לתיקייה שלו/ה: avatars/<user id>/...
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
