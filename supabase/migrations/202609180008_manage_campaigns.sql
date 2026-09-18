begin;

-- A campanha é o agregado administrativo: serviços e pagamentos acompanham sua remoção.
alter table public.client_assets alter column campaign_id drop not null;

alter table public.service_occurrences drop constraint if exists service_occurrences_workspace_id_campaign_service_id_fkey;
alter table public.service_occurrences add constraint service_occurrences_workspace_id_campaign_service_id_fkey
 foreign key(workspace_id,campaign_service_id) references public.campaign_services(workspace_id,id) on delete cascade;
alter table public.campaign_services drop constraint if exists campaign_services_workspace_id_campaign_id_fkey;
alter table public.campaign_services add constraint campaign_services_workspace_id_campaign_id_fkey
 foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete cascade;
alter table public.payments drop constraint if exists payments_workspace_id_campaign_id_fkey;
alter table public.payments add constraint payments_workspace_id_campaign_id_fkey
 foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete cascade;

alter table public.client_assets drop constraint if exists client_assets_workspace_id_service_occurrence_id_fkey;
alter table public.client_assets add constraint client_assets_workspace_id_service_occurrence_id_fkey
 foreign key(workspace_id,service_occurrence_id) references public.service_occurrences(workspace_id,id) on delete set null (service_occurrence_id);
alter table public.client_assets drop constraint if exists client_assets_workspace_id_campaign_id_fkey;
alter table public.client_assets add constraint client_assets_workspace_id_campaign_id_fkey
 foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete set null (campaign_id);

alter table public.communication_logs drop constraint if exists communication_logs_workspace_id_campaign_id_fkey;
alter table public.communication_logs add constraint communication_logs_workspace_id_campaign_id_fkey
 foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete set null (campaign_id);
alter table public.tasks drop constraint if exists tasks_workspace_id_related_campaign_id_fkey;
alter table public.tasks add constraint tasks_workspace_id_related_campaign_id_fkey
 foreign key(workspace_id,related_campaign_id) references public.campaigns(workspace_id,id) on delete set null (related_campaign_id);
alter table public.collective_reading_slots drop constraint if exists collective_reading_slots_workspace_id_campaign_id_fkey;
alter table public.collective_reading_slots add constraint collective_reading_slots_workspace_id_campaign_id_fkey
 foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete set null (campaign_id);
alter table public.book_club_slots drop constraint if exists book_club_slots_workspace_id_campaign_id_fkey;
alter table public.book_club_slots add constraint book_club_slots_workspace_id_campaign_id_fkey
 foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete set null (campaign_id);

create or replace function public.business_rules() returns trigger language plpgsql set search_path=public as $$
declare v_book public.books; v_op public.opportunities; v_campaign public.campaigns; v_initial numeric; v_paid numeric; v_expected uuid; v_field text; v_user uuid;
begin
 if TG_OP='UPDATE' and new.workspace_id<>old.workspace_id then raise exception 'Não é permitido mover registros entre workspaces.'; end if;
 foreach v_field in array array['responsible_user_id','assigned_to'] loop
  v_user:=nullif(to_jsonb(new)->>v_field,'')::uuid;
  if v_user is not null and not exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=v_user and active) then raise exception 'Responsável não é integrante ativa deste workspace.'; end if;
 end loop;
 if TG_TABLE_NAME='opportunities' then
  if new.responsible_user_id is null then select responsible_user_id into new.responsible_user_id from channel_assignments where workspace_id=new.workspace_id and channel=new.source_channel; end if;
  if new.responsible_user_id is null then raise exception 'Configure uma responsável para este canal ou selecione manualmente.'; end if;
  if not exists(select 1 from workspace_members where workspace_id=new.workspace_id and user_id=new.responsible_user_id and active) then raise exception 'Responsável inativa.'; end if;
 end if;
 if TG_TABLE_NAME='communication_logs' and TG_OP='INSERT' then
  if new.opportunity_id is not null then select * into v_op from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id; new.author_id:=v_op.author_id; new.publisher_id:=v_op.publisher_id; new.publisher_contact_id:=coalesce(new.publisher_contact_id,v_op.publisher_contact_id);
  elsif new.campaign_id is not null then select * into v_campaign from campaigns where id=new.campaign_id and workspace_id=new.workspace_id; new.author_id:=v_campaign.author_id; new.publisher_id:=v_campaign.publisher_id; end if;
 end if;
 if TG_TABLE_NAME='books' then
  if new.cover_ai_status not in ('confirmed_human','replaced') and exists(select 1 from campaigns where book_id=new.id and status='active') then raise exception 'Pause as campanhas deste livro antes de alterar a origem da capa.'; end if;
 end if;
 if TG_TABLE_NAME in ('campaigns','opportunities','collective_reading_slots','book_club_slots') then
  if new.book_id is not null then
   select * into v_book from books where id=new.book_id and workspace_id=new.workspace_id; if not found then raise exception 'Livro inválido.'; end if;
   if TG_TABLE_NAME='book_club_slots' then
    if new.publisher_id is null then new.publisher_id:=v_book.publisher_id; end if;
   end if;
   if (to_jsonb(new)->>'author_id') is not null and (to_jsonb(new)->>'author_id')::uuid<>v_book.author_id then raise exception 'O livro não pertence à autora selecionada.'; end if;
   if (to_jsonb(new)->>'publisher_id') is not null and (to_jsonb(new)->>'publisher_id')::uuid is distinct from v_book.publisher_id then raise exception 'O livro não pertence à editora selecionada.'; end if;
  end if;
 end if;
 if TG_TABLE_NAME in ('opportunities','book_club_slots','communication_logs') then
  if new.publisher_contact_id is not null then select publisher_id into v_expected from publisher_contacts where id=new.publisher_contact_id and workspace_id=new.workspace_id; if new.publisher_id is distinct from v_expected then raise exception 'O contato não pertence à editora.'; end if; end if;
 end if;
 if TG_TABLE_NAME='campaigns' then
  if TG_OP='INSERT' and new.opportunity_id is not null then select * into v_op from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id for update; if v_op.status<>'approved' then raise exception 'A oportunidade precisa estar aprovada.'; end if; if new.author_id is distinct from v_op.author_id or new.publisher_id is distinct from v_op.publisher_id or new.book_id is distinct from v_op.book_id then raise exception 'A campanha deve manter os vínculos da oportunidade.'; end if; end if;
  if new.status='active' then if new.book_id is not null and v_book.cover_ai_status not in ('confirmed_human','replaced') then raise exception 'Confirme uma capa sem IA ou registre sua substituição antes de iniciar a produção.'; end if; v_initial:=case when new.payment_plan='full_upfront' then new.total_value else round(new.total_value/2,2) end; select coalesce(sum(amount),0) into v_paid from payments where campaign_id=new.id and workspace_id=new.workspace_id and status='paid' and (new.payment_plan='full_upfront' or installment_number=1); if v_paid<v_initial and nullif(trim(new.payment_override_reason),'') is null then raise exception 'Pagamento inicial ainda não confirmado.'; end if; end if;
  if TG_OP='INSERT' then if new.payment_override_reason is not null or new.payment_override_by is not null or new.payment_override_at is not null then raise exception 'A exceção deve ser registrada após criar a campanha.'; end if;
  elsif new.payment_override_reason is distinct from old.payment_override_reason then if not is_workspace_admin(new.workspace_id) then raise exception 'Somente administradoras podem autorizar uma exceção.'; end if; if length(trim(coalesce(new.payment_override_reason,'')))<10 then raise exception 'Informe uma justificativa com pelo menos 10 caracteres.'; end if; new.payment_override_by:=auth.uid(); new.payment_override_at:=now();
  elsif new.payment_override_by is distinct from old.payment_override_by or new.payment_override_at is distinct from old.payment_override_at then raise exception 'Os dados de auditoria da exceção não podem ser alterados.'; end if;
 end if;
 if TG_TABLE_NAME='payments' then if new.status='paid' then if new.payment_method is null or new.paid_at is null then raise exception 'Informe data real e forma de recebimento.'; end if; if new.payment_method='other' and nullif(trim(new.payment_method_custom),'') is null then raise exception 'Informe a outra forma de pagamento.'; end if; else new.paid_at:=null; end if; end if;
 if TG_TABLE_NAME in ('tasks','service_occurrences') then new.completed_at:=case when new.status='completed' then coalesce(new.completed_at,now()) else null end; end if;
 if TG_TABLE_NAME='service_occurrences' then
  if new.status='completed' and not exists(select 1 from campaign_services s join campaigns c on c.id=s.campaign_id where s.id=new.campaign_service_id and c.status in ('active','completed')) then raise exception 'Libere a campanha para produção antes de concluir o serviço.'; end if;
 end if;
 if TG_TABLE_NAME='client_assets' then
  if new.campaign_id is not null then
   select * into v_campaign from campaigns where id=new.campaign_id and workspace_id=new.workspace_id;
   if new.author_id is not null and new.author_id is distinct from v_campaign.author_id then raise exception 'Autora não corresponde à campanha.'; end if;
   if new.publisher_id is not null and new.publisher_id is distinct from v_campaign.publisher_id then raise exception 'Editora não corresponde à campanha.'; end if;
   if new.book_id is not null and new.book_id is distinct from v_campaign.book_id then raise exception 'Livro não corresponde à campanha.'; end if;
   if new.service_occurrence_id is not null and not exists(select 1 from service_occurrences o join campaign_services s on s.id=o.campaign_service_id where o.id=new.service_occurrence_id and s.campaign_id=new.campaign_id) then raise exception 'Execução não corresponde à campanha.'; end if;
  elsif new.service_occurrence_id is not null then raise exception 'Vincule o material a uma campanha antes da execução.'; end if;
  if new.asset_type='link' and new.external_url is null then raise exception 'Informe o link.'; end if; if new.asset_type<>'link' and new.storage_path is null then raise exception 'Envie o arquivo.'; end if;
 end if;
 return new;
end $$;

create or replace function public.create_author_service(p_workspace uuid,p_author uuid,p_book uuid,p_service_type uuid,p_quantity integer,p_unit_price numeric,p_notes text,p_schedule_status text,p_scheduled_date date) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_author public.authors; v_book public.books; v_type public.service_types; v_campaign uuid; v_service uuid; begin
 if not public.is_workspace_member(p_workspace) then raise exception 'Você não possui acesso a este workspace.'; end if;
 select * into v_author from public.authors where id=p_author and workspace_id=p_workspace and archived_at is null; if not found then raise exception 'Autora inválida.'; end if;
 select * into v_type from public.service_types where id=p_service_type and workspace_id=p_workspace and active and archived_at is null; if not found then raise exception 'Tipo de serviço inválido.'; end if;
 if p_quantity<1 or p_quantity>600 then raise exception 'A quantidade deve estar entre 1 e 600.'; end if; if p_unit_price<0 then raise exception 'O valor não pode ser negativo.'; end if;
 if p_schedule_status not in ('to_confirm','scheduled') then raise exception 'Situação da data inválida.'; end if; if p_schedule_status='scheduled' and p_scheduled_date is null then raise exception 'Informe a data do serviço.'; end if;
 if p_book is not null then select * into v_book from public.books where id=p_book and workspace_id=p_workspace and archived_at is null; if not found or v_book.author_id is distinct from p_author then raise exception 'O livro não pertence à autora.'; end if; end if;
 insert into public.campaigns(workspace_id,name,author_id,book_id,campaign_type,proposal_type,start_date,total_value,payment_plan,status,notes)
 values(p_workspace,v_author.name || ' — ' || coalesce(v_book.title,'Serviços avulsos'),p_author,p_book,'advertising','custom',coalesce(p_scheduled_date,current_date),p_quantity*p_unit_price,'full_upfront','draft','Registro interno criado ao adicionar um serviço pela ficha da autora.') returning id into v_campaign;
 insert into public.campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes) values(p_workspace,v_campaign,p_service_type,p_quantity,p_unit_price,p_notes) returning id into v_service;
 update public.service_occurrences set scheduled_date=case when p_schedule_status='scheduled' then p_scheduled_date else null end,schedule_status=p_schedule_status where campaign_service_id=v_service;
 return v_service;
end $$;

create or replace function public.delete_campaign_service(p_service uuid) returns void language plpgsql security invoker set search_path=public as $$
declare w uuid; begin select workspace_id into w from campaign_services where id=p_service for update; if not found or not public.is_workspace_member(w) then raise exception 'Serviço não encontrado.'; end if; update client_assets set service_occurrence_id=null where workspace_id=w and service_occurrence_id in(select id from service_occurrences where campaign_service_id=p_service); delete from campaign_services where id=p_service and workspace_id=w; end $$;

create or replace function public.delete_campaign(p_campaign uuid,p_return_opportunity boolean default false) returns void language plpgsql security invoker set search_path=public as $$
declare c public.campaigns; begin select * into c from campaigns where id=p_campaign for update; if not found or not public.is_workspace_member(c.workspace_id) then raise exception 'Campanha não encontrada.'; end if; update client_assets set service_occurrence_id=null,campaign_id=null where workspace_id=c.workspace_id and campaign_id=c.id; if p_return_opportunity and c.opportunity_id is not null then update opportunities set status='approved' where id=c.opportunity_id and workspace_id=c.workspace_id and status='converted'; end if; delete from campaigns where id=c.id and workspace_id=c.workspace_id; end $$;

create or replace function public.rebuild_campaign_payments(p_campaign uuid,p_mode text) returns void language plpgsql security invoker set search_path=public as $$
declare c public.campaigns; half numeric; begin select * into c from campaigns where id=p_campaign for update; if not found or not public.is_workspace_member(c.workspace_id) then raise exception 'Campanha não encontrada.'; end if; if p_mode not in ('rebuild_pending','rebuild_all') then raise exception 'Opção de cobranças inválida.'; end if; if p_mode='rebuild_pending' then delete from payments where campaign_id=c.id and status<>'paid'; else delete from payments where campaign_id=c.id; end if; if exists(select 1 from payments where campaign_id=c.id) then return; end if; if c.total_value=0 then return; end if; half:=round(c.total_value/2,2); insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status) values(c.workspace_id,c.id,case when c.payment_plan='full_upfront' then 'Pagamento antecipado' else 'Sinal • 50%' end,1,case when c.payment_plan='full_upfront' then c.total_value else half end,c.start_date,'pending'); if c.payment_plan='half_and_half' then insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status) values(c.workspace_id,c.id,'Entrega • 50%',2,c.total_value-half,coalesce(c.end_date,c.start_date),'pending'); end if; end $$;

revoke all on function public.delete_campaign_service(uuid),public.delete_campaign(uuid,boolean),public.rebuild_campaign_payments(uuid,text) from public;
grant execute on function public.delete_campaign_service(uuid),public.delete_campaign(uuid,boolean),public.rebuild_campaign_payments(uuid,text) to authenticated;
commit;
