-- מחיקה מסודרת: משתמש שלא נשאר לו שום תפקיד (לא בצוות ולא לקוח של אף לקוח) נמחק לגמרי –
-- כולל חשבון הכניסה. כך הזמנה עתידית מתחילה נקי, והוא לא יגיע למסך "פתיחת סטודיו".
create or replace function public.purge_user_if_orphan(uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if uid is null or uid = auth.uid() then return false; end if;
  if exists (select 1 from studio_members where user_id = uid)
     or exists (select 1 from client_users where user_id = uid) then
    return false;
  end if;
  delete from invites where lower(email) = (select lower(email) from auth.users where id = uid) and accepted_at is not null;
  delete from auth.users where id = uid; -- מוחק גם את הפרופיל (cascade)
  return true;
end $$;
-- פונקציה פנימית בלבד – לא נקראת ישירות מהאפליקציה
revoke execute on function public.purge_user_if_orphan(uuid) from public, anon, authenticated;

-- הסרת מנהל/ת לקוחות: הלקוחות חוזרים למנהלת הסטודיו, יוצא/ת מפגישות צוות, ואם אין תפקיד אחר – נמחק/ת
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
  update tasks set assignee_id = auth.uid() where studio_id = p_studio and assignee_id = p_user and not done;
  update team_meetings set attendee_ids = array_remove(attendee_ids, p_user) where studio_id = p_studio;
  delete from studio_members where studio_id = p_studio and user_id = p_user;
  delete from invites where studio_id = p_studio and role = 'manager'
    and lower(email) = (select lower(email) from auth.users where id = p_user);
  perform public.purge_user_if_orphan(p_user);
end $$;

-- הסרת משתמש/ת לקוח
create or replace function public.remove_client_user(p_client uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select studio_id into sid from clients where id = p_client;
  if sid is null or not public.is_studio_owner(sid) then
    raise exception 'only the studio owner can remove client users';
  end if;
  delete from client_users where client_id = p_client and user_id = p_user;
  delete from invites where client_id = p_client
    and lower(email) = (select lower(email) from auth.users where id = p_user);
  perform public.purge_user_if_orphan(p_user);
end $$;

-- מחיקת לקוח: כל הנתונים נמחקים (cascade), ומשתמשי הלקוח שלא נשאר להם תפקיד – נמחקים.
-- את הקבצים באחסון האפליקציה מוחקת לפני הקריאה לפונקציה.
create or replace function public.delete_client(p_client uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid; users uuid[]; u uuid;
begin
  select studio_id into sid from clients where id = p_client;
  if sid is null or not public.is_studio_owner(sid) then
    raise exception 'only the studio owner can delete clients';
  end if;
  select coalesce(array_agg(user_id), '{}') into users from client_users where client_id = p_client;
  delete from clients where id = p_client;
  foreach u in array users loop
    perform public.purge_user_if_orphan(u);
  end loop;
end $$;

grant execute on function public.remove_manager(uuid, uuid) to authenticated;
grant execute on function public.remove_client_user(uuid, uuid) to authenticated;
grant execute on function public.delete_client(uuid) to authenticated;
