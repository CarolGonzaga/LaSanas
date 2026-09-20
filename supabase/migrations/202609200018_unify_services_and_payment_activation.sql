begin;

-- A campanha é a fonte de verdade comercial. A produção é liberada somente
-- pelo pagamento inicial exigido, nunca pela situação da parcela de entrega.
create or replace function public.sync_campaign_payment_state(p_campaign uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.campaigns; received numeric; expected numeric; begin
  select * into c from public.campaigns where id=p_campaign for update;
  if not found then return; end if;
  if c.status in ('draft','cancelled','completed') or c.payment_override_reason is not null then return; end if;
  expected:=case when c.payment_plan='full_upfront' then c.total_value else round(c.total_value/2,2) end;
  select coalesce(sum(amount),0) into received
  from public.payments
  where campaign_id=c.id and status='paid'
    and (c.payment_plan='full_upfront' or installment_number=1);
  if received>=expected then
    if c.status in ('awaiting_payment','paused') then update public.campaigns set status='active' where id=c.id; end if;
  elsif c.status='active' then
    update public.campaigns set status='paused' where id=c.id;
  end if;
end $$;

create or replace function public.sync_campaign_payment_state_trigger()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  perform public.sync_campaign_payment_state(case when TG_OP='DELETE' then old.campaign_id else new.campaign_id end);
  return null;
end $$;
drop trigger if exists payment_recheck on public.payments;
drop trigger if exists payment_sync_campaign_state on public.payments;
create trigger payment_sync_campaign_state
after insert or update or delete on public.payments
for each row execute function public.sync_campaign_payment_state_trigger();

-- A notificação segue a responsável administrativa da campanha, sem e-mails fixos.
create or replace function public.notify_production_status()
returns trigger language plpgsql set search_path=public as $$
declare recipient uuid; begin
  if new.status is not distinct from old.status or auth.uid() is null then return new; end if;
  select c.responsible_user_id into recipient
  from public.campaign_services s join public.campaigns c on c.id=s.campaign_id
  where s.id=new.campaign_service_id and c.workspace_id=new.workspace_id;
  if recipient is not null and recipient<>auth.uid() then
    insert into public.production_updates(workspace_id,occurrence_id,actor_user_id,recipient_user_id,previous_status,current_status)
    values(new.workspace_id,new.id,auth.uid(),recipient,old.status,new.status);
  end if;
  return new;
end $$;

-- A ficha de autora permite usar uma campanha existente; criar uma nova é uma
-- decisão explícita da interface, não um efeito invisível.
drop function if exists public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date,uuid);
create function public.create_author_service(
  p_workspace uuid,p_author uuid,p_book uuid,p_service_type uuid,p_quantity integer,
  p_unit_price numeric,p_notes text,p_schedule_status text,p_scheduled_date date,
  p_assigned_to uuid default null,p_campaign uuid default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_author public.authors; v_book public.books; v_type public.service_types; v_campaign uuid; v_service uuid; begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Você não possui acesso a este workspace.'; end if;
  select * into v_author from public.authors where id=p_author and workspace_id=p_workspace and archived_at is null;
  if not found then raise exception 'Autora inválida.'; end if;
  select * into v_type from public.service_types where id=p_service_type and workspace_id=p_workspace and active and archived_at is null;
  if not found then raise exception 'Tipo de serviço inválido.'; end if;
  if p_quantity not between 1 and 600 or p_unit_price<0 then raise exception 'Quantidade ou valor inválido.'; end if;
  if p_schedule_status not in ('to_confirm','scheduled') or (p_schedule_status='scheduled' and p_scheduled_date is null) then raise exception 'Informe a data ou marque o serviço como a confirmar.'; end if;
  if p_book is not null then select * into v_book from public.books where id=p_book and workspace_id=p_workspace and archived_at is null; if not found or v_book.author_id is distinct from p_author then raise exception 'O livro não pertence à autora.'; end if; end if;
  if p_campaign is not null then
    select id into v_campaign from public.campaigns where id=p_campaign and workspace_id=p_workspace and author_id=p_author and (p_book is null or book_id is not distinct from p_book);
    if not found then raise exception 'A campanha não corresponde à autora e ao livro selecionados.'; end if;
  else
    insert into public.campaigns(workspace_id,name,author_id,book_id,campaign_type,proposal_type,start_date,total_value,payment_plan,status,notes)
    values(p_workspace,v_author.name || ' — ' || coalesce(v_book.title,'Serviços avulsos'),p_author,p_book,'advertising','custom',coalesce(p_scheduled_date,current_date),p_quantity*p_unit_price,'full_upfront','draft','Campanha criada a pedido ao registrar serviço pela ficha da autora.') returning id into v_campaign;
  end if;
  insert into public.campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes,assigned_to)
  values(p_workspace,v_campaign,p_service_type,p_quantity,p_unit_price,p_notes,p_assigned_to) returning id into v_service;
  update public.service_occurrences set scheduled_date=case when p_schedule_status='scheduled' then p_scheduled_date else null end,schedule_status=p_schedule_status where campaign_service_id=v_service;
  return v_service;
end $$;
revoke all on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date,uuid,uuid) from public;
grant execute on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date,uuid,uuid) to authenticated;

-- Uma oportunidade convertida apresenta os serviços da campanha e não cria uma
-- segunda coleção editável. O trigger só transforma os itens uma vez.
create or replace function public.generate_opportunity_services()
returns trigger language plpgsql security definer set search_path=public as $$
declare item record; begin
  if new.opportunity_id is null or exists(select 1 from public.campaign_services where campaign_id=new.id) then return new; end if;
  for item in select * from public.opportunity_service_items where opportunity_id=new.opportunity_id and workspace_id=new.workspace_id loop
    insert into public.campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes)
    values(new.workspace_id,new.id,item.service_type_id,item.quantity,item.unit_price,item.notes);
  end loop;
  return new;
end $$;

commit;
