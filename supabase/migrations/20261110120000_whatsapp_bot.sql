-- בוט וואטסאפ: חיבור מספר טלפון למשתמש (בקוד חד-פעמי), ויומן השיחה – לזיכרון קצר, למניעת כפילויות ולביטול פעולה

create table public.whatsapp_links (
  phone      text primary key,                 -- כפי שוואטסאפ שולח: 9725XXXXXXXX
  user_id    uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.whatsapp_link_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null
);
create index on public.whatsapp_link_codes (user_id);

create table public.whatsapp_log (
  id         bigserial primary key,
  phone      text not null,
  wa_id      text unique,                      -- מזהה ההודעה בוואטסאפ: מטא שולחת לפעמים פעמיים
  role       text not null check (role in ('user', 'assistant', 'media', 'action')),
  content    text not null default '',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.whatsapp_log (phone, created_at desc);

alter table public.whatsapp_links      enable row level security;
alter table public.whatsapp_link_codes enable row level security;
alter table public.whatsapp_log        enable row level security;

-- המשתמש רואה ומנתק רק את החיבור שלו. קודים ויומן – רק השרת (מפתח שירות)
create policy whatsapp_links_select on public.whatsapp_links for select to authenticated using (user_id = auth.uid());
create policy whatsapp_links_delete on public.whatsapp_links for delete to authenticated using (user_id = auth.uid());
