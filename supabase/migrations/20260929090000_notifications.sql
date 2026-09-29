-- התראות: שעת עלייה מתוכננת (לתזכורת לפני העלאה ולבדיקה שעלה), אירוע שמחכה לחומרים מהלקוח,
-- ויומן שליחה – כל התראה מתוזמנת נשלחת פעם אחת בלבד
alter table public.content_items add column time time;
alter table public.client_events add column needs_material boolean not null default false;

create table public.notification_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);
-- בלי מדיניות: רק קוד השרת (מפתח השירות) קורא וכותב
alter table public.notification_log enable row level security;

-- מתזמן: כל 10 דקות Supabase קורא לנקודת הקצה של ההתראות.
-- הסוד נשמר ב-Vault בשם cron_secret (אותו ערך כמו CRON_SECRET ב-Vercel)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('blooms-notify', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://blooms-phi.vercel.app/api/cron/notify',
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')),
    timeout_milliseconds := 30000
  );
$$);
