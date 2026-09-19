begin;

create or replace function public.prevent_duplicate_contact_email() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is null or btrim(new.email) = '' then return new; end if;
  new.email := lower(btrim(new.email));
  if tg_table_name = 'authors' and exists (
    select 1 from public.authors
    where workspace_id = new.workspace_id and lower(email) = new.email and id is distinct from new.id
  ) then raise exception 'Já existe uma autora cadastrada com este e-mail.'; end if;
  if tg_table_name = 'publisher_contacts' and exists (
    select 1 from public.publisher_contacts
    where workspace_id = new.workspace_id and lower(email) = new.email and id is distinct from new.id
  ) then raise exception 'Já existe um contato de editora cadastrado com este e-mail.'; end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_author_email on public.authors;
create trigger prevent_duplicate_author_email before insert or update of email on public.authors
for each row execute function public.prevent_duplicate_contact_email();

drop trigger if exists prevent_duplicate_publisher_contact_email on public.publisher_contacts;
create trigger prevent_duplicate_publisher_contact_email before insert or update of email on public.publisher_contacts
for each row execute function public.prevent_duplicate_contact_email();

commit;
