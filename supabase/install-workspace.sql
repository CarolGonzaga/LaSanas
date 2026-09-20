-- Execute este arquivo UMA VEZ no SQL Editor do Supabase.
-- Funciona em projeto novo ou com a primeira versão instalada.
-- Depois execute setup-workspace.sql com os e-mails das duas integrantes.

-- 202609170001_shared_workspace.sql
-- Atualização sem exclusão: as tabelas anteriores são preservadas em legacy_v1.
begin;
create extension if not exists pgcrypto;
create schema if not exists legacy_v1;
revoke all on schema legacy_v1 from public, anon, authenticated;
do $$ declare t text; begin
 foreach t in array array['clients','service_types','campaigns','campaign_services','service_occurrences','payments','client_assets','tasks'] loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='owner_id') then
   execute format('alter table public.%I set schema legacy_v1',t);
  end if;
 end loop;
end $$;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null default '',email text not null,avatar_url text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.workspace_members(workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,role text not null default 'member' check(role in ('admin','member')),active boolean not null default true,created_at timestamptz not null default now(),primary key(workspace_id,user_id));
create or replace function public.is_workspace_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=(select auth.uid()) and active); $$;
create or replace function public.is_workspace_admin(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=(select auth.uid()) and active and role='admin'); $$;
revoke all on function public.is_workspace_member(uuid),public.is_workspace_admin(uuid) from public;
grant execute on function public.is_workspace_member(uuid),public.is_workspace_admin(uuid) to authenticated;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.workspace_members m where m.user_id=profiles.id and public.is_workspace_member(m.workspace_id)));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy workspace_read on public.workspaces for select to authenticated using(public.is_workspace_member(id));
create policy members_read on public.workspace_members for select to authenticated using(public.is_workspace_member(workspace_id));
create or replace function public.sync_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name','')) on conflict(id) do update set email=excluded.email; return new; end $$;
create trigger profile_created after insert or update of email on auth.users for each row execute function public.sync_profile();
insert into public.profiles(id,email,full_name) select id,coalesce(email,''),coalesce(raw_user_meta_data->>'full_name','') from auth.users;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table public.authors(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 pen_name text,
 email text,
 whatsapp text,
 instagram text,
 x_twitter text,
 preferred_contact_channel text check (preferred_contact_channel in ('email','whatsapp','instagram','x_twitter','other')),
 website text,
 notes text
);

create table public.publishers(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 website text,
 instagram text,
 notes text
);

create table public.publisher_contacts(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 publisher_id uuid not null,
 name text not null,
 role_or_department text,
 email text,
 whatsapp text,
 instagram text,
 x_twitter text,
 preferred_contact_channel text check (preferred_contact_channel in ('email','whatsapp','instagram','x_twitter','other')),
 last_contact_at timestamptz,
 notes text
);

create table public.books(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 title text not null,
 subtitle text,
 author_id uuid not null,
 publisher_id uuid,
 isbn text,
 release_date date,
 synopsis text,
 genres text,
 representations text,
 page_count integer check (page_count>0),
 purchase_url text,
 publisher_url text,
 author_url text,
 author_instagram text,
 cover_external_url text,
 cover_ai_status text not null check (cover_ai_status in ('unknown','confirmed_human','confirmed_ai','replaced')),
 ai_cover_policy_informed_at timestamptz,
 ai_cover_policy_acknowledged_at timestamptz,
 cover_replacement_notes text,
 additional_fields text,
 notes text,
 cover_storage_path text
);

create table public.opportunities(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 contact_type text not null check (contact_type in ('author','publisher')),
 author_id uuid,
 publisher_id uuid,
 publisher_contact_id uuid,
 book_id uuid,
 source_channel text not null check (source_channel in ('email','whatsapp','instagram','x_twitter','other')),
 responsible_user_id uuid not null,
 status text not null check (status in ('new','contacted','media_kit_sent','waiting_book_data','proposal_requested','proposal_sent','negotiating','approved','lost','converted')),
 first_contact_at timestamptz,
 last_contact_at timestamptz,
 next_follow_up_at timestamptz,
 media_kit_version_id uuid,
 book_data_collected boolean default false,
 ai_cover_policy_informed boolean default false,
 ai_cover_policy_accepted_at timestamptz,
 proposal_type text not null check (proposal_type in ('media_kit','custom','loyalty')),
 estimated_value numeric(12,2) check (estimated_value>=0),
 proposal_items text,
 notes text,
 media_kit_sent_at timestamptz,
 check(author_id is not null or publisher_id is not null)
);

create table public.communication_logs(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 opportunity_id uuid,
 author_id uuid,
 publisher_id uuid,
 publisher_contact_id uuid,
 campaign_id uuid,
 channel text not null check (channel in ('email','whatsapp','instagram','x_twitter','other')),
 direction text not null check (direction in ('incoming','outgoing')),
 responsible_user_id uuid not null,
 contacted_at timestamptz not null,
 summary text not null,
 next_follow_up_at timestamptz
);

create table public.media_kits(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 version text not null,
 description text,
 external_url text,
 active boolean default true,
 storage_path text,
 original_filename text,
 mime_type text,
 size_bytes bigint
);

create table public.service_types(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 description text,
 default_price numeric(12,2) not null check (default_price>=0),
 active boolean default true
);

create table public.service_packages(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 description text,
 duration_months integer not null check (duration_months>0),
 regular_price numeric(12,2) check (regular_price>=0),
 package_price numeric(12,2) not null check (package_price>=0),
 active boolean default true
);

create table public.service_package_items(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 package_id uuid not null,
 service_type_id uuid not null,
 quantity_per_month integer not null check (quantity_per_month>0),
 notes text,
 unique(package_id,service_type_id)
);

create table public.campaigns(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 name text not null,
 opportunity_id uuid,
 author_id uuid,
 publisher_id uuid,
 book_id uuid,
 responsible_user_id uuid,
 campaign_type text not null check (campaign_type in ('advertising','custom','collective_reading','book_club','other')),
 proposal_type text not null check (proposal_type in ('media_kit','custom','loyalty')),
 service_package_id uuid,
 start_date date not null,
 end_date date,
 total_value numeric(12,2) not null check (total_value>=0),
 payment_plan text not null check (payment_plan in ('full_upfront','half_and_half')),
 status text not null check (status in ('draft','awaiting_payment','active','paused','completed','cancelled')),
 notes text,
 payment_override_reason text,
 payment_override_by uuid references public.profiles(id),
 payment_override_at timestamptz,
 check(end_date is null or end_date>=start_date),
 unique(workspace_id,opportunity_id),
 check(author_id is not null or publisher_id is not null)
);

create table public.campaign_services(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 campaign_id uuid not null,
 service_type_id uuid,
 custom_name text,
 description text,
 quantity integer not null check (quantity>0),
 unit_price numeric(12,2) not null check (unit_price>=0),
 notes text,
 total_price numeric(12,2) generated always as (quantity * unit_price) stored,
 check(service_type_id is not null or nullif(trim(custom_name),'') is not null)
);

create table public.service_occurrences(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 campaign_service_id uuid not null,
 sequence_number integer not null check (sequence_number>0),
 scheduled_date date,
 scheduled_time time,
 schedule_status text not null default 'to_confirm' check (schedule_status in ('to_confirm','scheduled')),
 status text not null check (status in ('pending','completed','cancelled')),
 notes text,
 completed_at timestamptz,
 unique(campaign_service_id,sequence_number)
);

create table public.payments(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 campaign_id uuid not null,
 description text not null,
 installment_number integer not null check (installment_number>0),
 amount numeric(12,2) not null check (amount>=0),
 due_date date not null,
 status text not null check (status in ('pending','paid','cancelled')),
 paid_at timestamptz,
 payment_method text check (payment_method in ('pix','credit_card','debit_card','bank_transfer','cash','other')),
 payment_method_custom text,
 notes text,
 unique(campaign_id,installment_number),
 check(amount>0)
);

create table public.collective_reading_slots(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 year integer not null check (year>0),
 month integer not null check(month between 1 and 12),
 status text not null check (status in ('available','prospecting','reserved','confirmed','completed','cancelled')),
 author_id uuid,
 book_id uuid,
 campaign_id uuid,
 contact_started_at timestamptz,
 confirmed_at timestamptz,
 announcement_published_at timestamptz,
 announcement_channel text check (announcement_channel in ('email','whatsapp','instagram','x_twitter','other')),
 notes text,
 unique(workspace_id,year,month)
);

create table public.book_club_slots(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 year integer not null check (year>0),
 month integer not null check(month between 1 and 12),
 status text not null check (status in ('planning','book_selected','publisher_contact_pending','publisher_contacted','negotiating','confirmed','completed','cancelled')),
 book_id uuid,
 publisher_id uuid,
 publisher_contact_id uuid,
 responsible_user_id uuid,
 contact_started_at timestamptz,
 proposal_sent_at timestamptz,
 confirmed_at timestamptz,
 campaign_id uuid,
 notes text,
 unique(workspace_id,year,month)
);

create table public.tasks(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 title text not null,
 description text,
 assigned_to uuid,
 due_date date not null,
 due_time time,
 priority text not null check (priority in ('medium','high','low')),
 status text not null check (status in ('pending','completed')),
 related_opportunity_id uuid,
 related_campaign_id uuid,
 completed_at timestamptz
);

create table public.response_templates(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 title text not null,
 category text not null check (category in ('Media Kit','Primeiro Contato','Follow-up','Orçamento','Pagamento','Dados do Livro','Política sobre IA','Leitura Coletiva','Clube do Livro','Agradecimento','Outro')),
 channel text not null check (channel in ('all','email','whatsapp','instagram','x_twitter')),
 content text not null,
 active boolean default true,
 created_by uuid not null default auth.uid() references public.profiles(id)
);

create table public.client_assets(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 campaign_id uuid not null,
 author_id uuid,
 publisher_id uuid,
 book_id uuid,
 service_occurrence_id uuid,
 title text not null,
 description text,
 asset_type text not null check (asset_type in ('link','image','document')),
 external_url text,
 storage_path text,
 original_filename text,
 mime_type text,
 size_bytes bigint
);

create table public.channel_assignments(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(workspace_id,id),
 channel text not null check (channel in ('email','whatsapp','instagram','x_twitter','other')),
 responsible_user_id uuid not null,
 unique(workspace_id,channel)
);
alter table public.publisher_contacts add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.publisher_contacts(workspace_id,publisher_id);
alter table public.books add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
create index on public.books(workspace_id,author_id);
alter table public.books add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.books(workspace_id,publisher_id);
alter table public.opportunities add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
create index on public.opportunities(workspace_id,author_id);
alter table public.opportunities add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.opportunities(workspace_id,publisher_id);
alter table public.opportunities add foreign key(workspace_id,publisher_contact_id) references public.publisher_contacts(workspace_id,id);
create index on public.opportunities(workspace_id,publisher_contact_id);
alter table public.opportunities add foreign key(workspace_id,book_id) references public.books(workspace_id,id);
create index on public.opportunities(workspace_id,book_id);
alter table public.opportunities add foreign key(workspace_id,responsible_user_id) references public.workspace_members(workspace_id,user_id);
create index on public.opportunities(workspace_id,responsible_user_id);
alter table public.opportunities add foreign key(workspace_id,media_kit_version_id) references public.media_kits(workspace_id,id);
create index on public.opportunities(workspace_id,media_kit_version_id);
alter table public.communication_logs add foreign key(workspace_id,opportunity_id) references public.opportunities(workspace_id,id);
create index on public.communication_logs(workspace_id,opportunity_id);
alter table public.communication_logs add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
create index on public.communication_logs(workspace_id,author_id);
alter table public.communication_logs add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.communication_logs(workspace_id,publisher_id);
alter table public.communication_logs add foreign key(workspace_id,publisher_contact_id) references public.publisher_contacts(workspace_id,id);
create index on public.communication_logs(workspace_id,publisher_contact_id);
alter table public.communication_logs add foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id);
create index on public.communication_logs(workspace_id,campaign_id);
alter table public.communication_logs add foreign key(workspace_id,responsible_user_id) references public.workspace_members(workspace_id,user_id);
create index on public.communication_logs(workspace_id,responsible_user_id);
alter table public.service_package_items add foreign key(workspace_id,package_id) references public.service_packages(workspace_id,id);
create index on public.service_package_items(workspace_id,package_id);
alter table public.service_package_items add foreign key(workspace_id,service_type_id) references public.service_types(workspace_id,id);
create index on public.service_package_items(workspace_id,service_type_id);
alter table public.campaigns add foreign key(workspace_id,opportunity_id) references public.opportunities(workspace_id,id);
create index on public.campaigns(workspace_id,opportunity_id);
alter table public.campaigns add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
create index on public.campaigns(workspace_id,author_id);
alter table public.campaigns add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.campaigns(workspace_id,publisher_id);
alter table public.campaigns add foreign key(workspace_id,book_id) references public.books(workspace_id,id);
create index on public.campaigns(workspace_id,book_id);
alter table public.campaigns add foreign key(workspace_id,responsible_user_id) references public.workspace_members(workspace_id,user_id);
create index on public.campaigns(workspace_id,responsible_user_id);
alter table public.campaigns add foreign key(workspace_id,service_package_id) references public.service_packages(workspace_id,id);
create index on public.campaigns(workspace_id,service_package_id);
alter table public.campaign_services add foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id);
create index on public.campaign_services(workspace_id,campaign_id);
alter table public.campaign_services add foreign key(workspace_id,service_type_id) references public.service_types(workspace_id,id);
create index on public.campaign_services(workspace_id,service_type_id);
alter table public.service_occurrences add foreign key(workspace_id,campaign_service_id) references public.campaign_services(workspace_id,id);
create index on public.service_occurrences(workspace_id,campaign_service_id);
alter table public.payments add foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id);
create index on public.payments(workspace_id,campaign_id);
alter table public.collective_reading_slots add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
create index on public.collective_reading_slots(workspace_id,author_id);
alter table public.collective_reading_slots add foreign key(workspace_id,book_id) references public.books(workspace_id,id);
create index on public.collective_reading_slots(workspace_id,book_id);
alter table public.collective_reading_slots add foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id);
create index on public.collective_reading_slots(workspace_id,campaign_id);
alter table public.book_club_slots add foreign key(workspace_id,book_id) references public.books(workspace_id,id);
create index on public.book_club_slots(workspace_id,book_id);
alter table public.book_club_slots add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.book_club_slots(workspace_id,publisher_id);
alter table public.book_club_slots add foreign key(workspace_id,publisher_contact_id) references public.publisher_contacts(workspace_id,id);
create index on public.book_club_slots(workspace_id,publisher_contact_id);
alter table public.book_club_slots add foreign key(workspace_id,responsible_user_id) references public.workspace_members(workspace_id,user_id);
create index on public.book_club_slots(workspace_id,responsible_user_id);
alter table public.book_club_slots add foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id);
create index on public.book_club_slots(workspace_id,campaign_id);
alter table public.tasks add foreign key(workspace_id,assigned_to) references public.workspace_members(workspace_id,user_id);
create index on public.tasks(workspace_id,assigned_to);
alter table public.tasks add foreign key(workspace_id,related_opportunity_id) references public.opportunities(workspace_id,id);
create index on public.tasks(workspace_id,related_opportunity_id);
alter table public.tasks add foreign key(workspace_id,related_campaign_id) references public.campaigns(workspace_id,id);
create index on public.tasks(workspace_id,related_campaign_id);
alter table public.client_assets add foreign key(workspace_id,campaign_id) references public.campaigns(workspace_id,id);
create index on public.client_assets(workspace_id,campaign_id);
alter table public.client_assets add foreign key(workspace_id,author_id) references public.authors(workspace_id,id);
create index on public.client_assets(workspace_id,author_id);
alter table public.client_assets add foreign key(workspace_id,publisher_id) references public.publishers(workspace_id,id);
create index on public.client_assets(workspace_id,publisher_id);
alter table public.client_assets add foreign key(workspace_id,book_id) references public.books(workspace_id,id);
create index on public.client_assets(workspace_id,book_id);
alter table public.client_assets add foreign key(workspace_id,service_occurrence_id) references public.service_occurrences(workspace_id,id);
create index on public.client_assets(workspace_id,service_occurrence_id);
alter table public.channel_assignments add foreign key(workspace_id,responsible_user_id) references public.workspace_members(workspace_id,user_id);
create index on public.channel_assignments(workspace_id,responsible_user_id);

do $$ declare t text; begin foreach t in array array['authors','publishers','publisher_contacts','books','opportunities','communication_logs','media_kits','service_types','service_packages','service_package_items','campaigns','campaign_services','service_occurrences','payments','collective_reading_slots','book_club_slots','tasks','response_templates','client_assets','channel_assignments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy workspace_access on public.%I for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id))',t);
 execute format('create trigger updated before update on public.%I for each row execute function public.set_updated_at()',t);
 execute format('create index on public.%I(workspace_id,created_at)',t);
end loop; end $$;
create unique index one_active_kit on public.media_kits(workspace_id) where active=true;
create index on public.opportunities(workspace_id,status,next_follow_up_at);
create index on public.service_occurrences(workspace_id,status,scheduled_date);
create index on public.payments(workspace_id,status,due_date);
create index on public.tasks(workspace_id,status,due_date);
-- Leitura dos dados anteriores, mantendo os identificadores e um workspace por proprietário.
do $$ begin if to_regclass('legacy_v1.clients') is not null then
 insert into public.workspaces(id,name) select id,'Negócio • '||email from auth.users where id in (
  select owner_id from legacy_v1.clients union select owner_id from legacy_v1.service_types union select owner_id from legacy_v1.campaigns union select owner_id from legacy_v1.tasks
 );
 insert into public.workspace_members(workspace_id,user_id,role) select id,id,'admin' from public.workspaces;
 insert into public.authors(id,workspace_id,name,pen_name,email,whatsapp,instagram,notes,archived_at)
 select id,owner_id,name,professional_name,email,phone,instagram,notes,archived_at from legacy_v1.clients;
 insert into public.service_types(id,workspace_id,name,description,default_price,active)
 select id,owner_id,name,description,default_price,active from legacy_v1.service_types;
 insert into public.campaigns(id,workspace_id,author_id,name,campaign_type,proposal_type,start_date,end_date,total_value,status,payment_plan,notes)
 select id,owner_id,client_id,title,'advertising','media_kit',coalesce(start_date,created_at::date),end_date,total_value,
 case when status::text='active' then 'paused' else status::text end,'full_upfront',notes from legacy_v1.campaigns;
 insert into public.campaign_services(id,workspace_id,campaign_id,service_type_id,description,quantity,unit_price,notes)
 select id,owner_id,campaign_id,service_type_id,description,quantity,unit_price,notes from legacy_v1.campaign_services;
 insert into public.service_occurrences(id,workspace_id,campaign_service_id,sequence_number,scheduled_date,scheduled_time,status,completed_at,notes)
 select id,owner_id,campaign_service_id,sequence_number,scheduled_date,scheduled_time,status::text,completed_at,notes from legacy_v1.service_occurrences;
 insert into public.payments(id,workspace_id,campaign_id,description,installment_number,amount,due_date,paid_at,payment_method,payment_method_custom,status,notes)
 select id,owner_id,campaign_id,description,row_number() over(partition by campaign_id order by created_at),amount,coalesce(due_date,created_at::date),paid_at,payment_method::text,payment_method_custom,status::text,notes from legacy_v1.payments where campaign_id is not null;
 insert into public.tasks(id,workspace_id,title,description,due_date,due_time,priority,status,completed_at)
 select id,owner_id,title,description,coalesce(due_date,created_at::date),due_time,priority::text,status::text,completed_at from legacy_v1.tasks;
 end if; end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('business-assets','business-assets',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do update set public=false;
create policy business_files on storage.objects for all to authenticated
 using(bucket_id='business-assets' and exists(select 1 from public.workspace_members where user_id=auth.uid() and active and workspace_id::text=(storage.foldername(name))[1]))
 with check(bucket_id='business-assets' and exists(select 1 from public.workspace_members where user_id=auth.uid() and active and workspace_id::text=(storage.foldername(name))[1]));
grant select,insert,update,delete on all tables in schema public to authenticated;
commit;

-- Atualização de instalações novas: a produção é liberada pelo pagamento inicial.
create or replace function public.sync_campaign_payment_state(p_campaign uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.campaigns; received numeric; expected numeric; begin
 select * into c from public.campaigns where id=p_campaign for update; if not found or c.status in ('draft','cancelled','completed') or c.payment_override_reason is not null then return; end if;
 expected:=case when c.payment_plan='full_upfront' then c.total_value else round(c.total_value/2,2) end;
 select coalesce(sum(amount),0) into received from public.payments where campaign_id=c.id and status='paid' and (c.payment_plan='full_upfront' or installment_number=1);
 if received>=expected then if c.status in ('awaiting_payment','paused') then update public.campaigns set status='active' where id=c.id; end if;
 elsif c.status='active' then update public.campaigns set status='paused' where id=c.id; end if;
end $$;
create or replace function public.sync_campaign_payment_state_trigger() returns trigger language plpgsql security invoker set search_path=public as $$ begin perform public.sync_campaign_payment_state(case when TG_OP='DELETE' then old.campaign_id else new.campaign_id end); return null; end $$;
drop trigger if exists payment_recheck on public.payments;
drop trigger if exists payment_sync_campaign_state on public.payments;
create trigger payment_sync_campaign_state after insert or update or delete on public.payments for each row execute function public.sync_campaign_payment_state_trigger();


-- 202609170002_business_rules.sql
begin;
create or replace function public.business_rules() returns trigger language plpgsql set search_path=public as $$
declare v_book public.books; v_op public.opportunities; v_campaign public.campaigns; v_initial numeric; v_paid numeric; v_expected uuid; v_field text; v_user uuid;
begin
 if TG_OP='UPDATE' and new.workspace_id<>old.workspace_id then raise exception 'Não é permitido mover registros entre workspaces.'; end if;
 foreach v_field in array array['responsible_user_id','assigned_to'] loop
  v_user:=nullif(to_jsonb(new)->>v_field,'')::uuid;
  if v_user is not null and not exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=v_user and active) then raise exception 'Responsável não é integrante ativa deste workspace.'; end if;
 end loop;
 if TG_TABLE_NAME='opportunities' then
  if new.responsible_user_id is null then select responsible_user_id into new.responsible_user_id from channel_assignments where workspace_id=new.workspace_id and channel=new.source_channel; end if;
  if new.responsible_user_id is null then raise exception 'Configure uma responsável para este canal ou selecione manualmente.'; end if;
  if not exists(select 1 from workspace_members where workspace_id=new.workspace_id and user_id=new.responsible_user_id and active) then raise exception 'Responsável inativa.'; end if;
 end if;
 if TG_TABLE_NAME='communication_logs' and TG_OP='INSERT' then
  if new.opportunity_id is not null then
   select * into v_op from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id;
   new.author_id:=v_op.author_id; new.publisher_id:=v_op.publisher_id; new.publisher_contact_id:=coalesce(new.publisher_contact_id,v_op.publisher_contact_id);
  elsif new.campaign_id is not null then
   select * into v_campaign from campaigns where id=new.campaign_id and workspace_id=new.workspace_id;
   new.author_id:=v_campaign.author_id; new.publisher_id:=v_campaign.publisher_id;
  end if;
 end if;
 if TG_TABLE_NAME='books' then
  if new.cover_ai_status not in ('confirmed_human','replaced') and exists(select 1 from campaigns where book_id=new.id and status='active') then raise exception 'Pause as campanhas deste livro antes de alterar a origem da capa.'; end if;
 end if;
 if TG_TABLE_NAME in ('campaigns','opportunities','collective_reading_slots','book_club_slots') then
  if new.book_id is not null then
   select * into v_book from books where id=new.book_id and workspace_id=new.workspace_id;
   if not found then raise exception 'Livro inválido.'; end if;
   if TG_TABLE_NAME='book_club_slots' then
    if new.publisher_id is null then new.publisher_id:=v_book.publisher_id; end if;
   end if;
   if (to_jsonb(new)->>'author_id') is not null and (to_jsonb(new)->>'author_id')::uuid<>v_book.author_id then raise exception 'O livro não pertence à autora selecionada.'; end if;
   if (to_jsonb(new)->>'publisher_id') is not null and (to_jsonb(new)->>'publisher_id')::uuid is distinct from v_book.publisher_id then raise exception 'O livro não pertence à editora selecionada.'; end if;
  end if;
 end if;
 if TG_TABLE_NAME in ('opportunities','book_club_slots','communication_logs') then
  if new.publisher_contact_id is not null then
   select publisher_id into v_expected from publisher_contacts where id=new.publisher_contact_id and workspace_id=new.workspace_id;
   if new.publisher_id is distinct from v_expected then raise exception 'O contato não pertence à editora.'; end if;
  end if;
 end if;
 if TG_TABLE_NAME='campaigns' then
  if TG_OP='INSERT' and new.opportunity_id is not null then
   select * into v_op from opportunities where id=new.opportunity_id and workspace_id=new.workspace_id for update;
   if v_op.status<>'approved' then raise exception 'A oportunidade precisa estar aprovada.'; end if;
   if new.author_id is distinct from v_op.author_id or new.publisher_id is distinct from v_op.publisher_id or new.book_id is distinct from v_op.book_id then raise exception 'A campanha deve manter os vínculos da oportunidade.'; end if;
  end if;
  if TG_OP='UPDATE' and (new.total_value<>old.total_value or new.payment_plan<>old.payment_plan or new.service_package_id is distinct from old.service_package_id) then raise exception 'Valor, plano e pacote contratados são imutáveis. Ajuste a proposta antes de converter.'; end if;
  if new.status='active' then
   if new.book_id is not null and v_book.cover_ai_status not in ('confirmed_human','replaced') then raise exception 'Confirme uma capa sem IA ou registre sua substituição antes de iniciar a produção.'; end if;
   v_initial:=case when new.payment_plan='full_upfront' then new.total_value else round(new.total_value/2,2) end;
   select coalesce(sum(amount),0) into v_paid from payments where campaign_id=new.id and workspace_id=new.workspace_id and status='paid' and (new.payment_plan='full_upfront' or installment_number=1);
   if v_paid<v_initial and nullif(trim(new.payment_override_reason),'') is null then raise exception 'Pagamento inicial ainda não confirmado.'; end if;
  end if;
  if TG_OP='INSERT' then
   if new.payment_override_reason is not null or new.payment_override_by is not null or new.payment_override_at is not null then raise exception 'A exceção deve ser registrada após criar a campanha.'; end if;
  elsif new.payment_override_reason is distinct from old.payment_override_reason then
   if not is_workspace_admin(new.workspace_id) then raise exception 'Somente administradoras podem autorizar uma exceção.'; end if;
   if length(trim(coalesce(new.payment_override_reason,'')))<10 then raise exception 'Informe uma justificativa com pelo menos 10 caracteres.'; end if;
   new.payment_override_by:=auth.uid(); new.payment_override_at:=now();
  elsif new.payment_override_by is distinct from old.payment_override_by or new.payment_override_at is distinct from old.payment_override_at then
   raise exception 'Os dados de auditoria da exceção não podem ser alterados.';
  end if;
 end if;
 if TG_TABLE_NAME='payments' then
  if new.status='paid' then
   if new.payment_method is null or new.paid_at is null then raise exception 'Informe data real e forma de recebimento.'; end if;
   if new.payment_method='other' and nullif(trim(new.payment_method_custom),'') is null then raise exception 'Informe a outra forma de pagamento.'; end if;
  else new.paid_at:=null; end if;
 end if;
 if TG_TABLE_NAME in ('tasks','service_occurrences') then
  new.completed_at:=case when new.status='completed' then coalesce(new.completed_at,now()) else null end;
 end if;
 if TG_TABLE_NAME='service_occurrences' then
  if new.status='completed' and not exists(select 1 from campaign_services s join campaigns c on c.id=s.campaign_id where s.id=new.campaign_service_id and c.status in ('active','completed')) then raise exception 'Libere a campanha para produção antes de concluir o serviço.'; end if;
 end if;
 if TG_TABLE_NAME='client_assets' then
  select * into v_campaign from campaigns where id=new.campaign_id and workspace_id=new.workspace_id;
  if new.author_id is not null and new.author_id is distinct from v_campaign.author_id then raise exception 'Autora não corresponde à campanha.'; end if;
  if new.publisher_id is not null and new.publisher_id is distinct from v_campaign.publisher_id then raise exception 'Editora não corresponde à campanha.'; end if;
  if new.book_id is not null and new.book_id is distinct from v_campaign.book_id then raise exception 'Livro não corresponde à campanha.'; end if;
  if new.service_occurrence_id is not null and not exists(select 1 from service_occurrences o join campaign_services s on s.id=o.campaign_service_id where o.id=new.service_occurrence_id and s.campaign_id=new.campaign_id) then raise exception 'Execução não corresponde à campanha.'; end if;
  if new.asset_type='link' and new.external_url is null then raise exception 'Informe o link.'; end if;
  if new.asset_type<>'link' and new.storage_path is null then raise exception 'Envie o arquivo.'; end if;
 end if;
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['authors','publishers','publisher_contacts','books','opportunities','communication_logs','media_kits','service_types','service_packages','service_package_items','campaigns','campaign_services','service_occurrences','payments','collective_reading_slots','book_club_slots','tasks','response_templates','client_assets','channel_assignments'] loop execute format('create trigger validate_business before insert or update on public.%I for each row execute function public.business_rules()',t); end loop; end $$;
create or replace function public.sync_occurrences() returns trigger language plpgsql set search_path=public as $$
begin
 if new.quantity>600 then raise exception 'O limite é 600 execuções por serviço.'; end if;
 if TG_OP='UPDATE' and new.quantity<old.quantity then
  if exists(select 1 from service_occurrences where campaign_service_id=new.id and sequence_number>new.quantity and status='completed') then raise exception 'Não é possível remover execuções concluídas.'; end if;
  if current_setting('app.confirm_resize',true) is distinct from 'yes' then raise exception 'Confirme a remoção das execuções pendentes.'; end if;
  delete from service_occurrences where campaign_service_id=new.id and sequence_number>new.quantity;
 end if;
 insert into service_occurrences(workspace_id,campaign_service_id,sequence_number,status)
 select new.workspace_id,new.id,n,'pending' from generate_series(1,new.quantity) n on conflict(campaign_service_id,sequence_number) do nothing;
 return new;
end $$;
create trigger generate_occurrences after insert or update of quantity on public.campaign_services for each row execute function public.sync_occurrences();
create or replace function public.resize_service(p_id uuid,p_quantity integer) returns void language plpgsql security invoker set search_path=public as $$ begin
 perform set_config('app.confirm_resize','yes',true);
 update campaign_services set quantity=p_quantity where id=p_id;
 if not found then raise exception 'Serviço não encontrado.'; end if;
end $$;
create or replace function public.generate_campaign() returns trigger language plpgsql set search_path=public as $$
declare p public.service_packages; item record; sid uuid; half numeric; begin
 if new.total_value>0 then
  half:=round(new.total_value/2,2);
  insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status)
  values(new.workspace_id,new.id,case when new.payment_plan='full_upfront' then 'Pagamento antecipado' else 'Sinal • 50%' end,1,case when new.payment_plan='full_upfront' then new.total_value else half end,new.start_date,'pending');
  if new.payment_plan='half_and_half' then
   insert into payments(workspace_id,campaign_id,description,installment_number,amount,due_date,status)
   values(new.workspace_id,new.id,'Entrega • 50%',2,new.total_value-half,coalesce(new.end_date,new.start_date),'pending');
  end if;
 end if;
 if new.opportunity_id is not null then update opportunities set status='converted' where id=new.opportunity_id; end if;
 if new.service_package_id is not null then
  select * into p from service_packages where id=new.service_package_id;
  if not p.active or p.duration_months>36 then raise exception 'Pacote inativo ou duração acima de 36 meses.'; end if;
  if not exists(select 1 from service_package_items where package_id=p.id) then raise exception 'Adicione os itens ao pacote antes de contratar.'; end if;
  for item in select * from service_package_items where package_id=p.id loop
   insert into campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes)
   values(new.workspace_id,new.id,item.service_type_id,item.quantity_per_month*p.duration_months,0,'Incluso no pacote contratado') returning id into sid;
   update service_occurrences set scheduled_date=(new.start_date+make_interval(months=>((sequence_number-1)/item.quantity_per_month)))::date where campaign_service_id=sid;
  end loop;
 end if;
 return new;
end $$;
create trigger generate_campaign_data after insert on public.campaigns for each row execute function public.generate_campaign();
create or replace function public.log_contact() returns trigger language plpgsql set search_path=public as $$ begin
 if new.opportunity_id is not null then update opportunities set last_contact_at=greatest(last_contact_at,new.contacted_at),next_follow_up_at=new.next_follow_up_at,status=case when status='new' then 'contacted' else status end where id=new.opportunity_id; end if;
 if new.publisher_contact_id is not null then update publisher_contacts set last_contact_at=greatest(last_contact_at,new.contacted_at) where id=new.publisher_contact_id; end if;
 return new; end $$;
create trigger contact_history after insert on public.communication_logs for each row execute function public.log_contact();
create or replace function public.mark_media_kit(p_opportunity uuid,p_kit uuid,p_channel text) returns void language plpgsql security invoker set search_path=public as $$
declare o public.opportunities; begin
 select * into o from opportunities where id=p_opportunity for update;
 if not found then raise exception 'Oportunidade não encontrada.'; end if;
 if not exists(select 1 from media_kits where id=p_kit and workspace_id=o.workspace_id) then raise exception 'Media kit inválido.'; end if;
 update opportunities set status='media_kit_sent',media_kit_sent_at=now(),media_kit_version_id=p_kit where id=o.id;
 insert into communication_logs(workspace_id,opportunity_id,author_id,publisher_id,publisher_contact_id,channel,direction,responsible_user_id,contacted_at,summary)
 values(o.workspace_id,o.id,o.author_id,o.publisher_id,o.publisher_contact_id,p_channel,'outgoing',auth.uid(),now(),'Media kit enviado • versão '||(select version from media_kits where id=p_kit));
end $$;
create or replace function public.activate_kit(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare w uuid; begin select workspace_id into w from media_kits where id=p_id; perform pg_advisory_xact_lock(hashtext(w::text)); update media_kits set active=false where workspace_id=w and active; update media_kits set active=true where id=p_id; end $$;
revoke all on function public.resize_service(uuid,integer),public.mark_media_kit(uuid,uuid,text),public.activate_kit(uuid) from public;
grant execute on function public.resize_service(uuid,integer),public.mark_media_kit(uuid,uuid,text),public.activate_kit(uuid) to authenticated;
commit;


-- 202609170003_payment_and_legacy_assets.sql
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



-- 202609170004_book_club_conversion.sql
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



-- 202609170005_release_year_and_open_service_dates.sql
begin;
alter table public.books add column if not exists release_year integer check (release_year between 1000 and 9999);
do $$ begin
 if exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='books' and column_name='release_date'
 ) then
  update public.books
  set release_year=extract(year from release_date)::integer
  where release_year is null and release_date is not null;
 end if;
end $$;
alter table public.service_occurrences add column if not exists schedule_status text;
update public.service_occurrences
set schedule_status=case when scheduled_date is null then 'to_confirm' else 'scheduled' end
where schedule_status is null or (schedule_status='to_confirm' and scheduled_date is not null);
alter table public.service_occurrences
 alter column schedule_status set default 'to_confirm',
 alter column schedule_status set not null;
alter table public.service_occurrences
 drop constraint if exists service_occurrences_schedule_status_check;
alter table public.service_occurrences
 add constraint service_occurrences_schedule_status_check
 check (schedule_status in ('to_confirm','scheduled'));
create or replace function public.normalize_occurrence_schedule() returns trigger language plpgsql set search_path=public as $$
begin
 if new.scheduled_date is null then
  new.schedule_status:='to_confirm';
 else
  new.schedule_status:='scheduled';
 end if;
 return new;
end $$;
drop trigger if exists normalize_occurrence_schedule on public.service_occurrences;
create trigger normalize_occurrence_schedule before insert or update of scheduled_date,schedule_status
 on public.service_occurrences for each row execute function public.normalize_occurrence_schedule();
create index if not exists service_occurrences_open_schedule
 on public.service_occurrences(workspace_id,schedule_status)
 where status='pending';
commit;



-- 202609170006_create_author_service.sql
begin;
create or replace function public.create_author_service(
 p_workspace uuid,p_author uuid,p_book uuid,p_service_type uuid,p_quantity integer,p_unit_price numeric,p_notes text,p_schedule_status text,p_scheduled_date date
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_author public.authors; v_book public.books; v_type public.service_types; v_campaign uuid; v_service uuid; v_status text; begin
 if not public.is_workspace_member(p_workspace) then raise exception 'Você não possui acesso a este workspace.'; end if;
 select * into v_author from public.authors where id=p_author and workspace_id=p_workspace and archived_at is null;
 if not found then raise exception 'Autora inválida.'; end if;
 select * into v_type from public.service_types where id=p_service_type and workspace_id=p_workspace and active and archived_at is null;
 if not found then raise exception 'Tipo de serviço inválido.'; end if;
 if p_quantity<1 or p_quantity>600 then raise exception 'A quantidade deve estar entre 1 e 600.'; end if;
 if p_unit_price<0 then raise exception 'O valor não pode ser negativo.'; end if;
 if p_schedule_status not in ('to_confirm','scheduled') then raise exception 'Situação da data inválida.'; end if;
 if p_schedule_status='scheduled' and p_scheduled_date is null then raise exception 'Informe a data do serviço.'; end if;
 if p_book is not null then
  select * into v_book from public.books where id=p_book and workspace_id=p_workspace and archived_at is null;
  if not found or v_book.author_id is distinct from p_author then raise exception 'O livro não pertence à autora.'; end if;
 end if;
 v_status:=case when p_unit_price=0 and (p_book is null or v_book.cover_ai_status in ('confirmed_human','replaced')) then 'active' else 'awaiting_payment' end;
 insert into public.campaigns(workspace_id,name,author_id,book_id,campaign_type,proposal_type,start_date,total_value,payment_plan,status,notes)
 values(p_workspace,v_type.name || case when p_book is null then '' else ' • ' || v_book.title end,p_author,p_book,'advertising','custom',coalesce(p_scheduled_date,current_date),p_quantity*p_unit_price,'full_upfront',v_status,'Registro interno criado ao adicionar um serviço pela ficha da autora.') returning id into v_campaign;
 insert into public.campaign_services(workspace_id,campaign_id,service_type_id,quantity,unit_price,notes)
 values(p_workspace,v_campaign,p_service_type,p_quantity,p_unit_price,p_notes) returning id into v_service;
 update public.service_occurrences set scheduled_date=case when p_schedule_status='scheduled' then p_scheduled_date else null end,schedule_status=p_schedule_status where campaign_service_id=v_service;
 return v_service;
end $$;
revoke all on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date) from public;
grant execute on function public.create_author_service(uuid,uuid,uuid,uuid,integer,numeric,text,text,date) to authenticated;
commit;


-- 202609180007_media_kit_year.sql
begin;
alter table public.media_kits add column if not exists year integer;
update public.media_kits
set year=case when version ~ '^\\d{4}$' then version::integer else extract(year from created_at)::integer end
where year is null;
alter table public.media_kits
 alter column year set default extract(year from current_date)::integer,
 alter column year set not null;
alter table public.media_kits drop constraint if exists media_kits_year_check;
alter table public.media_kits add constraint media_kits_year_check check(year between 1000 and 9999);
create index if not exists media_kits_workspace_year_name on public.media_kits(workspace_id,year desc,name);
commit;
