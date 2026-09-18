begin;

-- Vários materiais comerciais podem permanecer disponíveis ao mesmo tempo.
drop index if exists public.one_active_kit;
create or replace function public.activate_kit(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare w uuid; begin
 select workspace_id into w from media_kits where id=p_id;
 if w is null or not public.is_workspace_member(w) then raise exception 'Media kit não encontrado.'; end if;
 update media_kits set active=true where id=p_id and workspace_id=w;
end $$;

-- Um serviço pode cobrir um título específico, sem obrigar a campanha toda a ter livro.
alter table public.campaign_services add column if not exists book_id uuid;
alter table public.campaign_services drop constraint if exists campaign_services_workspace_id_book_id_fkey;
alter table public.campaign_services add constraint campaign_services_workspace_id_book_id_fkey
 foreign key(workspace_id,book_id) references public.books(workspace_id,id);
create index if not exists campaign_services_workspace_book_id on public.campaign_services(workspace_id,book_id);

drop function if exists public.mark_media_kit(uuid,uuid,text);
create function public.mark_media_kit(p_opportunity uuid,p_kit uuid,p_channel text,p_sent_at timestamptz default now()) returns void language plpgsql security invoker set search_path=public as $$
declare o public.opportunities; begin
 select * into o from opportunities where id=p_opportunity for update;
 if not found or not public.is_workspace_member(o.workspace_id) then raise exception 'Oportunidade não encontrada.'; end if;
 if not exists(select 1 from media_kits where id=p_kit and workspace_id=o.workspace_id) then raise exception 'Media kit inválido.'; end if;
 update opportunities set media_kit_sent_at=p_sent_at,media_kit_version_id=p_kit,
 status=case when status in ('new','contacted') then 'media_kit_sent' else status end where id=o.id;
 insert into communication_logs(workspace_id,opportunity_id,author_id,publisher_id,publisher_contact_id,channel,direction,responsible_user_id,contacted_at,summary)
 values(o.workspace_id,o.id,o.author_id,o.publisher_id,o.publisher_contact_id,p_channel,'outgoing',auth.uid(),p_sent_at,'Media kit enviado • '||(select name||' • '||year from media_kits where id=p_kit));
end $$;
revoke all on function public.mark_media_kit(uuid,uuid,text,timestamptz) from public;
grant execute on function public.mark_media_kit(uuid,uuid,text,timestamptz) to authenticated;

commit;
