begin;

create or replace function public.create_author_service(
 p_workspace uuid,
 p_author uuid,
 p_book uuid,
 p_service_type uuid,
 p_quantity integer,
 p_unit_price numeric,
 p_notes text,
 p_schedule_status text,
 p_scheduled_date date
) returns uuid language plpgsql security invoker set search_path=public as $$
declare
 v_author public.authors;
 v_book public.books;
 v_type public.service_types;
 v_campaign uuid;
 v_service uuid;
 v_status text;
begin
 if not public.is_workspace_member(p_workspace) then
  raise exception 'Você não possui acesso a este workspace.';
 end if;
 select * into v_author from public.authors where id=p_author and workspace_id=p_workspace and archived_at is null;
 if not found then raise exception 'Autora inválida.'; end if;
 select * into v_type from public.service_types where id=p_service_type and workspace_id=p_workspace and active and archived_at is null;
 if not found then raise exception 'Tipo de serviço inválido.'; end if;
 if p_quantity<1 or p_quantity>600 then raise exception 'A quantidade deve estar entre 1 e 600.'; end if;
 if p_unit_price<0 then raise exception 'O valor não pode ser negativo.'; end if;
 if p_schedule_status not in ('to_confirm','scheduled') then raise exception 'Situação da data inválida.'; end if;
 if p_schedule_status='scheduled' and p_scheduled_date is null then raise exception 'Informe a data do serviço.'; end if;
 if p_book is not null then
  select * into v_book from public.books where id=p_book and workspace_id=p_workspace and archived_at is null;
  if not found or v_book.author_id is distinct from p_author then raise exception 'O livro não pertence à autora.'; end if;
 end if;
 v_status:=case
  when p_unit_price=0 and (p_book is null or v_book.cover_ai_status in ('confirmed_human','replaced')) then 'active'
  else 'awaiting_payment'
 end;
 insert into public.campaigns(
  workspace_id,name,author_id,book_id,campaign_type,proposal_type,start_date,total_value,payment_plan,status,notes
 ) values(
  p_workspace,
  v_type.name || case when p_book is null then '' else ' • ' || v_book.title end,
  p_author,p_book,'advertising','custom',coalesce(p_scheduled_date,current_date),p_quantity*p_unit_price,
  'full_upfront',v_status,'Registro interno criado ao adicionar um serviço pela ficha da autora.'
 ) returning id into v_campaign;
 insert into public.campaign_services(
  workspace_id,campaign_id,service_type_id,quantity,unit_price,notes
 ) values(
  p_workspace,v_campaign,p_service_type,p_quantity,p_unit_price,p_notes
 ) returning id into v_service;
 update public.service_occurrences
 set scheduled_date=case when p_schedule_status='scheduled' then p_scheduled_date else null end,
     schedule_status=p_schedule_status
 where campaign_service_id=v_service;
 return v_service;
end $$;

revoke all on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date) from public;
grant execute on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date) to authenticated;

commit;
