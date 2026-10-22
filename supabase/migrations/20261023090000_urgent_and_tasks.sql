-- הודעות דחופות בתוך הלקוח: מנהלת הסטודיו ↔ מנהל/ת הלקוח, ומהצוות ללקוח
-- to_role: 'owner' (למנהלת הסטודיו) / 'manager' (למנהל/ת הלקוח) / 'client' (ללקוח)
create table public.urgent_notes (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  from_user  uuid references public.profiles (id) on delete set null,
  to_role    text not null check (to_role in ('owner', 'manager', 'client')),
  body       text not null check (length(body) between 1 and 1000),
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.urgent_notes (client_id, created_at desc);
create trigger urgent_notes_studio before insert or update of client_id on public.urgent_notes
  for each row execute function public.set_studio_from_client();
alter table public.urgent_notes enable row level security;
-- הצוות רואה הכול אצל הלקוח; הלקוח רואה רק מה שנשלח אליו
create policy un_select on public.urgent_notes for select using (
  public.can_staff_client(client_id) or (to_role = 'client' and public.is_client_user(client_id))
);
-- רק הצוות שולח (בשם עצמו)
create policy un_insert on public.urgent_notes for insert with check (
  public.can_staff_client(client_id) and from_user = auth.uid()
);
-- סימון "טופל": מי שרואה את ההודעה
create policy un_update on public.urgent_notes for update using (
  public.can_staff_client(client_id) or (to_role = 'client' and public.is_client_user(client_id))
);
create policy un_delete on public.urgent_notes for delete using (from_user = auth.uid());

-- משימות צוות: תיאור ודחיפות
alter table public.tasks
  add column description text not null default '',
  add column urgent      boolean not null default false;
