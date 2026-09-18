begin;

alter table public.media_kits add column if not exists year integer;

update public.media_kits
set year = case
  when version ~ '^\\d{4}$' then version::integer
  else extract(year from created_at)::integer
end
where year is null;

alter table public.media_kits
  alter column year set default extract(year from current_date)::integer,
  alter column year set not null;

alter table public.media_kits
  drop constraint if exists media_kits_year_check;
alter table public.media_kits
  add constraint media_kits_year_check check (year between 1000 and 9999);

create index if not exists media_kits_workspace_year_name
  on public.media_kits(workspace_id, year desc, name);

commit;
