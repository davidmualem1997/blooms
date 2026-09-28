-- הזמנת מנהל/ת לקוחות או משתמש/ת לקוח לפי מייל.
-- אם כבר קיים משתמש עם המייל הזה – מקבל גישה מיד; אחרת נשמרת הזמנה שתמומש בכניסה הראשונה עם Google.
create or replace function public.invite_member(
  p_studio uuid,
  p_email  text,
  p_name   text,
  p_role   public.invite_role,
  p_client uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  em  text := lower(trim(p_email));
begin
  if not public.is_studio_owner(p_studio) then
    raise exception 'only the studio owner can invite';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  if p_role = 'client'
     and (p_client is null or not exists (select 1 from clients where id = p_client and studio_id = p_studio)) then
    raise exception 'client not in studio';
  end if;

  -- הזמנה פתוחה קודמת לאותו אדם ולאותו תפקיד מוחלפת
  delete from invites
   where studio_id = p_studio and lower(email) = em and role = p_role
     and client_id is not distinct from p_client and accepted_at is null;

  select id into uid from auth.users where lower(email) = em;

  if uid is not null then
    if p_role = 'manager' then
      insert into studio_members (studio_id, user_id, role) values (p_studio, uid, 'manager')
      on conflict do nothing;
    else
      insert into client_users (client_id, user_id) values (p_client, uid)
      on conflict do nothing;
    end if;
    update profiles set full_name = p_name where id = uid and full_name = '' and coalesce(p_name, '') <> '';
    insert into invites (studio_id, client_id, email, full_name, role, created_by, accepted_at)
    values (p_studio, p_client, em, coalesce(p_name, ''), p_role, auth.uid(), now());
    return 'added';
  end if;

  insert into invites (studio_id, client_id, email, full_name, role, created_by)
  values (p_studio, p_client, em, coalesce(p_name, ''), p_role, auth.uid());
  return 'invited';
end $$;

grant execute on function public.invite_member(uuid, text, text, public.invite_role, uuid) to authenticated;

-- הסרת מנהל/ת לקוחות: הלקוחות שלו/ה חוזרים למנהלת הסטודיו
create or replace function public.remove_manager(p_studio uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_studio_owner(p_studio) then
    raise exception 'only the studio owner can remove team members';
  end if;
  if exists (select 1 from studio_members where studio_id = p_studio and user_id = p_user and role = 'owner') then
    raise exception 'cannot remove the studio owner';
  end if;
  update clients set manager_id = auth.uid() where studio_id = p_studio and manager_id = p_user;
  delete from studio_members where studio_id = p_studio and user_id = p_user;
end $$;

grant execute on function public.remove_manager(uuid, uuid) to authenticated;
