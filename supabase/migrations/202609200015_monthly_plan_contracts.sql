begin;

-- A duração de um plano é definida no contrato, não no cadastro do pacote.
alter table public.opportunities add column if not exists service_package_id uuid;
alter table public.opportunities add column if not exists contract_duration_months integer check (contract_duration_months between 1 and 36);
alter table public.opportunities add column if not exists monthly_value numeric(12,2) check (monthly_value >= 0);
alter table public.opportunities add column if not exists selected_package_item_ids uuid[] not null default '{}';

alter table public.campaigns add column if not exists contract_duration_months integer check (contract_duration_months between 1 and 36);
alter table public.campaigns add column if not exists monthly_value numeric(12,2) check (monthly_value >= 0);
alter table public.campaigns add column if not exists selected_package_item_ids uuid[] not null default '{}';

alter table public.service_package_items add column if not exists choice_group text;
alter table public.campaign_services add column if not exists package_item_id uuid;

alter table public.opportunities
  add constraint opportunities_workspace_package_fkey
  foreign key (workspace_id, service_package_id)
  references public.service_packages(workspace_id, id);
alter table public.campaign_services
  add constraint campaign_services_workspace_package_item_fkey
  foreign key (workspace_id, package_item_id)
  references public.service_package_items(workspace_id, id);

create or replace function public.generate_campaign() returns trigger language plpgsql set search_path=public as $$
declare
  p public.service_packages;
  item record;
  sid uuid;
  half numeric;
  months integer;
begin
  if new.total_value > 0 then
    half := round(new.total_value / 2, 2);
    insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status)
    values(
      new.workspace_id,new.id,
      case when new.payment_plan = 'full_upfront' then 'Pagamento antecipado' else 'Sinal • 50%' end,
      1,
      case when new.payment_plan = 'full_upfront' then new.total_value else half end,
      new.start_date,
      'pending'
    );
    if new.payment_plan = 'half_and_half' then
      insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status)
      values(new.workspace_id,new.id,'Entrega • 50%',2,new.total_value-half,coalesce(new.end_date,new.start_date),'pending');
    end if;
  end if;

  if new.opportunity_id is not null then
    update opportunities set status = 'converted' where id = new.opportunity_id;
  end if;

  if new.service_package_id is not null then
    select * into p
    from service_packages
    where id = new.service_package_id and workspace_id = new.workspace_id;
    if not found or not p.active then
      raise exception 'Plano mensal inválido ou inativo.';
    end if;

    months := coalesce(new.contract_duration_months, p.duration_months);
    if months not between 1 and 36 then
      raise exception 'Informe entre 1 e 36 meses para o plano.';
    end if;

    if exists (
      select 1
      from unnest(new.selected_package_item_ids) selected_id
      where not exists (
        select 1 from service_package_items spi
        where spi.id = selected_id
          and spi.package_id = p.id
          and spi.workspace_id = new.workspace_id
      )
    ) then
      raise exception 'Um dos serviços selecionados não pertence a este plano.';
    end if;

    if cardinality(new.selected_package_item_ids) = 0 then
      raise exception 'Selecione ao menos um serviço incluído no plano.';
    end if;

    if exists (
      select 1
      from service_package_items spi
      where spi.id = any(new.selected_package_item_ids)
        and spi.choice_group is not null
      group by spi.choice_group
      having count(*) > 1
    ) then
      raise exception 'Escolha apenas uma opção por grupo de serviços alternativos.';
    end if;

    for item in
      select * from service_package_items
      where id = any(new.selected_package_item_ids)
      order by created_at
    loop
      insert into campaign_services(
        workspace_id,campaign_id,service_type_id,package_item_id,quantity,unit_price,notes
      ) values (
        new.workspace_id,new.id,item.service_type_id,item.id,
        item.quantity_per_month * months,0,'Incluso no plano mensal'
      ) returning id into sid;

      -- A equipe define cada publicação quando houver contexto operacional.
      update service_occurrences
      set scheduled_date = null, schedule_status = 'to_confirm'
      where campaign_service_id = sid;
    end loop;
  end if;
  return new;
end $$;

commit;
