begin;

-- Mantém release_date como histórico e passa a usar somente o ano no aplicativo.
alter table public.books add column if not exists release_year integer check (release_year between 1000 and 9999);
do $$ begin
 if exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='books' and column_name='release_date'
 ) then
  update public.books
  set release_year=extract(year from release_date)::integer
  where release_year is null and release_date is not null;
 end if;
end $$;

alter table public.service_occurrences add column if not exists schedule_status text;
update public.service_occurrences
set schedule_status=case when scheduled_date is null then 'to_confirm' else 'scheduled' end
where schedule_status is null or (schedule_status='to_confirm' and scheduled_date is not null);
alter table public.service_occurrences
 alter column schedule_status set default 'to_confirm',
 alter column schedule_status set not null;
alter table public.service_occurrences
 drop constraint if exists service_occurrences_schedule_status_check;
alter table public.service_occurrences
 add constraint service_occurrences_schedule_status_check
 check (schedule_status in ('to_confirm','scheduled'));
create or replace function public.normalize_occurrence_schedule() returns trigger language plpgsql set search_path=public as $$
begin
 if new.scheduled_date is null then
  new.schedule_status:='to_confirm';
 else
  new.schedule_status:='scheduled';
 end if;
 return new;
end $$;
drop trigger if exists normalize_occurrence_schedule on public.service_occurrences;
create trigger normalize_occurrence_schedule before insert or update of scheduled_date,schedule_status
 on public.service_occurrences for each row execute function public.normalize_occurrence_schedule();
create index if not exists service_occurrences_open_schedule
 on public.service_occurrences(workspace_id,schedule_status)
 where status='pending';

commit;
