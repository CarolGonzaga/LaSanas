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
