-- תמונת הקאבר של הלקוח: רק מנהלת הסטודיו ומנהל/ת הלקוח משנים (הלקוח עדיין עורך את שאר התיק)
create or replace function public.guard_client_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.manager_id is distinct from old.manager_id or new.studio_id <> old.studio_id)
     and not public.is_studio_owner(old.studio_id) then
    raise exception 'only the studio owner can change the client manager';
  end if;
  if not public.can_staff_client(old.id) then
    if new.name <> old.name or new.color <> old.color or new.ig_handle <> old.ig_handle then
      raise exception 'clients can only edit the client file';
    end if;
    if (new.brand ->> 'cover_path') is distinct from (old.brand ->> 'cover_path') then
      raise exception 'only the team can change the cover image';
    end if;
  end if;
  return new;
end $$;
