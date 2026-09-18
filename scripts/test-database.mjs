import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const u1 = "11111111-1111-4111-8111-111111111111",
  u2 = "22222222-2222-4222-8222-222222222222",
  u3 = "33333333-3333-4333-8333-333333333333";
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema auth,storage,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated;
insert into auth.users(id,email) values('${u1}','one@example.test'),('${u2}','two@example.test'),('${u3}','three@example.test');
`);
for (const name of [
  "202609160001_initial_schema.sql",
  "202609170001_shared_workspace.sql",
  "202609170002_business_rules.sql",
  "202609170003_payment_and_legacy_assets.sql",
  "202609170004_book_club_conversion.sql",
  "202609170005_release_year_and_open_service_dates.sql",
  "202609170006_create_author_service.sql",
]) {
  const source = await readFile(
    new URL("../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );
  if (
    process.argv.includes("--fresh") &&
    name === "202609160001_initial_schema.sql"
  )
    continue;
  try {
    await db.exec(
      source.replace(/create extension if not exists pgcrypto;/gi, ""),
    );
    console.log("PASS migration " + name);
  } catch (e) {
    console.error("FAIL migration " + name, e.message);
    process.exitCode = 1;
    await db.close();
    process.exit(1);
  }
}
async function sql(q, params = []) {
  return (await db.query(q, params)).rows;
}
async function expectFailure(q, pattern, params = []) {
  await assert.rejects(() => db.query(q, params), pattern);
}
try {
  await sql(
    "insert into workspaces(id,name) values($1,'Negócio de teste'),($2,'Outro workspace')",
    [u1, u3],
  );
  await sql(
    "insert into workspace_members(workspace_id,user_id,role) values($1,$1,'admin'),($2,$2,'admin')",
    [u1, u3],
  );
  await sql(
    "insert into workspace_members(workspace_id,user_id,role) values($1,$2,'member')",
    [u1, u2],
  );
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
  await db.exec("set role authenticated");
  const [author] = await sql(
    "insert into authors(workspace_id,name) values($1,'Autora teste') returning id",
    [u1],
  );
  const [book] = await sql(
    "insert into books(workspace_id,author_id,title,cover_ai_status) values($1,$2,'Livro teste','confirmed_ai') returning id",
    [u1, author.id],
  );
  await sql("update books set release_year=2024 where id=$1", [
    book.id,
  ]);
  assert.equal(
    (await sql("select release_year from books where id=$1", [book.id]))[0]
      .release_year,
    2024,
  );
  await sql(
    "insert into channel_assignments(workspace_id,channel,responsible_user_id) values($1,'email',$2)",
    [u1, u2],
  );
  const [opp] = await sql(
    "insert into opportunities(workspace_id,name,contact_type,author_id,book_id,source_channel,status,proposal_type) values($1,'Negociação','author',$2,$3,'email','approved','media_kit') returning *",
    [u1, author.id, book.id],
  );
  assert.equal(opp.responsible_user_id, u2);
  console.log("PASS atribuição automática por canal");
  const [camp] = await sql(
    "insert into campaigns(workspace_id,name,author_id,book_id,opportunity_id,start_date,end_date,total_value,payment_plan,status,campaign_type,proposal_type) values($1,'Campanha',$2,$3,$4,'2026-09-20','2026-10-20',300.01,'half_and_half','awaiting_payment','advertising','media_kit') returning *",
    [u1, author.id, book.id, opp.id],
  );
  const pays = await sql(
    "select * from payments where campaign_id=$1 order by installment_number",
    [camp.id],
  );
  assert.equal(pays.length, 2);
  assert.equal(Number(pays[0].amount), 150.01);
  assert.equal(Number(pays[1].amount), 150);
  await expectFailure(
    "update campaigns set status='active' where id=$1",
    /capa/,
    [camp.id],
  );
  await sql("update books set cover_ai_status='confirmed_human' where id=$1", [
    book.id,
  ]);
  const [reelsType] = await sql(
    "insert into service_types(workspace_id,name,default_price,active) values($1,'Reels',0,true) returning id",
    [u1],
  );
  const [directService] = await sql(
    "select create_author_service($1,$2,$3,$4,1,0,'Aguardar recebimento e leitura','to_confirm',null) as id",
    [u1, author.id, book.id, reelsType.id],
  );
  const [openOccurrence] = await sql(
    "select * from service_occurrences where campaign_service_id=$1",
    [directService.id],
  );
  assert.equal(
    (
      await sql(
        "select c.author_id,c.book_id from campaign_services s join campaigns c on c.id=s.campaign_id where s.id=$1",
        [directService.id],
      )
    )[0].author_id,
    author.id,
  );
  assert.equal(openOccurrence.schedule_status, "to_confirm");
  assert.equal(openOccurrence.scheduled_date, null);
  await sql(
    "update service_occurrences set scheduled_date='2026-10-25' where id=$1",
    [openOccurrence.id],
  );
  const [datedService] = await sql(
    "select create_author_service($1,$2,$3,$4,1,0,null,'scheduled','2026-10-25') as id",
    [u1, author.id, book.id, reelsType.id],
  );
  const [datedOccurrence] = await sql(
    "select *,to_char(scheduled_date,'YYYY-MM-DD') as scheduled_day from service_occurrences where campaign_service_id=$1",
    [datedService.id],
  );
  assert.equal(datedOccurrence.schedule_status, "scheduled");
  assert.equal(datedOccurrence.scheduled_day, "2026-10-25");
  await sql("update service_occurrences set status='completed' where id=$1", [
    datedOccurrence.id,
  ]);
  assert.equal(
    (await sql("select status from service_occurrences where id=$1", [
      datedOccurrence.id,
    ]))[0].status,
    "completed",
  );
  assert.equal(
    (
      await sql("select schedule_status from service_occurrences where id=$1", [
        openOccurrence.id,
      ])
    )[0].schedule_status,
    "scheduled",
  );
  console.log("PASS serviço direto da autora e data a confirmar");
  await expectFailure(
    "update campaigns set status='active' where id=$1",
    /Pagamento inicial/,
    [camp.id],
  );
  await sql(
    "update payments set status='paid',paid_at=now(),payment_method='pix' where id=$1",
    [pays[0].id],
  );
  await sql("update campaigns set status='active' where id=$1", [camp.id]);
  console.log("PASS 50/50, precisão monetária, bloqueio IA e sinal");
  const [service] = await sql(
    "insert into campaign_services(workspace_id,campaign_id,custom_name,quantity,unit_price) values($1,$2,'Story',5,30) returning id",
    [u1, camp.id],
  );
  assert.equal(
    (
      await sql(
        "select * from service_occurrences where campaign_service_id=$1",
        [service.id],
      )
    ).length,
    5,
  );
  assert.equal(
    (
      await sql(
        "select schedule_status from service_occurrences where campaign_service_id=$1 limit 1",
        [service.id],
      )
    )[0].schedule_status,
    "to_confirm",
  );
  await sql(
    "update service_occurrences set scheduled_date='2026-10-01' where campaign_service_id=$1 and sequence_number=1",
    [service.id],
  );
  assert.equal(
    (
      await sql(
        "select schedule_status from service_occurrences where campaign_service_id=$1 and sequence_number=1",
        [service.id],
      )
    )[0].schedule_status,
    "scheduled",
  );
  await sql(
    "update service_occurrences set status='completed' where campaign_service_id=$1 and sequence_number in (1,5)",
    [service.id],
  );
  await expectFailure("select resize_service($1,3)", /concluídas/, [
    service.id,
  ]);
  await sql(
    "update service_occurrences set status='pending' where campaign_service_id=$1 and sequence_number=5",
    [service.id],
  );
  await expectFailure(
    "update campaign_services set quantity=3 where id=$1",
    /Confirme/,
    [service.id],
  );
  await sql("select resize_service($1,3)", [service.id]);
  assert.equal(
    (
      await sql(
        "select * from service_occurrences where campaign_service_id=$1",
        [service.id],
      )
    ).length,
    3,
  );
  await sql("select resize_service($1,7)", [service.id]);
  assert.equal(
    (
      await sql(
        "select * from service_occurrences where campaign_service_id=$1",
        [service.id],
      )
    ).length,
    7,
  );
  console.log("PASS criação, conclusão e redimensionamento de ocorrências");
  const [kit] = await sql(
    "insert into media_kits(workspace_id,name,version,external_url,active) values($1,'Kit','2026','https://example.com/kit.pdf',true) returning id",
    [u1],
  );
  await sql("select mark_media_kit($1,$2,'email')", [opp.id, kit.id]);
  assert.equal(
    (
      await sql("select * from communication_logs where opportunity_id=$1", [
        opp.id,
      ])
    ).length,
    1,
  );
  assert.equal(
    (
      await sql("select media_kit_version_id from opportunities where id=$1", [
        opp.id,
      ])
    )[0].media_kit_version_id,
    kit.id,
  );
  const [reading] = await sql(
    "insert into collective_reading_slots(workspace_id,year,month,status) values($1,2026,11,'available') returning id",
    [u1],
  );
  await sql(
    "update collective_reading_slots set announcement_published_at=now(),announcement_channel='instagram',author_id=$2,book_id=$3,status='confirmed' where id=$1",
    [reading.id, author.id, book.id],
  );
  await expectFailure(
    "insert into collective_reading_slots(workspace_id,year,month,status) values($1,2026,11,'available')",
    /unique/,
    [u1],
  );
  await sql(
    "update collective_reading_slots set status='completed' where id=$1",
    [reading.id],
  );
  const [response] = await sql(
    "insert into response_templates(workspace_id,title,category,channel,content,active) values($1,'Primeiro contato','Primeiro Contato','email','Olá {nome}!',true) returning id",
    [u1],
  );
  await sql(
    "update response_templates set content='Olá {autora}!' where id=$1",
    [response.id],
  );
  await sql("delete from response_templates where id=$1", [response.id]);
  assert.equal(
    (await sql("select * from response_templates where id=$1", [response.id]))
      .length,
    0,
  );
  console.log("PASS media kit, timeline, leitura coletiva e CRUD de respostas");
  const [publisher] = await sql(
    "insert into publishers(workspace_id,name) values($1,'Editora teste') returning id",
    [u1],
  );
  await sql("update books set publisher_id=$1 where id=$2", [
    publisher.id,
    book.id,
  ]);
  const [contact] = await sql(
    "insert into publisher_contacts(workspace_id,publisher_id,name,email) values($1,$2,'Contato','editor@example.test') returning id",
    [u1, publisher.id],
  );
  const [slot] = await sql(
    "insert into book_club_slots(workspace_id,year,month,status,book_id,publisher_contact_id) values($1,2026,12,'negotiating',$2,$3) returning *",
    [u1, book.id, contact.id],
  );
  assert.equal(slot.publisher_id, publisher.id);
  const [clubCampaign] = await sql(
    "insert into campaigns(workspace_id,name,author_id,publisher_id,book_id,book_club_slot_id,start_date,total_value,payment_plan,status,campaign_type,proposal_type) values($1,'Clube',$2,$3,$4,$5,'2026-12-01',200,'full_upfront','awaiting_payment','book_club','media_kit') returning id",
    [u1, author.id, publisher.id, book.id, slot.id],
  );
  assert.equal(
    (
      await sql("select campaign_id from book_club_slots where id=$1", [
        slot.id,
      ])
    )[0].campaign_id,
    clubCampaign.id,
  );
  assert.equal(
    (
      await sql("select amount from payments where campaign_id=$1", [
        clubCampaign.id,
      ])
    )[0].amount,
    "200.00",
  );
  console.log(
    "PASS editora identificada, contato e conversão do clube em campanha com cobrança",
  );
  const [type] = await sql(
    "insert into service_types(workspace_id,name,default_price,active) values($1,'Stories',20,true) returning id",
    [u1],
  );
  const [pack] = await sql(
    "insert into service_packages(workspace_id,name,duration_months,package_price,active) values($1,'Trimestral',3,180,true) returning id",
    [u1],
  );
  await sql(
    "insert into service_package_items(workspace_id,package_id,service_type_id,quantity_per_month) values($1,$2,$3,2)",
    [u1, pack.id, type.id],
  );
  const [loyalty] = await sql(
    "insert into campaigns(workspace_id,name,author_id,service_package_id,start_date,total_value,payment_plan,status,campaign_type,proposal_type) values($1,'Fidelização',$2,$3,'2026-09-20',180,'full_upfront','awaiting_payment','advertising','loyalty') returning id",
    [u1, author.id, pack.id],
  );
  const occurrences = await sql(
    "select o.* from service_occurrences o join campaign_services s on s.id=o.campaign_service_id where s.campaign_id=$1",
    [loyalty.id],
  );
  assert.equal(occurrences.length, 6);
  assert.equal(
    new Set(occurrences.map((o) => String(o.scheduled_date).slice(0, 7))).size,
    3,
  );
  await sql("update payments set status='pending' where id=$1", [pays[0].id]);
  assert.equal(
    (await sql("select status from campaigns where id=$1", [camp.id]))[0]
      .status,
    "paused",
  );
  console.log("PASS pacote de 3 meses e pausa ao desfazer o sinal");
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [u2]);
  assert.equal(
    (await sql("select * from campaigns where id=$1", [camp.id])).length,
    1,
  );
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [u3]);
  assert.equal(
    (await sql("select * from campaigns where id=$1", [camp.id])).length,
    0,
  );
  await expectFailure(
    "insert into authors(workspace_id,name) values($1,'Intrusa')",
    /row-level/,
    [u1],
  );
  const [foreignAuthor] = await sql(
    "insert into authors(workspace_id,name) values($1,'Outro negócio') returning id",
    [u3],
  );
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
  await expectFailure(
    "insert into books(workspace_id,author_id,title,cover_ai_status) values($1,$2,'Vínculo inválido','unknown')",
    /foreign key/,
    [u1, foreignAuthor.id],
  );
  await sql(
    "insert into storage.objects(bucket_id,name) values('business-assets',$1)",
    [u1 + "/books/test.png"],
  );
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [u3]);
  assert.equal((await sql("select * from storage.objects")).length, 0);
  console.log(
    "PASS compartilhamento, isolamento RLS, integridade e Storage privado",
  );
  await db.exec("reset role; set role anon");
  await expectFailure("select * from campaigns", /permission denied/);
  console.log("PASS bloqueio de acesso anônimo");
  console.log("Todos os testes de banco passaram.");
} catch (e) {
  console.error("FAIL", e.message, e.detail ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
