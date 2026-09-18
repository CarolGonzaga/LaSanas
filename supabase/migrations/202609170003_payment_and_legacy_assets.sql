begin;
create or replace function public.recheck_initial_payment() returns trigger language plpgsql set search_path=public as $$
declare cid uuid; c public.campaigns; received numeric; expected numeric; begin
 cid:=case when TG_OP='DELETE' then old.campaign_id else new.campaign_id end;
 select * into c from campaigns where id=cid for update;
 if c.status='active' and c.payment_override_reason is null then
  expected:=case when c.payment_plan='full_upfront' then c.total_value else round(c.total_value/2,2) end;
  select coalesce(sum(amount),0) into received from payments where campaign_id=cid and status='paid' and (c.payment_plan='full_upfront' or installment_number=1);
  if received<expected then update campaigns set status='paused' where id=cid; end if;
 end if;
 return null;
end $$;
create trigger payment_recheck after update or delete on public.payments for each row execute function public.recheck_initial_payment();
-- Preserve materiais anteriores sem tornar o bucket legado público.
alter table public.client_assets add column storage_bucket text not null default 'business-assets' check(storage_bucket in ('business-assets','client-assets'));
do $$ begin if to_regclass('legacy_v1.client_assets') is not null then
 insert into public.client_assets(id,workspace_id,campaign_id,author_id,service_occurrence_id,title,description,asset_type,storage_path,external_url,original_filename,mime_type,size_bytes,storage_bucket)
 select a.id,a.owner_id,a.campaign_id,a.client_id,a.service_occurrence_id,a.title,a.description,a.asset_type::text,a.storage_path,a.external_url,a.original_filename,a.mime_type,a.size_bytes,'client-assets'
 from legacy_v1.client_assets a where a.campaign_id is not null;
 end if; end $$;
drop policy if exists "Assets privados por proprietário" on storage.objects;
create policy legacy_business_files on storage.objects for all to authenticated
 using(bucket_id='client-assets' and exists(select 1 from public.workspace_members where user_id=auth.uid() and active and workspace_id::text=(storage.foldername(name))[1]))
 with check(bucket_id='client-assets' and exists(select 1 from public.workspace_members where user_id=auth.uid() and active and workspace_id::text=(storage.foldername(name))[1]));
commit;

