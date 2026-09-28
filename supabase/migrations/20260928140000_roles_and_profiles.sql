-- 1. פרופיל חסר (למשל אחרי מחיקה ידנית מהטבלה) משוחזר מתוך auth.users,
--    כדי שהזמנה או כניסה מחדש לא ייכשלו
create or replace function public.ensure_profile(uid uuid)
returns void language sql security definer set search_path = public as $$
  insert into profiles (id, full_name, email, avatar_url)
  select u.id,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
         u.email,
         u.raw_user_meta_data ->> 'avatar_url'
  from auth.users u where u.id = uid
  on conflict (id) do nothing;
$$;

-- שחזור לכל מי שכבר חסר לו פרופיל
insert into public.profiles (id, full_name, email, avatar_url)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), u.email, u.raw_user_meta_data ->> 'avatar_url'
from auth.users u left join public.profiles p on p.id = u.id
where p.id is null;

-- 2. לכל אדם תפקיד אחד בסטודיו: או בצוות, או לקוח. אי אפשר להזמין לקוח מי שבצוות, ולהפך
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

  select id into uid from auth.users where lower(email) = em;

  if uid is not null then
    if p_role = 'client' and exists (select 1 from studio_members where studio_id = p_studio and user_id = uid) then
      raise exception 'already a team member';
    end if;
    if p_role = 'manager' and exists (
      select 1 from client_users cu join clients c on c.id = cu.client_id where c.studio_id = p_studio and cu.user_id = uid
    ) then
      raise exception 'already a client user';
    end if;
  end if;

  delete from invites
   where studio_id = p_studio and lower(email) = em and role = p_role
     and client_id is not distinct from p_client and accepted_at is null;

  if uid is not null then
    perform public.ensure_profile(uid);
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

-- מימוש הזמנות בכניסה: משחזר פרופיל אם חסר, ומדלג על הזמנה שמתנגשת בתפקיד קיים
create or replace function public.accept_invites()
returns int language plpgsql security definer set search_path = public as $$
declare inv record; n int := 0; my_email text;
begin
  perform public.ensure_profile(auth.uid());
  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is null then return 0; end if;
  for inv in select * from invites where lower(email) = my_email and accepted_at is null loop
    if inv.role = 'manager' then
      if exists (select 1 from client_users cu join clients c on c.id = cu.client_id where c.studio_id = inv.studio_id and cu.user_id = auth.uid()) then
        continue;
      end if;
      insert into studio_members (studio_id, user_id, role) values (inv.studio_id, auth.uid(), 'manager')
      on conflict do nothing;
    else
      if exists (select 1 from studio_members where studio_id = inv.studio_id and user_id = auth.uid()) then
        continue;
      end if;
      insert into client_users (client_id, user_id) values (inv.client_id, auth.uid())
      on conflict do nothing;
    end if;
    update profiles set full_name = inv.full_name where id = auth.uid() and full_name = '' and inv.full_name <> '';
    update invites set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- הסרה מהצוות מבטלת גם הזמנות צוות ישנות, כדי שהמייל יהיה פנוי להזמנה כלקוח
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
  delete from invites where studio_id = p_studio and role = 'manager'
    and lower(email) = (select lower(email) from auth.users where id = p_user);
end $$;
