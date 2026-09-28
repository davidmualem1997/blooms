-- דגשים לחודש כרשימת משימות עם קישור להשראה, ובנוסף "רעיונות ודגשים שיווקיים" (kind = 'marketing')
alter table public.monthly_focus
  add column done boolean not null default false,
  add column url text not null default '',
  add column kind text not null default 'content' check (kind in ('content', 'marketing'));

-- אירועים קרובים: תיאור ותמונות לפרסום
alter table public.client_events
  add column description text not null default '',
  add column images jsonb not null default '[]'::jsonb;

-- נתוני ביצועים לפוסט שעלה (מוזנים ידנית): { reach, likes, comments, saves, views }
alter table public.content_items add column stats jsonb not null default '{}'::jsonb;

-- נתונים חודשיים לכל פלטפורמה, לדוח הנתונים
create table public.metrics (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  platform     text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  month        date not null check (extract(day from month) = 1),
  followers    integer,
  reach        integer,
  interactions integer,
  unique (client_id, platform, month)
);
create trigger metrics_studio before insert or update of client_id on public.metrics
  for each row execute function public.set_studio_from_client();
alter table public.metrics enable row level security;
create policy metrics_select on public.metrics for select using (public.can_view_client(client_id));
create policy metrics_write on public.metrics for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

-- בריפים לימי צילום
-- shots: [{ "text": "..." }], equipment: [{ "text": "...", "who": "...", "done": false }]
create table public.briefs (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  title        text not null,
  shoot_date   date,
  time_text    text not null default '',
  location     text not null default '',
  goal         text not null default '',
  feeling      text not null default '',
  shots        jsonb not null default '[]'::jsonb,
  equipment    jsonb not null default '[]'::jsonb,
  wardrobe     text not null default '',
  schedule     text not null default '',
  participants text not null default '',
  links        text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.briefs (client_id, shoot_date);
create trigger briefs_studio before insert or update of client_id on public.briefs
  for each row execute function public.set_studio_from_client();
alter table public.briefs enable row level security;
create policy briefs_select on public.briefs for select using (public.can_view_client(client_id));
create policy briefs_write on public.briefs for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));
