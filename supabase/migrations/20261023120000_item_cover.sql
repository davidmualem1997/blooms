-- תמונת קאבר לפוסט/ריל/טיקטוק: מוצגת בפיד ובגאנט כתמונה הראשית (לא חלק מהקבצים שעולים לרשת)
alter table public.content_items add column cover jsonb; -- { "path": "...", "thumb": "..." }
