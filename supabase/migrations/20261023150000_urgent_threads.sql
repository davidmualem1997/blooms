-- הודעה דחופה = שיחה: תשובות של שני הצדדים, ו"סגירת השיחה" (done_at)
-- replies: [{ "author_id": "...", "text": "...", "at": "..." }]
alter table public.urgent_notes add column replies jsonb not null default '[]'::jsonb;
alter table public.urgent_notes add column updated_at timestamptz not null default now();
