-- הלקוח מגיב לפנייה שלו או עורך אותה, כל עוד היא לא נסגרה. בלי שינוי סטטוס
create or replace function public.client_request_reply(mid uuid, txt text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(txt), '') = '' then return; end if;
  update public.messages
     set replies = coalesce(replies, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('author_id', auth.uid(), 'text', trim(txt), 'at', now()))
   where id = mid and created_by = auth.uid() and status <> 'done' and public.can_view_client(client_id);
  if not found then raise exception 'not allowed'; end if;
end $$;

create or replace function public.client_request_edit(mid uuid, new_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new_body), '') = '' then raise exception 'empty'; end if;
  update public.messages set body = trim(new_body)
   where id = mid and created_by = auth.uid() and status <> 'done' and public.can_view_client(client_id);
  if not found then raise exception 'not allowed'; end if;
end $$;

revoke all on function public.client_request_reply(uuid, text) from public, anon;
revoke all on function public.client_request_edit(uuid, text) from public, anon;
grant execute on function public.client_request_reply(uuid, text) to authenticated;
grant execute on function public.client_request_edit(uuid, text) to authenticated;
