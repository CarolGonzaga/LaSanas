begin;

-- Preferências pertencem ao membro no workspace, não à conta global.
alter table public.workspace_members add column if not exists home_view text not null default 'management';
alter table public.workspace_members drop constraint if exists workspace_members_home_view_check;
alter table public.workspace_members add constraint workspace_members_home_view_check check (home_view in ('management','production'));

alter table public.workspaces add column if not exists default_production_user_id uuid;
alter table public.workspaces drop constraint if exists workspaces_default_production_user_id_fkey;
alter table public.workspaces add constraint workspaces_default_production_user_id_fkey
  foreign key (default_production_user_id) references public.profiles(id) on delete set null;

alter table public.campaign_services add column if not exists assigned_to uuid;
alter table public.campaign_services drop constraint if exists campaign_services_workspace_id_assigned_to_fkey;
alter table public.campaign_services add constraint campaign_services_workspace_id_assigned_to_fkey
  foreign key (workspace_id,assigned_to) references public.workspace_members(workspace_id,user_id);

alter table public.service_occurrences add column if not exists assigned_to uuid;
alter table public.service_occurrences add column if not exists priority text not null default 'medium';
alter table public.service_occurrences drop constraint if exists service_occurrences_priority_check;
alter table public.service_occurrences add constraint service_occurrences_priority_check check (priority in ('low','medium','high'));
alter table public.service_occurrences drop constraint if exists service_occurrences_workspace_id_assigned_to_fkey;
alter table public.service_occurrences add constraint service_occurrences_workspace_id_assigned_to_fkey
  foreign key (workspace_id,assigned_to) references public.workspace_members(workspace_id,user_id);

alter table public.campaign_services add column if not exists default_priority text not null default 'medium';
alter table public.campaign_services drop constraint if exists campaign_services_default_priority_check;
alter table public.campaign_services add constraint campaign_services_default_priority_check check (default_priority in ('low','medium','high'));

-- Os dois fluxos operacionais usam o mesmo vocabulário de status.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('pending','in_progress','waiting','completed','cancelled'));
alter table public.service_occurrences drop constraint if exists service_occurrences_status_check;
alter table public.service_occurrences add constraint service_occurrences_status_check check (status in ('pending','in_progress','waiting','completed','cancelled'));

create or replace function public.apply_production_defaults() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_TABLE_NAME='campaign_services' and new.assigned_to is null then
    select default_production_user_id into new.assigned_to from workspaces where id=new.workspace_id;
  end if;
  if TG_TABLE_NAME='service_occurrences' then
    if new.assigned_to is null then select assigned_to into new.assigned_to from campaign_services where id=new.campaign_service_id; end if;
    if new.priority is null then select default_priority into new.priority from campaign_services where id=new.campaign_service_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists apply_production_defaults_service on public.campaign_services;
create trigger apply_production_defaults_service before insert on public.campaign_services for each row execute function public.apply_production_defaults();
drop trigger if exists apply_production_defaults_occurrence on public.service_occurrences;
create trigger apply_production_defaults_occurrence before insert on public.service_occurrences for each row execute function public.apply_production_defaults();

-- Ocorrências recém-geradas herdam a responsável e a prioridade do serviço.
create or replace function public.sync_occurrences() returns trigger language plpgsql set search_path=public as $$
begin
 if new.quantity>600 then raise exception 'O limite é 600 execuções por serviço.'; end if;
 if TG_OP='UPDATE' and new.quantity<old.quantity then
  if exists(select 1 from service_occurrences where campaign_service_id=new.id and sequence_number>new.quantity and status='completed') then raise exception 'Não é possível remover execuções concluídas.'; end if;
  if current_setting('app.confirm_resize',true) is distinct from 'yes' then raise exception 'Confirme a remoção das execuções pendentes.'; end if;
  delete from service_occurrences where campaign_service_id=new.id and sequence_number>new.quantity;
 end if;
 insert into service_occurrences(workspace_id,campaign_service_id,sequence_number,status,assigned_to,priority)
 select new.workspace_id,new.id,n,'pending',new.assigned_to,new.default_priority from generate_series(1,new.quantity) n
 on conflict(campaign_service_id,sequence_number) do nothing;
 return new;
end $$;

-- Serviço adicionado pela ficha da autora: recebe a mesma responsável opcional.
drop function if exists public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date);
create function public.create_author_service(p_workspace uuid,p_author uuid,p_book uuid,p_service_type uuid,p_quantity integer,p_unit_price numeric,p_notes text,p_schedule_status text,p_scheduled_date date,p_assigned_to uuid default null) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_author public.authors; v_book public.books; v_type public.service_types; v_campaign uuid; v_service uuid; begin
 if not public.is_workspace_member(p_workspace) then raise exception 'Você não possui acesso a este workspace.'; end if;
 select * into v_author from public.authors where id=p_author and workspace_id=p_workspace and archived_at is null; if not found then raise exception 'Autora inválida.'; end if;
 select * into v_type from public.service_types where id=p_service_type and workspace_id=p_workspace and active and archived_at is null; if not found then raise exception 'Tipo de serviço inválido.'; end if;
 if p_quantity<1 or p_quantity>600 then raise exception 'A quantidade deve estar entre 1 e 600.'; end if; if p_unit_price<0 then raise exception 'O valor não pode ser negativo.'; end if;
 if p_schedule_status not in ('to_confirm','scheduled') then raise exception 'Situação da data inválida.'; end if; if p_schedule_status='scheduled' and p_scheduled_date is null then raise exception 'Informe a data do serviço.'; end if;
 if p_book is not null then select * into v_book from public.books where id=p_book and workspace_id=p_workspace and archived_at is null; if not found or v_book.author_id is distinct from p_author then raise exception 'O livro não pertence à autora.'; end if; end if;
 insert into public.campaigns(workspace_id,name,author_id,book_id,campaign_type,proposal_type,start_date,total_value,payment_plan,status,notes)
 values(p_workspace,v_author.name || ' — ' || coalesce(v_book.title,'Serviços avulsos'),p_author,p_book,'advertising','custom',coalesce(p_scheduled_date,current_date),p_quantity*p_unit_price,'full_upfront','draft','Registro interno criado ao adicionar um serviço pela ficha da autora.') returning id into v_campaign;
 insert into public.campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes,assigned_to) values(p_workspace,v_campaign,p_service_type,p_quantity,p_unit_price,p_notes,p_assigned_to) returning id into v_service;
 update public.service_occurrences set scheduled_date=case when p_schedule_status='scheduled' then p_scheduled_date else null end,schedule_status=p_schedule_status where campaign_service_id=v_service;
 return v_service;
end $$;
revoke all on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date,uuid) from public;
grant execute on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date,uuid) to authenticated;

-- Backfill sem substituir atribuições existentes.
update public.campaign_services s set assigned_to=w.default_production_user_id
from public.workspaces w where w.id=s.workspace_id and s.assigned_to is null and w.default_production_user_id is not null;
update public.service_occurrences o set assigned_to=s.assigned_to
from public.campaign_services s where s.id=o.campaign_service_id and o.assigned_to is null and s.assigned_to is not null;

create index if not exists service_occurrences_work_assignment_date on public.service_occurrences(workspace_id,assigned_to,scheduled_date);

commit;
