begin;

-- Mensalidades pagas liberam os próximos blocos da fila, mesmo fora de ordem.
create or replace function public.sync_monthly_production(p_service uuid)
returns void language plpgsql security definer set search_path=public as $$
declare item public.opportunity_services; paid_months integer;
begin
 select * into item from opportunity_services where id=p_service for update;
 if not found or item.item_kind<>'package' then return; end if;
 select count(distinct billing_cycle) into paid_months from payments
 where opportunity_service_id=item.id and status='paid' and billing_cycle between 1 and item.duration_months;
 update service_occurrences set released_at=case
   when billing_cycle<=paid_months then coalesce(released_at,now())
   else null end
 where opportunity_service_id=item.id;
 if paid_months>0 then
   update opportunities set status='in_production' where id=item.opportunity_id and status not in ('delivered','lost','cancelled');
 end if;
end $$;
revoke all on function public.sync_monthly_production(uuid) from public;

create or replace function public.release_paid_production() returns trigger language plpgsql security definer set search_path=public as $$
declare item public.opportunity_services;
begin
 select * into item from opportunity_services where id=case when TG_OP='DELETE' then old.opportunity_service_id else new.opportunity_service_id end;
 if item.item_kind='package' then
   perform public.sync_monthly_production(item.id);
 elsif TG_OP='UPDATE' then
   if new.status='paid' and old.status is distinct from 'paid' and new.installment_number=1 then
     update service_occurrences set released_at=coalesce(released_at,now()) where opportunity_service_id=item.id;
     update opportunities set status='in_production' where id=item.opportunity_id and status not in ('delivered','lost','cancelled');
   end if;
 end if;
 if TG_OP='UPDATE' and old.opportunity_service_id is distinct from new.opportunity_service_id then
   perform public.sync_monthly_production(old.opportunity_service_id);
 end if;
 return coalesce(new,old);
end $$;
drop trigger release_paid_production on public.payments;
create trigger release_paid_production after insert or update or delete on public.payments
for each row execute function public.release_paid_production();

-- Reconciliar a liberação existente sem recriar execuções ou alterar sua posição.
do $$ declare item record; begin
 for item in select id from public.opportunity_services where item_kind='package' loop
   perform public.sync_monthly_production(item.id);
 end loop;
end $$;
commit;
