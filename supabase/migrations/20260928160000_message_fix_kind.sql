-- פנייה לצוות מסוג "תיקון" (בנוסף ל"בקשה" ו"נושא לפגישה")
alter type public.message_kind add value if not exists 'fix';
