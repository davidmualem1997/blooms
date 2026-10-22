-- בריף 2: טיוטה, קישור ללוח השראה (vision board), ורשימת צילומים כצ'ק ליסט
-- shots: [{ "text": "תיאור", "ref": "קישור להשראה", "feeling": "תחושה/ערכים", "done": false }]
alter table public.briefs
  add column status       text not null default 'final' check (status in ('draft', 'final')),
  add column vision_board text not null default '';
