-- פריט יכול להכיל כמה קבצים (קרוסלה = פוסט עם כמה תמונות).
-- כל איבר: { "path": "<studio>/<client>/<folder>/<file>", "thumb": "<path ל-jpg ממוזער>", "kind": "image" | "video" }
alter table public.content_items drop column media_path;
alter table public.content_items add column media jsonb not null default '[]'::jsonb;
