-- שולחן הפיד – סכמה ראשונית
-- מבנה רב-סטודיואי: כל טבלה עסקית נושאת studio_id.
-- הרשאות נאכפות ב-RLS:
--   owner   = מנהלת הסטודיו – רואה ומנהלת הכול בסטודיו
--   manager = מנהל/ת לקוחות – רואה רק לקוחות שבהם clients.manager_id = הוא/היא
--   client  = משתמש/ת לקוח (client_users) – רואה רק את הלקוח שלו, בלי משימות צוות

create extension if not exists pgcrypto;

-- ---------- טיפוסים ----------
create type public.member_role    as enum ('owner', 'manager');
create type public.content_type   as enum ('post', 'reel', 'tiktok');
create type public.content_status as enum ('work', 'review', 'client', 'ok', 'live');
create type public.message_kind   as enum ('request', 'call');
create type public.meeting_kind   as enum ('meet', 'call', 'zoom');
create type public.idea_source    as enum ('team', 'client');
create type public.invite_role    as enum ('manager', 'client');

-- ---------- ישויות בסיס ----------
create table public.studios (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text,
  avatar_url text,
  phone      text,
  created_at timestamptz not null default now()
);

create table public.studio_members (
  studio_id  uuid not null references public.studios (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios (id) on delete cascade,
  name       text not null,
  ig_handle  text not null default '',
  color      text not null default '#8B7CF6',
  manager_id uuid references public.profiles (id) on delete set null,
  -- תיק לקוח: socials, hours, contacts, materials, palette, story, values,
  -- audience, tone, dos, donts, examples, recurring, faq
  brand      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.clients (studio_id);
create index on public.clients (manager_id);

create table public.client_users (
  client_id  uuid not null references public.clients (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);
create index on public.client_users (user_id);

-- הזמנות: כניסה עם Google מתאימה לפי כתובת המייל
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.invite_role not null,
  created_by  uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint invite_client_role check ((role = 'client') = (client_id is not null))
);
create index on public.invites (lower(email)) where accepted_at is null;

-- ---------- תוכן ----------
create table public.content_items (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  date         date not null,
  type         public.content_type not null default 'post',
  title        text not null default '',
  caption      text not null default '',
  notes        text not null default '',   -- הערות ותיקונים מהלקוח
  status       public.content_status not null default 'work',
  media_path   text,                        -- הקובץ המלא ב-storage
  thumb_path   text,                        -- תמונה ממוזערת
  published_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.content_items (client_id, date);
create index on public.content_items (studio_id, date);

create table public.recurring_stories (
  id        uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  title     text not null,
  weekdays  smallint[] not null default '{0,1,2,3,4,5,6}',  -- 0 = ראשון
  position  int not null default 0
);
create index on public.recurring_stories (client_id);

create table public.one_off_stories (
  id        uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  date      date not null,
  title     text not null
);
create index on public.one_off_stories (client_id, date);

-- סימון "עלה" לסטורי ביום מסוים. story_ref = 'r:<id>' או 'o:<id>'
create table public.story_checks (
  studio_id uuid not null references public.studios (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  story_ref text not null,
  date      date not null,
  done_by   uuid references public.profiles (id) on delete set null,
  done_at   timestamptz not null default now(),
  primary key (client_id, story_ref, date)
);

create table public.monthly_focus (
  id        uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  month     date not null check (extract(day from month) = 1),
  text      text not null,
  position  int not null default 0
);
create index on public.monthly_focus (client_id, month);

create table public.ideas (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  title      text not null,
  note       text not null default '',
  url        text not null default '',
  image_path text,
  source     public.idea_source not null default 'team',
  used       boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.ideas (client_id, month);

-- ---------- תקשורת ----------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  kind        public.message_kind not null default 'request',
  body        text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index on public.messages (client_id) where resolved_at is null;

create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  kind         public.meeting_kind not null default 'meet',
  starts_at    timestamptz not null,
  location     text not null default '',
  extra_topics text[] not null default '{}',
  summary      text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.meetings (client_id, starts_at);

-- משימות צוות – לקוחות לא רואים אותן
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  title       text not null,
  assignee_id uuid references public.profiles (id) on delete set null,
  done        boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.tasks (client_id);
create index on public.tasks (assignee_id) where not done;

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------- עקביות studio_id ----------
-- כל שורה שייכת לאותו סטודיו כמו הלקוח שלה; מונע שיוך צולב בין סטודיואים.
create or replace function public.set_studio_from_client()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select c.studio_id into new.studio_id from public.clients c where c.id = new.client_id;
  if new.studio_id is null then
    raise exception 'client % not found', new.client_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['content_items','recurring_stories','one_off_stories','story_checks',
                           'monthly_focus','ideas','messages','meetings','tasks']
  loop
    execute format('create trigger %I_studio before insert or update of client_id on public.%I
                    for each row execute function public.set_studio_from_client()', t, t);
  end loop;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger content_items_touch before update on public.content_items
  for each row execute function public.touch_updated_at();

-- ---------- פונקציות הרשאה ----------
create or replace function public.is_studio_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from studio_members where studio_id = sid and user_id = auth.uid());
$$;

create or replace function public.is_studio_owner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from studio_members where studio_id = sid and user_id = auth.uid() and role = 'owner');
$$;

-- צוות שמטפל בלקוח: מנהלת הסטודיו, או מנהל/ת הלקוח
create or replace function public.can_staff_client(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where c.id = cid
      and (c.manager_id = auth.uid() or public.is_studio_owner(c.studio_id))
  );
$$;

create or replace function public.is_client_user(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from client_users where client_id = cid and user_id = auth.uid());
$$;

create or replace function public.can_view_client(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_staff_client(cid) or public.is_client_user(cid);
$$;

-- ---------- RLS ----------
alter table public.studios            enable row level security;
alter table public.profiles           enable row level security;
alter table public.studio_members     enable row level security;
alter table public.clients            enable row level security;
alter table public.client_users       enable row level security;
alter table public.invites            enable row level security;
alter table public.content_items      enable row level security;
alter table public.recurring_stories  enable row level security;
alter table public.one_off_stories    enable row level security;
alter table public.story_checks       enable row level security;
alter table public.monthly_focus      enable row level security;
alter table public.ideas              enable row level security;
alter table public.messages           enable row level security;
alter table public.meetings           enable row level security;
alter table public.tasks              enable row level security;
alter table public.push_subscriptions enable row level security;

-- studios
create policy studios_select on public.studios for select
  using (public.is_studio_member(id)
         or exists (select 1 from clients c join client_users cu on cu.client_id = c.id
                    where c.studio_id = studios.id and cu.user_id = auth.uid()));
create policy studios_update on public.studios for update using (public.is_studio_owner(id));

-- profiles: עצמי, אנשי אותו סטודיו, ואנשים שקשורים ללקוח שאני רואה
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (select 1 from studio_members a join studio_members b on a.studio_id = b.studio_id
             where a.user_id = auth.uid() and b.user_id = profiles.id)
  or exists (select 1 from client_users cu where cu.user_id = profiles.id and public.can_view_client(cu.client_id))
  or exists (select 1 from clients c where c.manager_id = profiles.id and public.can_view_client(c.id))
);
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- studio_members
create policy members_select on public.studio_members for select using (public.is_studio_member(studio_id));
create policy members_owner_all on public.studio_members for all
  using (public.is_studio_owner(studio_id)) with check (public.is_studio_owner(studio_id));

-- clients
-- בודק לפי עמודות השורה עצמה, כדי ש-insert ... returning יעבוד לשורה חדשה
create policy clients_select on public.clients for select
  using (public.is_studio_owner(studio_id) or manager_id = auth.uid() or public.is_client_user(id));
create policy clients_insert on public.clients for insert with check (public.is_studio_owner(studio_id));
create policy clients_delete on public.clients for delete using (public.is_studio_owner(studio_id));
create policy clients_update on public.clients for update using (public.can_view_client(id));

-- רק מנהלת הסטודיו משנה מנהל לקוח / סטודיו; לקוחות ומנהלים עורכים רק את התיק
create or replace function public.guard_client_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.manager_id is distinct from old.manager_id or new.studio_id <> old.studio_id)
     and not public.is_studio_owner(old.studio_id) then
    raise exception 'only the studio owner can change the client manager';
  end if;
  if not public.can_staff_client(old.id)
     and (new.name <> old.name or new.color <> old.color or new.ig_handle <> old.ig_handle) then
    raise exception 'clients can only edit the client file';
  end if;
  return new;
end $$;
create trigger clients_guard before update on public.clients
  for each row execute function public.guard_client_update();

-- client_users
create policy client_users_select on public.client_users for select using (public.can_view_client(client_id));
create policy client_users_owner on public.client_users for all
  using (exists (select 1 from clients c where c.id = client_id and public.is_studio_owner(c.studio_id)))
  with check (exists (select 1 from clients c where c.id = client_id and public.is_studio_owner(c.studio_id)));

-- invites – רק מנהלת הסטודיו
create policy invites_owner on public.invites for all
  using (public.is_studio_owner(studio_id)) with check (public.is_studio_owner(studio_id));

-- תוכן: צפייה לכל מי שרואה את הלקוח, כתיבה לצוות. לקוח מאשר/מתקן דרך review_item()
create policy items_select on public.content_items for select using (public.can_view_client(client_id));
create policy items_write  on public.content_items for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

create policy rs_select on public.recurring_stories for select using (public.can_view_client(client_id));
create policy rs_write  on public.recurring_stories for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

create policy os_select on public.one_off_stories for select using (public.can_view_client(client_id));
create policy os_write  on public.one_off_stories for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

create policy sc_select on public.story_checks for select using (public.can_view_client(client_id));
create policy sc_write  on public.story_checks for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

create policy focus_select on public.monthly_focus for select using (public.can_view_client(client_id));
create policy focus_write  on public.monthly_focus for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

-- רעיונות: לקוח יכול להוסיף רק רעיון מסוג "רעיון לקוח"
create policy ideas_select on public.ideas for select using (public.can_view_client(client_id));
create policy ideas_insert on public.ideas for insert with check (
  public.can_staff_client(client_id)
  or (public.is_client_user(client_id) and source = 'client' and created_by = auth.uid())
);
create policy ideas_update on public.ideas for update using (public.can_staff_client(client_id));
create policy ideas_delete on public.ideas for delete using (public.can_staff_client(client_id));

-- הודעות
create policy messages_select on public.messages for select using (public.can_view_client(client_id));
create policy messages_insert on public.messages for insert
  with check (public.can_view_client(client_id) and created_by = auth.uid());
create policy messages_update on public.messages for update using (public.can_staff_client(client_id));
create policy messages_delete on public.messages for delete using (public.can_staff_client(client_id));

-- פגישות
create policy meetings_select on public.meetings for select using (public.can_view_client(client_id));
create policy meetings_insert on public.meetings for insert with check (public.can_view_client(client_id));
create policy meetings_update on public.meetings for update using (public.can_staff_client(client_id));
create policy meetings_delete on public.meetings for delete using (public.can_staff_client(client_id));

-- משימות צוות – צוות בלבד
create policy tasks_staff on public.tasks for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- פונקציות (RPC) ----------
-- פרופיל נוצר אוטומטית בכניסה הראשונה עם Google
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
          new.email,
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- פתיחת סטודיו חדש; היוצר/ת הופכ/ת למנהלת הסטודיו
create or replace function public.create_studio(studio_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into studios (name) values (studio_name) returning id into sid;
  insert into studio_members (studio_id, user_id, role) values (sid, auth.uid(), 'owner');
  return sid;
end $$;

-- מימוש הזמנות פתוחות לפי המייל של המשתמש המחובר
create or replace function public.accept_invites()
returns int language plpgsql security definer set search_path = public as $$
declare inv record; n int := 0; my_email text;
begin
  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is null then return 0; end if;
  for inv in select * from invites where lower(email) = my_email and accepted_at is null loop
    if inv.role = 'manager' then
      insert into studio_members (studio_id, user_id, role) values (inv.studio_id, auth.uid(), 'manager')
      on conflict do nothing;
    else
      insert into client_users (client_id, user_id) values (inv.client_id, auth.uid())
      on conflict do nothing;
    end if;
    update profiles set full_name = inv.full_name where id = auth.uid() and full_name = '' and inv.full_name <> '';
    update invites set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- לקוח מאשר פריט או מבקש תיקון
create or replace function public.review_item(item_id uuid, approve boolean, note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; st public.content_status;
begin
  select client_id, status into cid, st from content_items where id = item_id;
  if cid is null or not public.can_view_client(cid) then raise exception 'not allowed'; end if;
  -- לקוח מגיב רק לפריטים שנשלחו אליו לאישור
  if st <> 'client' and not public.can_staff_client(cid) then raise exception 'item is not waiting for approval'; end if;
  if approve then
    update content_items set status = 'ok' where id = item_id;
  else
    update content_items set status = 'work', notes = note where id = item_id;
  end if;
end $$;

grant execute on function public.create_studio(text)                  to authenticated;
grant execute on function public.accept_invites()                     to authenticated;
grant execute on function public.review_item(uuid, boolean, text)     to authenticated;

-- ---------- אחסון קבצים ----------
-- נתיב: <studio_id>/<client_id>/<file>
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_view_client(((storage.foldername(name))[2])::uuid));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_view_client(((storage.foldername(name))[2])::uuid));
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_staff_client(((storage.foldername(name))[2])::uuid));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_staff_client(((storage.foldername(name))[2])::uuid));
