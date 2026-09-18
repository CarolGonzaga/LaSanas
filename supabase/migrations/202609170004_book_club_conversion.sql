begin;
alter table public.campaigns add column book_club_slot_id uuid;
alter table public.campaigns add foreign key(workspace_id,book_club_slot_id) references public.book_club_slots(workspace_id,id);
create unique index one_campaign_per_club_slot on public.campaigns(book_club_slot_id);
create or replace function public.link_club_campaign() returns trigger language plpgsql set search_path=public as $$
declare slot public.book_club_slots; begin
 if new.book_club_slot_id is not null then
  select * into slot from book_club_slots where id=new.book_club_slot_id and workspace_id=new.workspace_id for update;
  if not found or slot.campaign_id is not null then raise exception 'Mês não encontrado ou já possui campanha.'; end if;
  if slot.book_id is distinct from new.book_id or slot.publisher_id is distinct from new.publisher_id then raise exception 'A campanha deve utilizar o livro e a editora do mês.'; end if;
  update book_club_slots set campaign_id=new.id,status='confirmed',confirmed_at=now() where id=slot.id;
 end if;
 return new;
end $$;
create trigger link_club after insert on public.campaigns for each row execute function public.link_club_campaign();
commit;

