begin;

-- A contratação não é produção. Esta camada é a fonte de verdade comercial
-- para uma campanha e permite que cada serviço/plano tenha a sua cobrança.
create table if not exists public.campaign_contract_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  campaign_id uuid not null,
  opportunity_item_id uuid,
  book_id uuid,
  item_kind text not null check (item_kind in ('service','package')),
  service_type_id uuid,
  service_package_id uuid,
  description text,
  quantity integer not null default 1 check (quantity >= 1),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  duration_months integer check (duration_months between 1 and 36),
  contract_total numeric(12,2) not null default 0 check (contract_total >= 0),
  payment_terms text not null check (payment_terms in ('full_upfront','half_and_half','monthly_full')),
  planned_date date,
  status text not null default 'pending' check (status in ('pending','partially_paid','paid','legacy_review','cancelled')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(campaign_id,opportunity_item_id),
  check (
    (item_kind='service' and service_type_id is not null and service_package_id is null and duration_months is null and payment_terms in ('full_upfront','half_and_half'))
    or
    (item_kind='package' and service_type_id is null and service_package_id is not null and duration_months between 1 and 36 and payment_terms='monthly_full')
  )
);
alter table public.campaign_contract_items add constraint campaign_contract_items_campaign_fkey foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id) on delete cascade;
alter table public.campaign_contract_items add constraint campaign_contract_items_book_fkey foreign key(workspace_id,book_id) references public.books(workspace_id,id) on delete restrict;
alter table public.campaign_contract_items add constraint campaign_contract_items_service_fkey foreign key(workspace_id,service_type_id) references public.service_types(workspace_id,id) on delete restrict;
alter table public.campaign_contract_items add constraint campaign_contract_items_package_fkey foreign key(workspace_id,service_package_id) references public.service_packages(workspace_id,id) on delete restrict;
alter table public.campaign_contract_items add constraint campaign_contract_items_opportunity_item_fkey foreign key(workspace_id,opportunity_item_id) references public.opportunity_service_items(workspace_id,id) on delete set null;
alter table public.campaign_contract_items enable row level security;
create policy campaign_contract_items_access on public.campaign_contract_items for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
drop trigger if exists updated_at_campaign_contract_items on public.campaign_contract_items;
create trigger updated_at_campaign_contract_items before update on public.campaign_contract_items for each row execute function public.set_updated_at();

-- Itens negociados podem ser avulsos ou planos; os registros antigos seguem
-- sendo itens de serviço e não são recriados.
alter table public.opportunity_service_items add column if not exists item_kind text not null default 'service';
alter table public.opportunity_service_items add column if not exists service_package_id uuid;
alter table public.opportunity_service_items add column if not exists duration_months integer;
alter table public.opportunity_service_items add column if not exists payment_terms text;
alter table public.opportunity_service_items add column if not exists planned_date date;
alter table public.opportunity_service_items add column if not exists selected_package_item_ids uuid[] not null default '{}';
alter table public.opportunity_service_items alter column service_type_id drop not null;
alter table public.opportunity_service_items drop constraint if exists opportunity_service_items_item_kind_check;
alter table public.opportunity_service_items add constraint opportunity_service_items_item_kind_check check (item_kind in ('service','package'));
alter table public.opportunity_service_items drop constraint if exists opportunity_service_items_item_shape_check;
alter table public.opportunity_service_items add constraint opportunity_service_items_item_shape_check check (
  (item_kind='service' and service_type_id is not null and service_package_id is null and duration_months is null and coalesce(payment_terms,'full_upfront') in ('full_upfront','half_and_half'))
  or (item_kind='package' and service_type_id is null and service_package_id is not null and duration_months between 1 and 36 and coalesce(payment_terms,'monthly_full')='monthly_full')
);
alter table public.opportunity_service_items add constraint opportunity_service_items_workspace_package_fkey foreign key(workspace_id,service_package_id) references public.service_packages(workspace_id,id);
grant select,insert,update,delete on public.opportunity_service_items,public.campaign_contract_items to authenticated;
update public.opportunity_service_items set item_kind='service', payment_terms=coalesce(payment_terms,'full_upfront') where service_type_id is not null;

alter table public.campaign_services add column if not exists campaign_contract_item_id uuid;
alter table public.campaign_services add constraint campaign_services_contract_item_fkey foreign key(workspace_id,campaign_contract_item_id) references public.campaign_contract_items(workspace_id,id) on delete cascade;
create unique index if not exists campaign_services_contract_production_unique on public.campaign_services(campaign_contract_item_id,coalesce(service_type_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(package_item_id,'00000000-0000-0000-0000-000000000000'::uuid)) where campaign_contract_item_id is not null;
alter table public.service_occurrences add column if not exists package_month_number integer;
alter table public.service_occurrences add column if not exists released_at timestamptz;
alter table public.payments add column if not exists campaign_contract_item_id uuid;
alter table public.payments add column if not exists allocation_status text not null default 'linked' check (allocation_status in ('linked','legacy_review'));
alter table public.payments add constraint payments_contract_item_fkey foreign key(workspace_id,campaign_contract_item_id) references public.campaign_contract_items(workspace_id,id) on delete cascade;
alter table public.payments drop constraint if exists payments_campaign_id_installment_number_key;
create unique index if not exists payments_contract_item_installment_unique on public.payments(campaign_contract_item_id,installment_number) where campaign_contract_item_id is not null;

-- Nome e editora de oportunidade são derivados do livro. A data do primeiro
-- contato vem da primeira mensagem, sem apagar um valor legado sem mensagens.
alter table public.opportunities add column if not exists media_kit_notes text;
alter table public.books add column if not exists images_url text;
alter table public.books add column if not exists tropes text;
alter table public.books add column if not exists release_year integer;
update public.books set release_year=extract(year from release_date)::integer where release_year is null and release_date is not null;

create or replace function public.sync_opportunity_identity_and_first_contact(p_opportunity uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_first timestamptz; v_name text; begin
  select min(contacted_at) into v_first from communication_logs where opportunity_id=p_opportunity and archived_at is null;
  select case when a.name is not null and b.title is not null then a.name || ' — ' || b.title else null end into v_name
  from opportunities o left join authors a on a.id=o.author_id left join books b on b.id=o.book_id where o.id=p_opportunity;
  update opportunities set first_contact_at=coalesce(v_first,first_contact_at), name=coalesce(v_name,name), publisher_id=(select b.publisher_id from books b where b.id=opportunities.book_id) where id=p_opportunity;
end $$;
create or replace function public.sync_opportunity_contact_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.sync_opportunity_identity_and_first_contact(coalesce(new.opportunity_id,old.opportunity_id)); return coalesce(new,old); end $$;
drop trigger if exists sync_opportunity_contact on public.communication_logs;
create trigger sync_opportunity_contact after insert or update of contacted_at,opportunity_id,archived_at or delete on public.communication_logs for each row execute function public.sync_opportunity_contact_trigger();
create or replace function public.sync_opportunity_book_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.sync_opportunity_identity_and_first_contact(new.id); return new; end $$;
drop trigger if exists sync_opportunity_book on public.opportunities;
create trigger sync_opportunity_book after insert or update of author_id,book_id on public.opportunities for each row execute function public.sync_opportunity_book_trigger();
update public.opportunities o set first_contact_at=coalesce((select min(l.contacted_at) from communication_logs l where l.opportunity_id=o.id and l.archived_at is null),o.first_contact_at), name=coalesce((select a.name || ' — ' || b.title from authors a join books b on b.author_id=a.id where a.id=o.author_id and b.id=o.book_id),o.name), publisher_id=(select b.publisher_id from books b where b.id=o.book_id);

-- Não deixar os gatilhos anteriores criarem registros comerciais duplicados.
drop trigger if exists generate_opportunity_services_data on public.campaigns;
drop trigger if exists campaign_service_total_sync on public.campaign_services;
drop trigger if exists payment_sync_campaign_state on public.payments;

create or replace function public.sync_contract_item(p_contract_item uuid) returns void language plpgsql security definer set search_path=public as $$
declare ci public.campaign_contract_items; paid_total numeric:=0; paid_months integer:=0; needed numeric:=0; begin
 select * into ci from campaign_contract_items where id=p_contract_item for update; if not found then return; end if;
 select coalesce(sum(amount) filter(where status='paid'),0), count(*) filter(where status='paid') into paid_total,paid_months from payments where campaign_contract_item_id=ci.id and allocation_status='linked';
 if ci.item_kind='service' then needed:=case when ci.payment_terms='half_and_half' then round(ci.contract_total/2,2) else ci.contract_total end;
   update campaign_contract_items set status=case when paid_total>=contract_total then 'paid' when paid_total>=needed then 'partially_paid' else 'pending' end where id=ci.id;
   if paid_total>=needed then update service_occurrences o set released_at=coalesce(released_at,now()) from campaign_services s where o.campaign_service_id=s.id and s.campaign_contract_item_id=ci.id; end if;
 else
   update campaign_contract_items set status=case when paid_months>=duration_months then 'paid' when paid_months>0 then 'partially_paid' else 'pending' end where id=ci.id;
   update service_occurrences o set released_at=coalesce(released_at,now()) from campaign_services s where o.campaign_service_id=s.id and s.campaign_contract_item_id=ci.id and coalesce(o.package_month_number,1)<=paid_months;
 end if;
 update campaigns set status=case when exists(select 1 from service_occurrences o join campaign_services s on s.id=o.campaign_service_id where s.campaign_id=campaigns.id and o.released_at is not null) then 'active' else 'awaiting_payment' end where id=ci.campaign_id and status not in ('completed','cancelled');
end $$;
create or replace function public.sync_contract_item_payment_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin if coalesce(new.campaign_contract_item_id,old.campaign_contract_item_id) is not null then perform public.sync_contract_item(coalesce(new.campaign_contract_item_id,old.campaign_contract_item_id)); end if; return coalesce(new,old); end $$;
create trigger sync_contract_item_payment after insert or update or delete on public.payments for each row execute function public.sync_contract_item_payment_trigger();

create or replace function public.approve_opportunity(p_opportunity uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare o public.opportunities; c public.campaigns; oi record; ci uuid; cs uuid; pkg_item record; month_no integer; installment integer; half numeric; v_book public.books; begin
 select * into o from opportunities where id=p_opportunity for update; if not found or not public.is_workspace_member(o.workspace_id) then raise exception 'Oportunidade não encontrada.'; end if;
 if o.book_id is null or o.author_id is null then raise exception 'Informe autora e livro antes de aprovar.'; end if;
 select * into v_book from books where id=o.book_id and workspace_id=o.workspace_id; if not found or v_book.author_id is distinct from o.author_id then raise exception 'O livro deve pertencer à autora da oportunidade.'; end if;
 update opportunities set status='approved', publisher_id=v_book.publisher_id, name=o.name where id=o.id;
 select * into c from campaigns where opportunity_id=o.id and workspace_id=o.workspace_id; if not found then
   insert into campaigns(workspace_id,name,opportunity_id,author_id,publisher_id,book_id,campaign_type,proposal_type,start_date,total_value,payment_plan,status,notes) values(o.workspace_id,coalesce((select a.name || ' — ' || v_book.title from authors a where a.id=o.author_id),o.name),o.id,o.author_id,v_book.publisher_id,o.book_id,'advertising',coalesce(o.proposal_type,'custom'),current_date,0,'full_upfront','awaiting_payment','Gerada automaticamente pela aprovação da oportunidade.') returning * into c;
 end if;
 for oi in select * from opportunity_service_items where opportunity_id=o.id and workspace_id=o.workspace_id order by created_at loop
   insert into campaign_contract_items(workspace_id,campaign_id,opportunity_item_id,book_id,item_kind,service_type_id,service_package_id,description,quantity,unit_price,duration_months,contract_total,payment_terms,planned_date)
   values(o.workspace_id,c.id,oi.id,o.book_id,oi.item_kind,oi.service_type_id,oi.service_package_id,oi.notes,oi.quantity,oi.unit_price,oi.duration_months,case when oi.item_kind='package' then oi.unit_price*oi.duration_months else oi.quantity*oi.unit_price end,coalesce(oi.payment_terms,case when oi.item_kind='package' then 'monthly_full' else 'full_upfront' end),oi.planned_date)
   on conflict(campaign_id,opportunity_item_id) do update set updated_at=now() returning id into ci;
   if oi.item_kind='service' then
     insert into campaign_services(workspace_id,campaign_id,campaign_contract_item_id,service_type_id,quantity,unit_price,book_id,notes) values(o.workspace_id,c.id,ci,oi.service_type_id,oi.quantity,0,o.book_id,oi.notes) on conflict do nothing returning id into cs;
     if cs is null then select id into cs from campaign_services where campaign_contract_item_id=ci limit 1; end if;
   else
     for pkg_item in select * from service_package_items where workspace_id=o.workspace_id and package_id=oi.service_package_id and archived_at is null and (coalesce(array_length(oi.selected_package_item_ids,1),0)=0 or id=any(oi.selected_package_item_ids)) loop
       insert into campaign_services(workspace_id,campaign_id,campaign_contract_item_id,service_type_id,quantity,unit_price,book_id,package_item_id,notes) values(o.workspace_id,c.id,ci,pkg_item.service_type_id,pkg_item.quantity_per_month*oi.duration_months,0,o.book_id,pkg_item.id,oi.notes) on conflict do nothing returning id into cs;
       update service_occurrences set package_month_number=ceil(sequence_number::numeric/pkg_item.quantity_per_month), scheduled_date=null, schedule_status='to_confirm' where campaign_service_id=cs;
     end loop;
   end if;
   if not exists(select 1 from payments where campaign_contract_item_id=ci) then
     if oi.item_kind='package' then
       for installment in 1..oi.duration_months loop insert into payments(workspace_id,campaign_id,campaign_contract_item_id,description,installment_number,amount,due_date,status) values(o.workspace_id,c.id,ci,'Mensalidade ' || installment || '/' || oi.duration_months,installment,oi.unit_price,coalesce(oi.planned_date,current_date)+(installment-1)*interval '1 month','pending'); end loop;
     elsif coalesce(oi.payment_terms,'full_upfront')='half_and_half' then
       half:=round((oi.quantity*oi.unit_price)/2,2); insert into payments(workspace_id,campaign_id,campaign_contract_item_id,description,installment_number,amount,due_date,status) values(o.workspace_id,c.id,ci,'Sinal • 50%',1,half,coalesce(oi.planned_date,current_date),'pending'),(o.workspace_id,c.id,ci,'Entrega • 50%',2,oi.quantity*oi.unit_price-half,coalesce(oi.planned_date,current_date),'pending');
     else insert into payments(workspace_id,campaign_id,campaign_contract_item_id,description,installment_number,amount,due_date,status) values(o.workspace_id,c.id,ci,'Pagamento antecipado',1,oi.quantity*oi.unit_price,coalesce(oi.planned_date,current_date),'pending'); end if;
   end if;
 end loop;
 update opportunities set status='converted' where id=o.id; return c.id;
end $$;
grant execute on function public.approve_opportunity(uuid) to authenticated;

-- Migração conservadora dos serviços legados: uma cobrança de campanha só é
-- atribuída automaticamente quando há um único serviço. Os casos ambíguos
-- permanecem visíveis para revisão, sem liberar produção indevidamente.
insert into campaign_contract_items(workspace_id,campaign_id,book_id,item_kind,service_type_id,description,quantity,unit_price,contract_total,payment_terms,status)
select s.workspace_id,s.campaign_id,coalesce(s.book_id,c.book_id),'service',s.service_type_id,coalesce(s.notes,s.custom_name),s.quantity,s.unit_price,s.total_price,coalesce(c.payment_plan,'full_upfront'),case when (select count(*) from campaign_services sx where sx.campaign_id=s.campaign_id)=1 then 'pending' else 'legacy_review' end
from campaign_services s join campaigns c on c.id=s.campaign_id where s.campaign_contract_item_id is null
on conflict do nothing;
update campaign_services s set campaign_contract_item_id=ci.id from campaign_contract_items ci where ci.campaign_id=s.campaign_id and ci.service_type_id is not distinct from s.service_type_id and s.campaign_contract_item_id is null;
update payments p set campaign_contract_item_id=ci.id from campaign_contract_items ci where ci.campaign_id=p.campaign_id and (select count(*) from campaign_contract_items x where x.campaign_id=p.campaign_id)=1 and p.campaign_contract_item_id is null;
update payments p set allocation_status='legacy_review' where p.campaign_contract_item_id is null;
update service_occurrences o set released_at=now() from campaign_services s join campaign_contract_items ci on ci.id=s.campaign_contract_item_id where o.campaign_service_id=s.id and ci.status='paid' and o.released_at is null;

commit;
