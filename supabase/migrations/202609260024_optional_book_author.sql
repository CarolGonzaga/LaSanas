begin;

-- Livros do clube podem existir sem um contato comercial de autora.
-- A chave estrangeira continua validando o vínculo quando ele for informado.
alter table public.books alter column author_id drop not null;

commit;
