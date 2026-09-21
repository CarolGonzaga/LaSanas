import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = "11111111-1111-4111-8111-111111111111", production = "22222222-2222-4222-8222-222222222222";
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$; grant usage on schema auth,storage,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated; insert into auth.users(id,email) values('${admin}','admin@example.test'),('${production}','production@example.test');`);
for (const name of ["202609160001_initial_schema.sql","202609170001_shared_workspace.sql","202609170002_business_rules.sql","202609170003_payment_and_legacy_assets.sql","202609170004_book_club_conversion.sql","202609170005_release_year_and_open_service_dates.sql","202609170006_create_author_service.sql","202609180007_media_kit_year.sql","202609180008_manage_campaigns.sql","202609180009_final_audit_fixes.sql","202609180010_production_home_and_assignment.sql","202609180011_recover_media_kit_year.sql","202609180012_profile_username_and_avatar.sql","202609180013_conversation_threads.sql","202609190014_prevent_duplicate_contact_emails.sql","202609200015_monthly_plan_contracts.sql","202609200016_production_status_and_updates.sql","202609200017_opportunity_services.sql","202609200018_unify_services_and_payment_activation.sql","202609200019_campaign_service_financial_flow.sql","202609210020_contract_items_workflow.sql","202609220021_replace_campaign_flow.sql","202609220022_decouple_editorial_slots.sql"]) { const source=await readFile(new URL("../supabase/migrations/"+name,import.meta.url),"utf8"); await db.exec(source.replace(/create extension if not exists pgcrypto;/gi,"")); console.log("PASS migration "+name); }
const sql = async (q, params=[]) => (await db.query(q,params)).rows;
try {
 await sql("insert into workspaces(id,name,default_production_user_id) values($1,'Teste',$2)",[admin,production]);
 await sql("insert into workspace_members(workspace_id,user_id,role) values($1,$1,'admin'),($1,$2,'member')",[admin,production]);
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[admin]); await db.exec("set role authenticated");
 const [publisher]=await sql("insert into publishers(workspace_id,name) values($1,'Editora') returning id",[admin]);
 const [author]=await sql("insert into authors(workspace_id,name,email) values($1,'Autora','autora@test.com') returning id",[admin]);
 const [book]=await sql("insert into books(workspace_id,author_id,publisher_id,title,cover_ai_status) values($1,$2,$3,'Livro','confirmed_human') returning id",[admin,author.id,publisher.id]);
 const [type]=await sql("insert into service_types(workspace_id,name,default_price,active) values($1,'Reels',200,true) returning id",[admin]);
 const [packageRow]=await sql("insert into service_packages(workspace_id,name,duration_months,package_price,active) values($1,'Plano',3,190,true) returning id",[admin]);
 await sql("insert into service_package_items(workspace_id,package_id,service_type_id,quantity_per_month) values($1,$2,$3,1)",[admin,packageRow.id,type.id]);
 const [opp]=await sql("insert into opportunities(workspace_id,name,contact_type,author_id,book_id,source_channel,status) values($1,'x','author',$2,$3,'email','new') returning *",[admin,author.id,book.id]);
 assert.equal(opp.author_id,author.id);
 const [service]=await sql("insert into opportunity_services(workspace_id,opportunity_id,item_kind,service_type_id,quantity,unit_price,payment_terms) values($1,$2,'service',$3,1,101,'half_and_half') returning id",[admin,opp.id,type.id]);
 assert.equal((await sql("select * from payments where opportunity_service_id=$1",[service.id])).length,2);
 assert.equal((await sql("select sum(amount)::text as total from payments where opportunity_service_id=$1",[service.id]))[0].total,"101.00");
 await sql("update payments set status='paid',paid_at=now(),payment_method='pix' where opportunity_service_id=$1 and installment_number=1",[service.id]);
 assert.equal((await sql("select count(*)::int as count from service_occurrences where opportunity_service_id=$1 and released_at is not null and assigned_to=$2",[service.id,production]))[0].count,1);
 const [planService]=await sql("insert into opportunity_services(workspace_id,opportunity_id,item_kind,service_package_id,quantity,unit_price,duration_months,payment_terms) values($1,$2,'package',$3,1,190,3,'monthly_full') returning id",[admin,opp.id,packageRow.id]);
 assert.equal((await sql("select count(*)::int as count from payments where opportunity_service_id=$1",[planService.id]))[0].count,3);
 await sql("update payments set status='paid',paid_at=now(),payment_method='pix' where opportunity_service_id=$1 and billing_cycle=1",[planService.id]);
 assert.equal((await sql("select count(*)::int as count from service_occurrences where opportunity_service_id=$1 and billing_cycle=1 and released_at is not null",[planService.id]))[0].count,1);
 assert.equal((await sql("select count(*)::int as count from service_occurrences where opportunity_service_id=$1 and billing_cycle=2 and released_at is not null",[planService.id]))[0].count,0);
 await sql("insert into communication_logs(workspace_id,opportunity_id,author_id,channel,direction,responsible_user_id,contacted_at,summary) values($1,$2,$3,'email','incoming',$4,'2026-09-20T14:00:00-03','Contato')",[admin,opp.id,author.id,admin]);
 assert.equal((await sql("select to_char(first_contact_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day from opportunities where id=$1",[opp.id]))[0].day,'2026-09-20');
 console.log("PASS oportunidade, pagamentos, ciclos, produção e comunicação V2");
} catch (e) { console.error("FAIL",e.message,e.detail??""); process.exitCode=1; } finally { await db.close(); }
