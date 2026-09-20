begin;

-- Em campanhas avulsas, o valor contratado é a soma dos serviços escolhidos
-- na própria campanha. Planos mensais preservam o total contratual informado.
create or replace function public.sync_campaign_service_total()
returns trigger language plpgsql security invoker set search_path=public as $$
declare cid uuid; w uuid; begin
  cid:=case when TG_OP='DELETE' then old.campaign_id else new.campaign_id end;
  w:=case when TG_OP='DELETE' then old.workspace_id else new.workspace_id end;
  update public.campaigns c
  set total_value=coalesce((select sum(s.total_price) from public.campaign_services s where s.campaign_id=c.id and s.workspace_id=c.workspace_id and s.archived_at is null),0)
  where c.id=cid and c.workspace_id=w and c.service_package_id is null
    and not exists(select 1 from public.payments p where p.campaign_id=c.id);
  return null;
end $$;
drop trigger if exists campaign_service_total_sync on public.campaign_services;
create trigger campaign_service_total_sync
after insert or update of quantity,unit_price,archived_at or delete on public.campaign_services
for each row execute function public.sync_campaign_service_total();

-- Uma cobrança pendente registra a negociação, mas não libera a produção.
-- Somente um valor contratado positivo e o pagamento inicial confirmado ativam
-- a campanha automaticamente.
create or replace function public.sync_campaign_payment_state(p_campaign uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.campaigns; received numeric; expected numeric; begin
  select * into c from public.campaigns where id=p_campaign for update;
  if not found or c.status in ('draft','cancelled','completed') or c.payment_override_reason is not null then return; end if;
  if c.total_value<=0 then return; end if;
  expected:=case when c.payment_plan='full_upfront' then c.total_value else round(c.total_value/2,2) end;
  select coalesce(sum(amount),0) into received from public.payments
  where campaign_id=c.id and status='paid' and (c.payment_plan='full_upfront' or installment_number=1);
  if received>=expected then
    if c.status in ('awaiting_payment','paused') then update public.campaigns set status='active' where id=c.id; end if;
  elsif c.status='active' then
    update public.campaigns set status='paused' where id=c.id;
  end if;
end $$;

commit;
