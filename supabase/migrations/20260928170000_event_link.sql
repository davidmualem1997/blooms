-- קישור לחומרים של אירוע (תיקייה בדרייב, קאנבה וכו')
alter table public.client_events add column if not exists link text not null default '';
