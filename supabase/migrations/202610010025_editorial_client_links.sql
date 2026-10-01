begin;

-- Optional client links retain independent editorial planning and existing rows.
alter table public.collective_reading_slots add column publisher_id uuid;
alter table public.collective_reading_slots add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
alter table public.book_club_slots add column author_id uuid;
alter table public.book_club_slots add column publisher_id uuid;
alter table public.book_club_slots add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
alter table public.book_club_slots add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);

create or replace function public.validate_editorial_slot() returns trigger language plpgsql security definer set search_path=public as $$
declare b books; contact_publisher uuid;
begin
 if new.book_id is not null then
   select * into b from books where id=new.book_id and workspace_id=new.workspace_id;
   if not found then raise exception 'Livro inválido.'; end if;
   if new.author_id is not null and new.author_id is distinct from b.author_id then raise exception 'O livro não pertence à autora.'; end if;
   if new.publisher_id is not null and new.publisher_id is distinct from b.publisher_id then raise exception 'O livro não pertence à editora.'; end if;
   new.author_id:=b.author_id;
   new.publisher_id:=b.publisher_id;
 end if;
 if TG_TABLE_NAME='book_club_slots' then
 if new.publisher_contact_id is not null then
   select publisher_id into contact_publisher from publisher_contacts where id=new.publisher_contact_id and workspace_id=new.workspace_id;
   if not found then raise exception 'Contato da editora inválido.'; end if;
   if (new.publisher_id is not null and contact_publisher is distinct from new.publisher_id) or (new.book_id is not null and contact_publisher is distinct from b.publisher_id) then raise exception 'O contato não pertence à editora do livro.'; end if;
   new.publisher_id:=contact_publisher;
 end if;
 end if;
 return new;
end $$;
commit;
