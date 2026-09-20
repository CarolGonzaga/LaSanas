begin;

update public.tasks set status='in_revision' where status='waiting';
update public.service_occurrences set status='in_revision' where status='waiting';
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('pending','in_progress','in_revision','completed','cancelled'));
alter table public.service_occurrences drop constraint if exists service_occurrences_status_check;
alter table public.service_occurrences add constraint service_occurrences_status_check check (status in ('pending','in_progress','in_revision','completed','cancelled'));

create table if not exists public.production_updates(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 occurrence_id uuid not null, actor_user_id uuid not null references public.profiles(id), recipient_user_id uuid not null references public.profiles(id),
 previous_status text not null, current_status text not null, created_at timestamptz not null default now(), read_at timestamptz
);
alter table public.production_updates enable row level security;
create policy production_updates_access on public.production_updates for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create index if not exists production_updates_recipient on public.production_updates(workspace_id,recipient_user_id,read_at,created_at desc);

create or replace function public.notify_production_status() returns trigger language plpgsql set search_path=public as $$
declare actor_email text; recipient uuid; begin
 if new.status is not distinct from old.status or auth.uid() is null then return new; end if;
 select lower(email) into actor_email from profiles where id=auth.uid();
 if actor_email <> 'anaflavial1n4@gmail.com' then return new; end if;
 select id into recipient from profiles where lower(email)='anacquesta@gmail.com';
 if recipient is not null and recipient <> auth.uid() then
  insert into production_updates(workspace_id,occurrence_id,actor_user_id,recipient_user_id,previous_status,current_status)
  values(new.workspace_id,new.id,auth.uid(),recipient,old.status,new.status);
 end if;
 return new;
end $$;
drop trigger if exists notify_production_status on public.service_occurrences;
create trigger notify_production_status after update of status on public.service_occurrences for each row execute function public.notify_production_status();
commit;
