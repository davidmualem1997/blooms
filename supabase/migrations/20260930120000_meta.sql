-- חיבור Meta (Instagram + Facebook): סנכרון יומי של נתוני החשבון ושל כל פוסט

-- פוסט שעלה לאינסטגרם מקושר לפריט בגאנט (או נוצר ממנו אם לא תוכנן ב-BLOOMS)
alter table public.content_items
  add column external_id text,
  add column permalink   text;
-- ייחודי לכל לקוח (NULL לא מתנגש – פריטים שלא עלו עדיין לא מקושרים)
alter table public.content_items add constraint content_items_external unique (client_id, external_id);

-- נתוני החודש: מתי עודכנו אוטומטית (ריק = הוזנו ידנית)
alter table public.metrics add column synced_at timestamptz;

-- אחרי ההתחברות לפייסבוק ועד שבוחרים חשבון ללקוח: רשימת החשבונות וההרשאות, מוצפנת, לזמן קצר
create table public.integration_pending (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  provider   text not null,
  ciphertext text not null,
  created_at timestamptz not null default now()
);
alter table public.integration_pending enable row level security; -- בלי מדיניות: רק השרת
