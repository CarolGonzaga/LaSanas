begin;

alter table public.profiles add column if not exists username text;
alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username is null or username ~ '^[A-Za-z0-9._-]{2,40}$');
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

commit;
