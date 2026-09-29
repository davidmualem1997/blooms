-- פיד פעילות: כל מה שקורה אצל הלקוחות, בתוך האפליקציה (בלי פוש).
-- נכתב אוטומטית מטריגרים, כך שכל שינוי נרשם – לא משנה מאיזה מסך הגיע.
-- staff_only: עבודה פנימית של הצוות – הלקוח לא רואה
create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  kind       text not null,
  subject    text not null default '', -- לאיחוד רצף פעולות זהות (למשל עריכות חוזרות באותו פריט)
  text       text not null,
  url        text not null default '',
  staff_only boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.activity (client_id, created_at desc);
alter table public.activity enable row level security;
create policy activity_select on public.activity for select using (
  case when staff_only then public.can_staff_client(client_id) else public.can_view_client(client_id) end
);
-- אין מדיניות כתיבה: רק הטריגרים (security definer) כותבים

-- מתי המשתמש/ת פתח/ה את הפיד לאחרונה – לנקודה על הפעמון
alter table public.profiles add column activity_seen_at timestamptz not null default now();

-- ---------- עזרים ----------
create or replace function public.actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part((select full_name from profiles where id = auth.uid()), ' ', 1), ''), 'הצוות');
$$;

create or replace function public.content_label(t public.content_type, title text)
returns text language sql immutable as $$
  select (case t when 'post' then 'פוסט' when 'reel' then 'ריל' else 'טיקטוק' end) || ' "' || coalesce(nullif(title, ''), 'ללא נושא') || '"';
$$;

create or replace function public.il_date(d timestamptz)
returns text language sql stable as $$ select to_char(d at time zone 'Asia/Jerusalem', 'DD.MM') $$;

-- רושם פעולה. אותה פעולה של אותו אדם על אותו נושא בתוך 30 דקות מתאחדת לשורה אחת
-- (p_many – הנוסח כשמתאחדות כמה פעולות, למשל העלאה של כמה תכנים ברצף)
create or replace function public.log_activity(p_client uuid, p_kind text, p_subject text, p_text text, p_url text, p_staff boolean, p_many text default null)
returns void language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  select id into existing from activity
    where client_id = p_client and kind = p_kind and subject = p_subject
      and actor_id is not distinct from auth.uid() and created_at > now() - interval '30 minutes'
    order by created_at desc limit 1;
  if existing is not null then
    update activity set created_at = now(), text = coalesce(p_many, p_text), url = case when p_many is null then p_url else url end where id = existing;
  else
    insert into activity (studio_id, client_id, actor_id, kind, subject, text, url, staff_only)
    select c.studio_id, p_client, auth.uid(), p_kind, p_subject, p_text, p_url, p_staff from clients c where c.id = p_client;
  end if;
end $$;
revoke execute on function public.log_activity(uuid, text, text, text, text, boolean, text) from public, anon, authenticated;

-- ---------- תוכן ----------
create or replace function public.activity_content()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text := public.actor_name(); lbl text; u text; is_client boolean;
begin
  if tg_op = 'DELETE' then
    perform log_activity(old.client_id, 'item_deleted', old.id::text, who || ' מחק/ה את ' || content_label(old.type, old.title), '', true);
    return old;
  end if;
  lbl := content_label(new.type, new.title);
  u := '/c/' || new.client_id || '/gantt?m=' || to_char(new.date, 'YYYY-MM') || '&item=' || new.id;
  is_client := public.is_client_user(new.client_id) and not public.can_staff_client(new.client_id);

  if tg_op = 'INSERT' then
    perform log_activity(new.client_id, 'item_added', new.client_id::text, who || ' הוסיף/ה ' || lbl || ' ל־' || to_char(new.date, 'DD.MM'), u, true,
      who || ' הוסיף/ה כמה תכנים חדשים לגאנט');
  end if;

  if tg_op = 'INSERT' and new.status in ('work', 'review') then
    return new;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    case new.status
      when 'client' then
        perform log_activity(new.client_id, 'sent_for_approval', new.client_id::text, lbl || ' נשלח לאישור', '/c/' || new.client_id, false,
          'כמה תכנים חדשים נשלחו לאישור');
      when 'ok' then
        perform log_activity(new.client_id, 'approved', new.id::text, case when is_client then who || ' אישר/ה את ' || lbl else lbl || ' אושר' end, u, false);
      when 'work' then
        if is_client then
          perform log_activity(new.client_id, 'fix_requested', new.id::text, who || ' ביקש/ה תיקון ב' || lbl, u, false);
        else
          perform log_activity(new.client_id, 'item_status', new.id::text, who || ' החזיר/ה לעבודה את ' || lbl, u, true);
        end if;
      when 'review' then
        perform log_activity(new.client_id, 'item_status', new.id::text, who || ' העביר/ה לבדיקה את ' || lbl, u, true);
      when 'live' then
        perform log_activity(new.client_id, 'went_live', new.id::text, lbl || ' עלה ✓', u, false);
      else null;
    end case;
  elsif new.caption is distinct from old.caption or new.title is distinct from old.title then
    perform log_activity(new.client_id, 'item_text', new.id::text, who || ' עדכן/ה טקסט ב' || lbl, u, true);
  elsif new.media is distinct from old.media then
    perform log_activity(new.client_id, 'item_media', new.id::text, who || ' עדכן/ה קבצים ב' || lbl, u, true);
  elsif new.date is distinct from old.date then
    perform log_activity(new.client_id, 'item_moved', new.client_id::text, who || ' הזיז/ה את ' || lbl || ' ל־' || to_char(new.date, 'DD.MM'), u, true,
      who || ' סידר/ה מחדש את לוח התוכן');
  end if;
  return new;
end $$;
create trigger content_items_activity after insert or update or delete on public.content_items
  for each row execute function public.activity_content();

-- ---------- פניות ----------
create or replace function public.activity_messages()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text := public.actor_name(); about text; u text := '/c/' || new.client_id || '/requests';
begin
  about := '"' || left(new.body, 50) || case when length(new.body) > 50 then '…' else '' end || '"';
  if tg_op = 'INSERT' then
    perform log_activity(new.client_id, 'request', new.id::text, who || ' שלח/ה ' ||
      case new.kind when 'fix' then 'בקשת תיקון' when 'idea' then 'רעיון' when 'call' then 'נושא לפגישה' else 'פנייה' end || ': ' || about, u, false);
  elsif jsonb_array_length(new.replies) > jsonb_array_length(old.replies) then
    perform log_activity(new.client_id, 'request_reply', new.id::text, who || ' ענה/תה לפנייה ' || about, u, false);
  elsif new.status is distinct from old.status then
    perform log_activity(new.client_id, 'request_status', new.id::text, 'הפנייה ' || about || ' ' ||
      case new.status when 'done' then 'טופלה ✓' when 'in_progress' then 'בטיפול' when 'to_meeting' then 'הועברה לפגישה' else 'נפתחה מחדש' end, u, false);
  end if;
  return new;
end $$;
create trigger messages_activity after insert or update on public.messages
  for each row execute function public.activity_messages();

-- ---------- רעיונות ----------
create or replace function public.activity_ideas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.client_id, 'idea', new.id::text, public.actor_name() || ' הוסיף/ה רעיון: ' || coalesce(nullif(new.title, ''), 'רעיון'),
    '/c/' || new.client_id || '/inspiration', new.source <> 'client');
  return new;
end $$;
create trigger ideas_activity after insert on public.ideas
  for each row execute function public.activity_ideas();

-- ---------- פגישות עם הלקוח ----------
create or replace function public.activity_meetings()
returns trigger language plpgsql security definer set search_path = public as $$
declare u text := '/c/' || new.client_id || '/file?tab=meetings';
begin
  if tg_op = 'INSERT' then
    perform log_activity(new.client_id, 'meeting', new.id::text, public.actor_name() || ' קבע/ה פגישה ל־' || il_date(new.starts_at) || ' בשעה ' ||
      to_char(new.starts_at at time zone 'Asia/Jerusalem', 'HH24:MI'), u, false);
  elsif coalesce(old.summary, '') = '' and coalesce(new.summary, '') <> '' then
    perform log_activity(new.client_id, 'summary', new.id::text, 'סיכום הפגישה מ־' || il_date(new.starts_at) || ' עלה', u, false);
  end if;
  return new;
end $$;
create trigger meetings_activity after insert or update on public.meetings
  for each row execute function public.activity_meetings();

-- ---------- אירועים ----------
create or replace function public.activity_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.client_id, 'event', new.id::text, public.actor_name() || ' הוסיף/ה אירוע: ' || new.title || ' (' || to_char(new.date, 'DD.MM') || ')',
    '/c/' || new.client_id || '/file?tab=events', false);
  return new;
end $$;
create trigger client_events_activity after insert on public.client_events
  for each row execute function public.activity_events();
