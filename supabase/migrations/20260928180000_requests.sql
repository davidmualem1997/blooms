-- פניות מהלקוח עם סטטוס, תשובות קצרות מהצוות וקבצים מצורפים
alter type public.message_kind add value if not exists 'idea';

alter table public.messages
  add column status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'to_meeting')),
  -- [{ "author_id": "...", "text": "...", "at": "..." }] – תשובות הצוות (לא צ'אט פתוח)
  add column replies jsonb not null default '[]'::jsonb,
  -- [{ "path": "...", "thumb": "...", "kind": "image" | "video" | "file" }]
  add column attachments jsonb not null default '[]'::jsonb,
  add column updated_at timestamptz not null default now();

-- פניות קיימות: מה שכבר סומן כטופל → "טופל"; נושאים לשיחה → "הועבר לפגישה"
update public.messages set status = 'done' where resolved_at is not null;
update public.messages set status = 'to_meeting' where resolved_at is null and kind = 'call';

-- הסטטוס והזמן "טופל" נשארים מסונכרנים
create or replace function public.sync_message_status()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.resolved_at is null then new.resolved_at := now(); end if;
  if new.status <> 'done' then new.resolved_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger messages_status before insert or update on public.messages
  for each row execute function public.sync_message_status();
