begin;
create table public.opportunity_service_items(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 opportunity_id uuid not null, service_type_id uuid not null, quantity integer not null check(quantity>0), unit_price numeric(12,2) not null default 0 check(unit_price>=0), notes text,
 unique(workspace_id,id), unique(opportunity_id,service_type_id)
);
alter table public.opportunity_service_items add foreign key(workspace_id,opportunity_id) references public.opportunities(workspace_id,id);
alter table public.opportunity_service_items add foreign key(workspace_id,service_type_id) references public.service_types(workspace_id,id);
alter table public.opportunity_service_items enable row level security;
create policy opportunity_service_items_access on public.opportunity_service_items for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create trigger updated before update on public.opportunity_service_items for each row execute function public.set_updated_at();

create or replace function public.generate_opportunity_services() returns trigger language plpgsql security definer set search_path=public as $$
declare item record; sid uuid; begin
 if new.opportunity_id is null then return new; end if;
 for item in select * from opportunity_service_items where opportunity_id=new.opportunity_id and workspace_id=new.workspace_id loop
  insert into campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes)
  values(new.workspace_id,new.id,item.service_type_id,item.quantity,item.unit_price,item.notes) returning id into sid;
  update service_occurrences set scheduled_date=null,schedule_status='to_confirm' where campaign_service_id=sid;
 end loop;
 return new;
end $$;
create trigger generate_opportunity_services_data after insert on public.campaigns for each row execute function public.generate_opportunity_services();
commit;
