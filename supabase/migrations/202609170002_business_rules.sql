begin;
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
  if new.opportunity_id is not null then
   select * into v_op from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id;
   new.author_id:=v_op.author_id; new.publisher_id:=v_op.publisher_id; new.publisher_contact_id:=coalesce(new.publisher_contact_id,v_op.publisher_contact_id);
  elsif new.campaign_id is not null then
   select * into v_campaign from campaigns where id=new.campaign_id and workspace_id=new.workspace_id;
   new.author_id:=v_campaign.author_id; new.publisher_id:=v_campaign.publisher_id;
  end if;
 end if;
 if TG_TABLE_NAME='books' then
  if new.cover_ai_status not in ('confirmed_human','replaced') and exists(select 1 from campaigns where book_id=new.id and status='active') then raise exception 'Pause as campanhas deste livro antes de alterar a origem da capa.'; end if;
 end if;
 if TG_TABLE_NAME in ('campaigns','opportunities','collective_reading_slots','book_club_slots') then
  if new.book_id is not null then
   select * into v_book from books where id=new.book_id and workspace_id=new.workspace_id;
   if not found then raise exception 'Livro inválido.'; end if;
   if TG_TABLE_NAME='book_club_slots' then
    if new.publisher_id is null then new.publisher_id:=v_book.publisher_id; end if;
   end if;
   if (to_jsonb(new)->>'author_id') is not null and (to_jsonb(new)->>'author_id')::uuid<>v_book.author_id then raise exception 'O livro não pertence à autora selecionada.'; end if;
   if (to_jsonb(new)->>'publisher_id') is not null and (to_jsonb(new)->>'publisher_id')::uuid is distinct from v_book.publisher_id then raise exception 'O livro não pertence à editora selecionada.'; end if;
  end if;
 end if;
 if TG_TABLE_NAME in ('opportunities','book_club_slots','communication_logs') then
  if new.publisher_contact_id is not null then
   select publisher_id into v_expected from publisher_contacts where id=new.publisher_contact_id and workspace_id=new.workspace_id;
   if new.publisher_id is distinct from v_expected then raise exception 'O contato não pertence à editora.'; end if;
  end if;
 end if;
 if TG_TABLE_NAME='campaigns' then
  if TG_OP='INSERT' and new.opportunity_id is not null then
   select * into v_op from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id for update;
   if v_op.status<>'approved' then raise exception 'A oportunidade precisa estar aprovada.'; end if;
   if new.author_id is distinct from v_op.author_id or new.publisher_id is distinct from v_op.publisher_id or new.book_id is distinct from v_op.book_id then raise exception 'A campanha deve manter os vínculos da oportunidade.'; end if;
  end if;
  if TG_OP='UPDATE' and (new.total_value<>old.total_value or new.payment_plan<>old.payment_plan or new.service_package_id is distinct from old.service_package_id) then raise exception 'Valor, plano e pacote contratados são imutáveis. Ajuste a proposta antes de converter.'; end if;
  if new.status='active' then
   if new.book_id is not null and v_book.cover_ai_status not in ('confirmed_human','replaced') then raise exception 'Confirme uma capa sem IA ou registre sua substituição antes de iniciar a produção.'; end if;
   v_initial:=case when new.payment_plan='full_upfront' then new.total_value else round(new.total_value/2,2) end;
   select coalesce(sum(amount),0) into v_paid from payments where campaign_id=new.id and workspace_id=new.workspace_id and status='paid' and (new.payment_plan='full_upfront' or installment_number=1);
   if v_paid<v_initial and nullif(trim(new.payment_override_reason),'') is null then raise exception 'Pagamento inicial ainda não confirmado.'; end if;
  end if;
  if TG_OP='INSERT' then
   if new.payment_override_reason is not null or new.payment_override_by is not null or new.payment_override_at is not null then raise exception 'A exceção deve ser registrada após criar a campanha.'; end if;
  elsif new.payment_override_reason is distinct from old.payment_override_reason then
   if not is_workspace_admin(new.workspace_id) then raise exception 'Somente administradoras podem autorizar uma exceção.'; end if;
   if length(trim(coalesce(new.payment_override_reason,'')))<10 then raise exception 'Informe uma justificativa com pelo menos 10 caracteres.'; end if;
   new.payment_override_by:=auth.uid(); new.payment_override_at:=now();
  elsif new.payment_override_by is distinct from old.payment_override_by or new.payment_override_at is distinct from old.payment_override_at then
   raise exception 'Os dados de auditoria da exceção não podem ser alterados.';
  end if;
 end if;
 if TG_TABLE_NAME='payments' then
  if new.status='paid' then
   if new.payment_method is null or new.paid_at is null then raise exception 'Informe data real e forma de recebimento.'; end if;
   if new.payment_method='other' and nullif(trim(new.payment_method_custom),'') is null then raise exception 'Informe a outra forma de pagamento.'; end if;
  else new.paid_at:=null; end if;
 end if;
 if TG_TABLE_NAME in ('tasks','service_occurrences') then
  new.completed_at:=case when new.status='completed' then coalesce(new.completed_at,now()) else null end;
 end if;
 if TG_TABLE_NAME='service_occurrences' then
  if new.status='completed' and not exists(select 1 from campaign_services s join campaigns c on c.id=s.campaign_id where s.id=new.campaign_service_id and c.status in ('active','completed')) then raise exception 'Libere a campanha para produção antes de concluir o serviço.'; end if;
 end if;
 if TG_TABLE_NAME='client_assets' then
  select * into v_campaign from campaigns where id=new.campaign_id and workspace_id=new.workspace_id;
  if new.author_id is not null and new.author_id is distinct from v_campaign.author_id then raise exception 'Autora não corresponde à campanha.'; end if;
  if new.publisher_id is not null and new.publisher_id is distinct from v_campaign.publisher_id then raise exception 'Editora não corresponde à campanha.'; end if;
  if new.book_id is not null and new.book_id is distinct from v_campaign.book_id then raise exception 'Livro não corresponde à campanha.'; end if;
  if new.service_occurrence_id is not null and not exists(select 1 from service_occurrences o join campaign_services s on s.id=o.campaign_service_id where o.id=new.service_occurrence_id and s.campaign_id=new.campaign_id) then raise exception 'Execução não corresponde à campanha.'; end if;
  if new.asset_type='link' and new.external_url is null then raise exception 'Informe o link.'; end if;
  if new.asset_type<>'link' and new.storage_path is null then raise exception 'Envie o arquivo.'; end if;
 end if;
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['authors','publishers','publisher_contacts','books','opportunities','communication_logs','media_kits','service_types','service_packages','service_package_items','campaigns','campaign_services','service_occurrences','payments','collective_reading_slots','book_club_slots','tasks','response_templates','client_assets','channel_assignments'] loop execute format('create trigger validate_business before insert or update on public.%I for each row execute function public.business_rules()',t); end loop; end $$;
create or replace function public.sync_occurrences() returns trigger language plpgsql set search_path=public as $$
begin
 if new.quantity>600 then raise exception 'O limite é 600 execuções por serviço.'; end if;
 if TG_OP='UPDATE' and new.quantity<old.quantity then
  if exists(select 1 from service_occurrences where campaign_service_id=new.id and sequence_number>new.quantity and status='completed') then raise exception 'Não é possível remover execuções concluídas.'; end if;
  if current_setting('app.confirm_resize',true) is distinct from 'yes' then raise exception 'Confirme a remoção das execuções pendentes.'; end if;
  delete from service_occurrences where campaign_service_id=new.id and sequence_number>new.quantity;
 end if;
 insert into service_occurrences(workspace_id,campaign_service_id,sequence_number,status)
 select new.workspace_id,new.id,n,'pending' from generate_series(1,new.quantity) n on conflict(campaign_service_id,sequence_number) do nothing;
 return new;
end $$;
create trigger generate_occurrences after insert or update of quantity on public.campaign_services for each row execute function public.sync_occurrences();
create or replace function public.resize_service(p_id uuid,p_quantity integer) returns void language plpgsql security invoker set search_path=public as $$ begin
 perform set_config('app.confirm_resize','yes',true);
 update campaign_services set quantity=p_quantity where id=p_id;
 if not found then raise exception 'Serviço não encontrado.'; end if;
end $$;
create or replace function public.generate_campaign() returns trigger language plpgsql set search_path=public as $$
declare p public.service_packages; item record; sid uuid; half numeric; begin
 if new.total_value>0 then
  half:=round(new.total_value/2,2);
  insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status)
  values(new.workspace_id,new.id,case when new.payment_plan='full_upfront' then 'Pagamento antecipado' else 'Sinal • 50%' end,1,case when new.payment_plan='full_upfront' then new.total_value else half end,new.start_date,'pending');
  if new.payment_plan='half_and_half' then
   insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status)
   values(new.workspace_id,new.id,'Entrega • 50%',2,new.total_value-half,coalesce(new.end_date,new.start_date),'pending');
  end if;
 end if;
 if new.opportunity_id is not null then update opportunities set status='converted' where id=new.opportunity_id; end if;
 if new.service_package_id is not null then
  select * into p from service_packages where id=new.service_package_id;
  if not p.active or p.duration_months>36 then raise exception 'Pacote inativo ou duração acima de 36 meses.'; end if;
  if not exists(select 1 from service_package_items where package_id=p.id) then raise exception 'Adicione os itens ao pacote antes de contratar.'; end if;
  for item in select * from service_package_items where package_id=p.id loop
   insert into campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes)
   values(new.workspace_id,new.id,item.service_type_id,item.quantity_per_month*p.duration_months,0,'Incluso no pacote contratado') returning id into sid;
   update service_occurrences set scheduled_date=(new.start_date+make_interval(months=>((sequence_number-1)/item.quantity_per_month)))::date where campaign_service_id=sid;
  end loop;
 end if;
 return new;
end $$;
create trigger generate_campaign_data after insert on public.campaigns for each row execute function public.generate_campaign();
create or replace function public.log_contact() returns trigger language plpgsql set search_path=public as $$ begin
 if new.opportunity_id is not null then update opportunities set last_contact_at=greatest(last_contact_at,new.contacted_at),next_follow_up_at=new.next_follow_up_at,status=case when status='new' then 'contacted' else status end where id=new.opportunity_id; end if;
 if new.publisher_contact_id is not null then update publisher_contacts set last_contact_at=greatest(last_contact_at,new.contacted_at) where id=new.publisher_contact_id; end if;
 return new; end $$;
create trigger contact_history after insert on public.communication_logs for each row execute function public.log_contact();
create or replace function public.mark_media_kit(p_opportunity uuid,p_kit uuid,p_channel text) returns void language plpgsql security invoker set search_path=public as $$
declare o public.opportunities; begin
 select * into o from opportunities where id=p_opportunity for update;
 if not found then raise exception 'Oportunidade não encontrada.'; end if;
 if not exists(select 1 from media_kits where id=p_kit and workspace_id=o.workspace_id) then raise exception 'Media kit inválido.'; end if;
 update opportunities set status='media_kit_sent',media_kit_sent_at=now(),media_kit_version_id=p_kit where id=o.id;
 insert into communication_logs(workspace_id,opportunity_id,author_id,publisher_id,publisher_contact_id,channel,direction,responsible_user_id,contacted_at,summary)
 values(o.workspace_id,o.id,o.author_id,o.publisher_id,o.publisher_contact_id,p_channel,'outgoing',auth.uid(),now(),'Media kit enviado • versão '||(select version from media_kits where id=p_kit));
end $$;
create or replace function public.activate_kit(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare w uuid; begin select workspace_id into w from media_kits where id=p_id; perform pg_advisory_xact_lock(hashtext(w::text)); update media_kits set active=false where workspace_id=w and active; update media_kits set active=true where id=p_id; end $$;
revoke all on function public.resize_service(uuid,integer),public.mark_media_kit(uuid,uuid,text),public.activate_kit(uuid) from public;
grant execute on function public.resize_service(uuid,integer),public.mark_media_kit(uuid,uuid,text),public.activate_kit(uuid) to authenticated;
commit;
