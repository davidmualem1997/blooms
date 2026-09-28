-- סטורי חד-פעמי יכול לכלול קבצים: [{ "path", "thumb", "kind" }]
alter table public.one_off_stories add column if not exists media jsonb not null default '[]'::jsonb;
