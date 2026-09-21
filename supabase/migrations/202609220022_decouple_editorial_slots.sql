begin;

-- Leitura coletiva e Clube são planejamentos editoriais, independentes do
-- fluxo comercial. Nenhum deles precisa de Campaign, oportunidade, autora,
-- editora ou livro para existir no planejamento.
alter table public.collective_reading_slots drop column if exists campaign_id;
alter table public.book_club_slots drop column if exists campaign_id;
alter table public.book_club_slots drop column if exists publisher_id;

alter table public.book_club_slots drop constraint if exists book_club_slots_status_check;
alter table public.book_club_slots add constraint book_club_slots_status_check
  check(status in ('planning','book_selected','contact_pending','contacted','confirmed','completed','cancelled'));

create or replace function public.validate_editorial_slot() returns trigger language plpgsql security definer set search_path=public as $$
declare book_publisher uuid; contact_publisher uuid; begin
 if new.book_id is not null and not exists(select 1 from books where id=new.book_id and workspace_id=new.workspace_id) then
   raise exception 'Livro inválido.';
 end if;
 if TG_TABLE_NAME='book_club_slots' and new.publisher_contact_id is not null then
   select publisher_id into contact_publisher from publisher_contacts where id=new.publisher_contact_id and workspace_id=new.workspace_id;
   if not found then raise exception 'Contato da editora inválido.'; end if;
   if new.book_id is not null then
     select publisher_id into book_publisher from books where id=new.book_id;
     if book_publisher is null or contact_publisher is distinct from book_publisher then raise exception 'O contato não pertence à editora do livro.'; end if;
   end if;
 end if;
 return new;
end $$;
create trigger validate_editorial_slot before insert or update on public.collective_reading_slots for each row execute function public.validate_editorial_slot();
create trigger validate_editorial_club before insert or update on public.book_club_slots for each row execute function public.validate_editorial_slot();
commit;
