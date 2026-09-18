-- Execute no SQL Editor DEPOIS de criar as duas contas em Authentication > Users.
-- Substitua SOMENTE os dois e-mails e o nome do negócio.
do $$
declare
 email_whatsapp text := 'integrante-whatsapp@exemplo.com';
 email_comercial text := 'integrante-comercial@exemplo.com';
 nome_negocio text := 'Lume Sáfico';
 pessoa_a uuid; pessoa_b uuid; negocio uuid;
begin
 select id into pessoa_a from auth.users where lower(email)=lower(email_whatsapp);
 select id into pessoa_b from auth.users where lower(email)=lower(email_comercial);
 if pessoa_a is null or pessoa_b is null then raise exception 'Crie as duas contas no Supabase Auth e substitua os e-mails neste script.'; end if;
 if pessoa_a=pessoa_b then raise exception 'Informe duas contas diferentes.'; end if;
 select id into negocio from public.workspaces where id=pessoa_a;
 if negocio is null then
  select w.id into negocio from public.workspaces w join public.workspace_members m on m.workspace_id=w.id where m.user_id=pessoa_a and w.name=nome_negocio limit 1;
 end if;
 if negocio is null then insert into public.workspaces(name) values(nome_negocio) returning id into negocio; end if;
 insert into public.workspace_members(workspace_id,user_id,role,active) values(negocio,pessoa_a,'admin',true),(negocio,pessoa_b,'admin',true)
 on conflict(workspace_id,user_id) do update set active=true,role='admin';
 insert into public.channel_assignments(workspace_id,channel,responsible_user_id) values
 (negocio,'whatsapp',pessoa_a),(negocio,'email',pessoa_b),(negocio,'instagram',pessoa_b),(negocio,'x_twitter',pessoa_b),(negocio,'other',pessoa_b)
 on conflict(workspace_id,channel) do update set responsible_user_id=excluded.responsible_user_id;
 raise notice 'Workspace compartilhado configurado: %',negocio;
end $$;

