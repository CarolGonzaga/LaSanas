import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
const loadTs = async (path, replacements = {}) => {
 let source = await readFile(new URL(path, import.meta.url), "utf8");
 for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
 return "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
};
const presentationUrl = await loadTs("../src/lib/opportunity-service-presentation.ts");
const { occurrenceLabel, compareExecutionOrder } = await import(presentationUrl);
const { getTodayWorkItems, buildWorkItems, selectTodayWorkItems } = await import(await loadTs("../src/lib/work-items.ts", { "@/lib/opportunity-service-presentation": presentationUrl }));
const todayFixture = buildWorkItems({opportunity_services:[{id:'plan'},{id:'other'},{id:'overdue'}],service_occurrences: [
 {id:'done',opportunity_service_id:'plan',status:'completed',scheduled_date:'2026-09-23',completed_at:'2026-09-23T10:00:00Z'},
 {id:'future',opportunity_service_id:'plan',status:'pending',scheduled_date:'2026-09-25'},
 {id:'last-today',opportunity_service_id:'plan',status:'in_revision',scheduled_date:'2026-09-23'},
 {id:'other-done',opportunity_service_id:'other',status:'completed',scheduled_date:'2026-09-23',completed_at:'2026-09-23T10:00:00Z'},
 {id:'late',opportunity_service_id:'overdue',status:'in_progress',scheduled_date:'2026-09-22'},
].map(row=>({...row,assigned_to:'user',released_at:'2026-09-01'}))});
assert.deepEqual(selectTodayWorkItems(todayFixture,'user','2026-09-23').map(item=>item.id),['late','done','last-today']);
// The final completion must hide the group immediately, before router.refresh.
assert.deepEqual(selectTodayWorkItems(todayFixture,'user','2026-09-23',{'last-today':'completed'}).map(item=>item.id),['late']);
assert.deepEqual(selectTodayWorkItems(todayFixture,'user','2026-09-23',{'last-today':'cancelled'}).map(item=>item.id),['late']);
assert.deepEqual(selectTodayWorkItems(todayFixture,'another-user','2026-09-23'),[]);
assert.deepEqual(selectTodayWorkItems(todayFixture.map(item=>({...item,released:false})),'user','2026-09-23'),[]);
assert.ok(selectTodayWorkItems(todayFixture,'user','2026-09-25',{'last-today':'completed'}).some(item=>item.id==='future'));
assert.equal(todayFixture.find(item=>item.id==='last-today').status,'in_revision');
assert.ok(selectTodayWorkItems(todayFixture,'user','2026-09-23',{'last-today':'in_revision'}).some(item=>item.id==='last-today'));
const unordered = [
 {id:'month3',billing_cycle:3,sequence_number:7},
 {id:'late',billing_cycle:1,sequence_number:1,scheduled_date:'2026-09-25'},
 {id:'month2',billing_cycle:2,sequence_number:4},
 {id:'early-pm',billing_cycle:3,sequence_number:8,scheduled_date:'2026-09-22',scheduled_time:'15:00'},
 {id:'month1',billing_cycle:1,sequence_number:2},
 {id:'early-am',billing_cycle:2,sequence_number:5,scheduled_date:'2026-09-22',scheduled_time:'09:00'},
];
const expectedOrder = ['early-am','early-pm','late','month1','month2','month3'];
assert.deepEqual([...unordered].sort(compareExecutionOrder).map(row=>row.id),expectedOrder);
assert.deepEqual(buildWorkItems({service_occurrences:unordered}).map(row=>row.id),expectedOrder);
assert.deepEqual(getTodayWorkItems({service_occurrences:unordered.map(row=>({...row,assigned_to:'user',released_at:'2026-09-01',status:'pending'}))},'user','2026-09-25').map(row=>row.id),expectedOrder.slice(0,3));
const { monthlyPlanPrice } = await import(await loadTs("../src/lib/monthly-plan.ts"));
assert.equal(monthlyPlanPrice({ package_price: 570, duration_months: 3 }), 190);
const db = new PGlite();
const admin = "11111111-1111-4111-8111-111111111111", production = "22222222-2222-4222-8222-222222222222";
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$; grant usage on schema auth,storage,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated; insert into auth.users(id,email) values('${admin}','admin@example.test'),('${production}','production@example.test');`);
for (const name of ["202609160001_initial_schema.sql","202609170001_shared_workspace.sql","202609170002_business_rules.sql","202609170003_payment_and_legacy_assets.sql","202609170004_book_club_conversion.sql","202609170005_release_year_and_open_service_dates.sql","202609170006_create_author_service.sql","202609180007_media_kit_year.sql","202609180008_manage_campaigns.sql","202609180009_final_audit_fixes.sql","202609180010_production_home_and_assignment.sql","202609180011_recover_media_kit_year.sql","202609180012_profile_username_and_avatar.sql","202609180013_conversation_threads.sql","202609190014_prevent_duplicate_contact_emails.sql","202609200015_monthly_plan_contracts.sql","202609200016_production_status_and_updates.sql","202609200017_opportunity_services.sql","202609200018_unify_services_and_payment_activation.sql","202609200019_campaign_service_financial_flow.sql","202609210020_contract_items_workflow.sql","202609220021_replace_campaign_flow.sql","202609220022_decouple_editorial_slots.sql","202609220023_monthly_production_queue.sql"]) { const source=await readFile(new URL("../supabase/migrations/"+name,import.meta.url),"utf8"); await db.exec(source.replace(/create extension if not exists pgcrypto;/gi,"")); console.log("PASS migration "+name); }
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
 await sql("update payments set status='paid',paid_at=now(),payment_method='pix' where opportunity_service_id=$1 and installment_number=2",[service.id]);
 assert.equal((await sql("select sum(amount)::text as total from payments where opportunity_service_id=$1 and status='paid'",[service.id]))[0].total,"101.00");
 const [planService]=await sql("insert into opportunity_services(workspace_id,opportunity_id,item_kind,service_package_id,quantity,unit_price,duration_months,payment_terms) values($1,$2,'package',$3,1,190,3,'monthly_full') returning id",[admin,opp.id,packageRow.id]);
 assert.equal((await sql("select count(*)::int as count from payments where opportunity_service_id=$1",[planService.id]))[0].count,3);
 await sql("update payments set status='paid',paid_at=now(),payment_method='pix' where opportunity_service_id=$1 and billing_cycle=1",[planService.id]);
 assert.equal((await sql("select count(*)::int as count from service_occurrences where opportunity_service_id=$1 and billing_cycle=1 and released_at is not null",[planService.id]))[0].count,1);
 assert.equal((await sql("select count(*)::int as count from service_occurrences where opportunity_service_id=$1 and billing_cycle=2 and released_at is not null",[planService.id]))[0].count,0);
 await sql("insert into communication_logs(workspace_id,opportunity_id,author_id,channel,direction,responsible_user_id,contacted_at,summary) values($1,$2,$3,'email','incoming',$4,'2026-09-20T14:00:00-03','Contato')",[admin,opp.id,author.id,admin]);
 assert.equal((await sql("select to_char(first_contact_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day from opportunities where id=$1",[opp.id]))[0].day,'2026-09-20');
 console.log("PASS oportunidade, pagamentos, ciclos, produção e comunicação V2");
 await sql("update service_package_items set quantity_per_month=3 where package_id=$1",[packageRow.id]);
 const [queuePlan]=await sql("insert into opportunity_services(workspace_id,opportunity_id,item_kind,service_package_id,quantity,unit_price,duration_months,payment_terms) values($1,$2,'package',$3,1,$4,3,'monthly_full') returning *",[admin,opp.id,packageRow.id,monthlyPlanPrice({package_price:570,duration_months:3})]);
 const occurrences = () => sql("select * from service_occurrences where opportunity_service_id=$1 order by sequence_number",[queuePlan.id]);
 const payments = () => sql("select * from payments where opportunity_service_id=$1 order by installment_number",[queuePlan.id]);
 assert.equal((await occurrences()).length,9);
 assert.equal((await payments()).reduce((sum,p)=>sum+Number(p.amount),0),570);
 assert.equal((await occurrences()).filter(o=>o.released_at).length,0);
 await sql("update service_occurrences set scheduled_date=current_date where opportunity_service_id=$1",[queuePlan.id]);
 await sql("update payments set status='paid',paid_at=now(),payment_method='pix' where opportunity_service_id=$1 and billing_cycle in (1,3)",[queuePlan.id]);
 let queue = await occurrences();
 assert.deepEqual(queue.filter(o=>o.released_at).map(o=>o.sequence_number),[1,2,3,4,5,6]);
 assert.ok(queue.slice(6).every(o=>o.status==='pending' && !o.released_at));
 const dataset = JSON.parse(JSON.stringify({service_occurrences:queue,opportunity_services:[queuePlan],service_types:[{id:type.id,name:'Tweets'}],payments:await payments()}));
 assert.deepEqual(queue.map(o=>occurrenceLabel(o,dataset)),Array.from({length:9},(_,i)=>`Tweets ${i+1}/9 · Mês ${Math.floor(i/3)+1}`));
 for (const month of [1,2,3]) {
   const monthOnly = {...dataset,service_occurrences:dataset.service_occurrences.filter(o=>o.billing_cycle===month)};
   assert.deepEqual(monthOnly.service_occurrences.map(o=>occurrenceLabel(o,monthOnly)),Array.from({length:3},(_,i)=>`Tweets ${(month-1)*3+i+1}/9 · Mês ${month}`));
 }
 const stories = {...dataset,service_occurrences:dataset.service_occurrences.filter(o=>o.sequence_number%3===1)};
 assert.deepEqual(stories.service_occurrences.map(o=>occurrenceLabel(o,stories)),['Tweets 1/3 · Mês 1','Tweets 2/3 · Mês 2','Tweets 3/3 · Mês 3']);
 assert.equal(occurrenceLabel({id:'single',opportunity_service_id:'single-service',service_type_id:type.id,sequence_number:1},{service_types:dataset.service_types,service_occurrences:[{id:'single',opportunity_service_id:'single-service',service_type_id:type.id,sequence_number:1}]}),'Tweets');
 assert.equal(getTodayWorkItems(dataset,production,'2099-01-01').length,6);
 const originalIds=queue.map(o=>o.id);
 await sql("update payments set status='paid',paid_at=now(),payment_method='pix' where opportunity_service_id=$1 and billing_cycle=2",[queuePlan.id]);
 queue=await occurrences();
 assert.equal(queue.filter(o=>o.released_at).length,9);
 assert.deepEqual(queue.map(o=>o.id),originalIds);
 await sql("update payments set status='pending' where opportunity_service_id=$1 and billing_cycle=3",[queuePlan.id]);
 assert.equal((await occurrences()).filter(o=>o.released_at).length,6);
 await sql("delete from payments where opportunity_service_id=$1 and billing_cycle=2",[queuePlan.id]);
 assert.equal((await occurrences()).filter(o=>o.released_at).length,3);
 console.log("PASS mensalidade 190 x 3, nove execuções, pagamentos 1 e 3, Meu dia, numeração estável e estorno");
} catch (e) { console.error("FAIL",e.message,e.detail??""); process.exitCode=1; } finally { await db.close(); }
