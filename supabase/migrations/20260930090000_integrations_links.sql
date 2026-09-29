-- חיבורים לנתונים אמיתיים.
-- 1) integrations: חיבור של לקוח למקור נתונים (Meta, TikTok, Google Analytics, Shopify…) – כל אחד מתחבר לבד (OAuth).
--    ההרשאות (tokens) נשמרות מוצפנות בטבלה נפרדת שרק השרת ניגש אליה.
-- 2) קישורי BLOOMS: לינק בביו וקישורים מעקבים – כל לחיצה נספרת ועוברת ליעד. עובד לכל עסק, בלי אישור מאף חברה.

create table public.integrations (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  provider      text not null check (provider in ('meta', 'tiktok', 'ga4', 'shopify', 'woocommerce', 'wix', 'webflow')),
  external_id   text not null default '',   -- מזהה החשבון אצל הספק (למשל חשבון האינסטגרם)
  external_name text not null default '',   -- שם לתצוגה ("@lpizzale")
  status        text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  last_sync_at  timestamptz,
  last_error    text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (client_id, provider, external_id)
);
create trigger integrations_studio before insert or update of client_id on public.integrations
  for each row execute function public.set_studio_from_client();
alter table public.integrations enable row level security;
create policy integrations_select on public.integrations for select using (public.can_view_client(client_id));
-- כתיבה רק דרך השרת (אחרי בדיקת הרשאה), כי היא כרוכה בשמירת הרשאות מוצפנות

create table public.integration_secrets (
  integration_id uuid primary key references public.integrations (id) on delete cascade,
  ciphertext     text not null,            -- AES-256-GCM, המפתח רק בשרת (INTEGRATIONS_KEY)
  expires_at     timestamptz,
  updated_at     timestamptz not null default now()
);
alter table public.integration_secrets enable row level security; -- בלי מדיניות: אף משתמש לא קורא

-- ---------- קישורי BLOOMS ----------
alter table public.clients add column link_handle text unique check (link_handle ~ '^[a-z0-9][a-z0-9-]{1,30}$');

create table public.links (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,30}$'),
  label      text not null,
  kind       text not null default 'other' check (kind in ('reservation', 'menu', 'waze', 'whatsapp', 'phone', 'order', 'site', 'other')),
  target     text not null check (target ~* '^https?://[^\s"<>]+$' or target ~ '^tel:\+?[0-9]{6,15}$'),
  position   int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, slug)
);
create trigger links_studio before insert or update of client_id on public.links
  for each row execute function public.set_studio_from_client();
alter table public.links enable row level security;
create policy links_select on public.links for select using (public.can_view_client(client_id));
create policy links_write on public.links for all
  using (public.can_staff_client(client_id)) with check (public.can_staff_client(client_id));

-- לחיצות: בלי כתובת IP ובלי פרטים מזהים – רק מתי, מאיזה קישור, ומאיזה מקום (ביו / סטורי / קמפיין)
create table public.link_clicks (
  id         bigint generated always as identity primary key,
  link_id    uuid not null references public.links (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  source     text not null default '',     -- ?s=story-10-09 / bio
  referrer   text not null default '',     -- instagram.com / tiktok.com …
  clicked_at timestamptz not null default now()
);
create index on public.link_clicks (client_id, clicked_at);
alter table public.link_clicks enable row level security;
create policy link_clicks_select on public.link_clicks for select using (public.can_view_client(client_id));
-- נכתב רק מנקודת ההפניה בשרת

-- רק הצוות קובע את כתובת הלינק בביו (לקוח עורך רק את תיק הלקוח)
create or replace function public.guard_client_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.manager_id is distinct from old.manager_id or new.studio_id <> old.studio_id)
     and not public.is_studio_owner(old.studio_id) then
    raise exception 'only the studio owner can change the client manager';
  end if;
  if not public.can_staff_client(old.id)
     and (new.name <> old.name or new.color <> old.color or new.ig_handle <> old.ig_handle
          or new.link_handle is distinct from old.link_handle) then
    raise exception 'clients can only edit the client file';
  end if;
  return new;
end $$;
