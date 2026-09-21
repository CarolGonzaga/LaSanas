begin;

-- RESET ARQUITETURAL: preserva usuários, workspaces, autoras, editoras,
-- contatos, livros, catálogo de serviços e planos. Zera somente o histórico
-- comercial/operacional que dependia de Campaign.
delete from public.production_updates;
delete from public.communication_logs;
delete from public.tasks where related_opportunity_id is not null or related_campaign_id is not null;
delete from public.client_assets where campaign_id is not null;
delete from public.collective_reading_slots;
delete from public.book_club_slots;
delete from public.campaigns;
delete from public.opportunities;

-- Remove os gatilhos/funções que assumem Campaign como agregado comercial.
do $$ declare t text; begin
 foreach t in array array['authors','publishers','publisher_contacts','books','opportunities','communication_logs','service_types','service_packages','service_package_items','payments','service_occurrences','tasks','client_assets'] loop
   execute format('drop trigger if exists validate_business on public.%I',t);
 end loop;
end $$;
drop function if exists public.approve_opportunity(uuid);
drop function if exists public.sync_contract_item(uuid);
drop trigger if exists sync_contract_item_payment on public.payments;
drop trigger if exists sync_opportunity_contact on public.communication_logs;
drop trigger if exists sync_opportunity_book on public.opportunities;
drop function if exists public.sync_contract_item_payment_trigger();
drop function if exists public.sync_opportunity_identity_and_first_contact(uuid);
drop function if exists public.sync_opportunity_contact_trigger();
drop function if exists public.sync_opportunity_book_trigger();
drop function if exists public.business_rules() cascade;

drop table if exists public.campaign_contract_items cascade;
drop table if exists public.campaign_services cascade;
drop table if exists public.campaigns cascade;
drop table if exists public.opportunity_service_items cascade;
drop table if exists public.service_occurrences cascade;
drop table if exists public.payments cascade;

alter table public.communication_logs drop column if exists campaign_id;
alter table public.client_assets drop column if exists campaign_id;
alter table public.tasks drop column if exists related_campaign_id;
alter table public.opportunities drop constraint if exists opportunities_status_check;
alter table public.opportunities alter column author_id drop not null;
alter table public.opportunities alter column publisher_id drop not null;
alter table public.opportunities alter column book_id drop not null;
alter table public.opportunities alter column responsible_user_id drop not null;
alter table public.opportunities alter column proposal_type drop not null;
alter table public.opportunities add constraint opportunities_status_check check(status in ('new','negotiating','waiting_data','awaiting_payment','in_production','delivered','lost','cancelled'));
alter table public.opportunities drop constraint if exists opportunities_contact_required;
alter table public.opportunities add constraint opportunities_contact_required check((contact_type='author' and author_id is not null) or (contact_type='publisher' and publisher_id is not null));

create table public.opportunity_services(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), opportunity_id uuid not null references public.opportunities(id) on delete cascade,
 item_kind text not null check(item_kind in ('service','package')), service_type_id uuid references public.service_types(id), service_package_id uuid references public.service_packages(id),
 quantity integer not null default 1 check(quantity>=1), unit_price numeric(12,2) not null check(unit_price>=0), duration_months integer check(duration_months between 1 and 36), selected_package_item_ids uuid[] not null default '{}',
 payment_terms text not null check(payment_terms in ('full_upfront','half_and_half','monthly_full')), notes text, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((item_kind='service' and service_type_id is not null and service_package_id is null and duration_months is null and payment_terms in ('full_upfront','half_and_half')) or (item_kind='package' and service_type_id is null and service_package_id is not null and duration_months>=1 and payment_terms='monthly_full'))
);
create table public.payments(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), opportunity_service_id uuid not null references public.opportunity_services(id) on delete cascade,
 installment_number integer not null check(installment_number>=1), billing_cycle integer, description text not null, amount numeric(12,2) not null check(amount>=0), due_date date, status text not null default 'pending' check(status in ('pending','paid','cancelled')), paid_at timestamptz, payment_method text, payment_method_custom text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(opportunity_service_id,installment_number)
);
create table public.service_occurrences(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), opportunity_service_id uuid not null references public.opportunity_services(id) on delete cascade,
 service_type_id uuid references public.service_types(id), sequence_number integer not null check(sequence_number>=1), billing_cycle integer, assigned_to uuid references public.profiles(id), scheduled_date date, scheduled_time time, schedule_status text not null default 'to_confirm' check(schedule_status in ('to_confirm','scheduled')), status text not null default 'pending' check(status in ('pending','in_progress','in_revision','completed','cancelled')), released_at timestamptz, completed_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(opportunity_service_id,sequence_number)
);
create table public.service_proofs(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), opportunity_service_id uuid not null references public.opportunity_services(id) on delete cascade, service_occurrence_id uuid references public.service_occurrences(id) on delete cascade, label text not null, url text, notes text, storage_path text, original_filename text, mime_type text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(url is not null or storage_path is not null)
);

do $$ declare t text; begin foreach t in array array['opportunity_services','payments','service_occurrences','service_proofs'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy workspace_access on public.%I for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id))',t); execute format('create trigger updated before update on public.%I for each row execute function public.set_updated_at()',t); end loop; end $$;
grant select, insert, update, delete on public.opportunity_services, public.payments, public.service_occurrences, public.service_proofs to authenticated;

create or replace function public.opportunity_rules() returns trigger language plpgsql set search_path=public as $$ declare b public.books; begin
 if TG_TABLE_NAME='opportunities' then
  if new.book_id is not null then select * into b from books where id=new.book_id and workspace_id=new.workspace_id; if not found then raise exception 'Livro inválido.'; end if; if new.contact_type='author' and new.author_id is distinct from b.author_id then raise exception 'O livro não pertence à autora.'; end if; if new.contact_type='publisher' and new.publisher_id is distinct from b.publisher_id then raise exception 'O livro não pertence à editora.'; end if; new.author_id:=b.author_id; new.name:=coalesce((select name from authors where id=b.author_id),'Autora')||' — '||b.title; end if;
 end if; if TG_TABLE_NAME='service_occurrences' then new.completed_at:=case when new.status='completed' then coalesce(new.completed_at,now()) else null end; if new.scheduled_date is not null then new.schedule_status:='scheduled'; end if; end if; return new; end $$;
create trigger validate_opportunity before insert or update on public.opportunities for each row execute function public.opportunity_rules();
create trigger validate_occurrence before insert or update on public.service_occurrences for each row execute function public.opportunity_rules();

-- A contratação é a única entrada que gera financeiro e produção. Assim não
-- existem cobranças ou execuções soltas, nem uma Campaign intermediária.
create or replace function public.generate_opportunity_service() returns trigger language plpgsql security definer set search_path=public as $$
declare i integer; cycle integer; item record; production_user uuid; amount numeric(12,2); first_amount numeric(12,2); sequence integer := 0;
begin
 if not exists(select 1 from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id and book_id is not null) then
   raise exception 'Associe um livro à oportunidade antes de contratar serviços.';
 end if;
 select default_production_user_id into production_user from workspaces where id=new.workspace_id;
 if new.item_kind='service' then
   if new.payment_terms='half_and_half' then
     first_amount := round(new.quantity * new.unit_price / 2, 2);
     insert into payments(workspace_id,opportunity_service_id,installment_number,description,amount) values
       (new.workspace_id,new.id,1,'Sinal',first_amount),
       (new.workspace_id,new.id,2,'Entrega',new.quantity * new.unit_price - first_amount);
   else
     insert into payments(workspace_id,opportunity_service_id,installment_number,description,amount) values
       (new.workspace_id,new.id,1,'Pagamento integral',new.quantity * new.unit_price);
   end if;
   for i in 1..new.quantity loop
     insert into service_occurrences(workspace_id,opportunity_service_id,service_type_id,sequence_number,assigned_to,notes)
       values(new.workspace_id,new.id,new.service_type_id,i,production_user,new.notes);
   end loop;
 else
   for cycle in 1..new.duration_months loop
     insert into payments(workspace_id,opportunity_service_id,installment_number,billing_cycle,description,amount)
       values(new.workspace_id,new.id,cycle,cycle,'Mensalidade ' || cycle || '/' || new.duration_months,new.unit_price);
     for item in select * from service_package_items where package_id=new.service_package_id and archived_at is null
       and (cardinality(new.selected_package_item_ids)=0 or id=any(new.selected_package_item_ids)) loop
       for i in 1..item.quantity_per_month loop
         sequence:=sequence+1;
         insert into service_occurrences(workspace_id,opportunity_service_id,service_type_id,sequence_number,billing_cycle,assigned_to,notes)
           values(new.workspace_id,new.id,item.service_type_id,sequence,cycle,production_user,new.notes);
       end loop;
     end loop;
   end loop;
 end if;
 update opportunities set status='awaiting_payment' where id=new.opportunity_id and status in ('new','negotiating','waiting_data');
 return new;
end $$;
create trigger generate_opportunity_service after insert on public.opportunity_services for each row execute function public.generate_opportunity_service();

create or replace function public.release_paid_production() returns trigger language plpgsql security definer set search_path=public as $$
declare item public.opportunity_services; should_release boolean := false;
begin
 if new.status='paid' and (old.status is distinct from 'paid') then
   select * into item from opportunity_services where id=new.opportunity_service_id;
   should_release := item.payment_terms='monthly_full' or new.installment_number=1;
   if should_release then
     update service_occurrences set released_at=coalesce(released_at,now())
       where opportunity_service_id=item.id
         and (item.payment_terms <> 'monthly_full' or billing_cycle=new.billing_cycle);
     update opportunities set status='in_production' where id=item.opportunity_id and status not in ('delivered','lost','cancelled');
   end if;
 end if;
 return new;
end $$;
create trigger release_paid_production after update of status on public.payments for each row execute function public.release_paid_production();

create or replace function public.confirm_payment(p_payment uuid,p_paid_at timestamptz,p_method text,p_custom text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 update payments set status='paid',paid_at=coalesce(p_paid_at,now()),payment_method=p_method,payment_method_custom=case when p_method='other' then nullif(p_custom,'') else null end
 where id=p_payment and workspace_id in (select workspace_id from workspace_members where user_id=auth.uid() and active);
 if not found then raise exception 'Cobrança não encontrada ou sem acesso.'; end if;
end $$;

create or replace function public.sync_opportunity_first_contact() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid := coalesce(new.opportunity_id,old.opportunity_id); begin
 if target is not null then update opportunities set first_contact_at=(select min(contacted_at) from communication_logs where opportunity_id=target) where id=target; end if;
 return coalesce(new,old);
end $$;
create trigger sync_opportunity_first_contact after insert or update or delete on public.communication_logs for each row execute function public.sync_opportunity_first_contact();

-- Notificações são direcionadas pela configuração do workspace, nunca por e-mail.
drop trigger if exists notify_production_status on public.service_occurrences;
create or replace function public.notify_production_status() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid; production_user uuid; begin
 if new.status is not distinct from old.status or auth.uid() is null then return new; end if;
 select default_production_user_id into production_user from workspaces where id=new.workspace_id;
 if auth.uid() is distinct from production_user then return new; end if;
 select user_id into recipient from workspace_members where workspace_id=new.workspace_id and role='admin' and active and user_id<>auth.uid() order by created_at limit 1;
 if recipient is not null then insert into production_updates(workspace_id,occurrence_id,actor_user_id,recipient_user_id,previous_status,current_status) values(new.workspace_id,new.id,auth.uid(),recipient,old.status,new.status); end if;
 return new;
end $$;
create trigger notify_production_status after update of status on public.service_occurrences for each row execute function public.notify_production_status();
commit;
