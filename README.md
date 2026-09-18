# Lume — Gestão literária

Aplicação administrativa privada para duas ou mais integrantes do mesmo negócio. Next.js App Router, React, TypeScript strict, Tailwind, componentes Radix/shadcn locais, React Hook Form, Zod, date-fns, next-themes e Supabase Auth/Postgres/Storage.

## Executar localmente

Requisitos: Node.js 22 ou superior, npm, projeto Supabase.

```powershell
npm ci
Copy-Item .env.example .env.local
# Preencha .env.local com a URL e chave pública do seu projeto
npm run dev
```

Abra http://localhost:3000/login. As credenciais fornecidas já estão em `.env.local` nesta máquina. Esse arquivo é ignorado pelo Git.

No Windows/OneDrive, se houver bloqueio do cache de compilação:

```powershell
$env:NEXT_DIST_DIR=".next-local"
npm run dev -- --hostname 127.0.0.1
```

A rota `/preview` existe **somente no modo development** para revisar as mesmas telas com estados vazios, sem dados fictícios e sem gravações. Não consulta dados administrativos e não fica disponível em produção. Para salvar, use uma conta real em `/login`.

## Supabase: instalação em poucos passos

1. Abra o SQL Editor do projeto fornecido.
2. Execute **`supabase/install-workspace.sql` uma única vez**. Esse arquivo consolida as quatro migrations da atualização e funciona tanto em banco novo quanto na primeira versão. Não execute novamente as mesmas migrations depois do consolidado.
3. Em **Authentication → Providers → Email**, mantenha login por e-mail e senha e desative novas inscrições públicas. Também desative signups anônimos. Não há cadastro público na aplicação.
4. Em **Authentication → Users**, crie as duas contas administrativas. Cada integrante escolhe sua própria senha. O trigger cria seus perfis automaticamente.
5. Abra `supabase/setup-workspace.sql`, substitua os dois e-mails e o nome do negócio, e execute no SQL Editor.
6. O script vincula as duas contas ao mesmo workspace e configura WhatsApp para a primeira integrante; e-mail, Instagram, X/Twitter e Outros para a segunda. Ambas recebem papel de administradora. A distribuição pode ser alterada em **Configurações → Canais**.
7. Entre pela aplicação. Se ainda aparecer a orientação de configuração, recarregue após terminar os passos anteriores.

Não é necessário fornecer service role, senha do banco ou token administrativo à aplicação. A chave anon/publishable não pode executar migrations nem criar as contas.

Para bancos gerenciados pela CLI do Supabase, use os arquivos em `supabase/migrations` na ordem do nome e o histórico de migrations da CLI, em vez do consolidado.

## Arquitetura e decisões

- A sessão é mantida em cookies com `@supabase/ssr`. `src/proxy.ts` atualiza cookies e redireciona sessões ausentes.
- Toda Server Action autentica a pessoa e resolve seu workspace no servidor. O navegador não determina o `workspace_id` de gravação.
- Todas as tabelas de negócio possuem RLS baseada em membership ativo. Perfis só são visíveis à própria pessoa ou colegas de workspace.
- Chaves estrangeiras compostas por workspace e ID impedem relacionamentos entre negócios diferentes.
- Metadata de formulários e entidades fica em `src/lib/modules.ts`. A mesma definição orienta os formulários e a validação no servidor, evitando CRUDs divergentes.
- Regras comerciais são transacionais no Postgres: campanha gera cobranças, pacote gera serviços e ocorrências, contato atualiza follow-up e conversão do clube vincula a campanha ao mês.
- O valor, plano de pagamento e pacote ficam imutáveis após criar a campanha. Defina a proposta antes de converter; as datas das cobranças continuam editáveis.
- Uma capa precisa estar confirmada como humana ou substituída para liberar produção. Pagamento inicial pode ter exceção apenas por administradora com justificativa e auditoria. A exceção não remove a regra de IA.
- Desfazer o sinal pausa uma campanha ativa sem exceção registrada.
- Valores monetários são NUMERIC(12,2), enviados como strings decimais e formatados em BRL. Datas comerciais usam DATE e eventos usam timestamptz.
- A busca global opera sobre registros do workspace carregados pelo servidor; a leitura pagina no Supabase para não truncar em 1.000 registros.
- Histórico de autoras/editoras é obtido pelos relacionamentos. Não existe portal de clientes nem integração automática de mensagens.

## Estrutura principal

```text
src/
  app/
    (dashboard)/[module]/[[...segments]]/page.tsx
    (dashboard)/loading.tsx
    (dashboard)/error.tsx
    login/page.tsx
    preview/[[...segments]]/page.tsx
    globals.css
  actions/business.ts
  components/
    layout/app-shell.tsx
    workbench.tsx
    operational.tsx
    record-form.tsx
    action-dialog.tsx
    status-badge.tsx
    theme-toggle.tsx
    ui/button.tsx
    ui/dialog.tsx
    ui/confirm-dialog.tsx
  lib/
    modules.ts
    validation.ts
    workspace.ts
    format.ts
    supabase/
  types/index.ts
  proxy.ts
supabase/
  migrations/
  install-workspace.sql
  setup-workspace.sql
scripts/test-database.mjs
```

## Migrations e dados anteriores

- `202609160001_initial_schema.sql`: versão original; mantida para o histórico.
- `202609170001_shared_workspace.sql`: perfis, workspaces, membros, CRM, catálogo, campanhas, agenda, financeiro e regras de acesso.
- `202609170002_business_rules.sql`: atribuição por canal, validação comercial, cobranças e execuções automáticas, pacotes e comunicação.
- `202609170003_payment_and_legacy_assets.sql`: pausa ao desfazer pagamento inicial e suporte aos arquivos antigos.
- `202609170004_book_club_conversion.sql`: conversão transacional do mês do clube em campanha.

As tabelas antigas são movidas para o schema restrito `legacy_v1`, sem apagar registros. Clientes viram autoras; campanhas, serviços, execuções, pagamentos vinculados e tarefas mantêm seus IDs. Campanhas antigas ativas entram pausadas para revisão de capa/pagamento. Materiais vinculados continuam acessíveis pelo bucket privado anterior.

**Registros antigos sem campanha (pagamentos e materiais) ficam preservados em `legacy_v1` para conciliação manual**, pois o novo modelo exige campanha. Não exclua esse schema até conferir a migração. Se as integrantes tinham dados isolados, os workspaces anteriores continuam separados até uma migração deliberada. O seletor de workspace aparece quando a conta participa de mais de um.

## Storage

A instalação cria `business-assets` privado, com políticas de membership:

```text
{workspace_id}/campaigns/{campaign_id}/{uuid}-{filename}
{workspace_id}/media-kits/{uuid}-{filename}
{workspace_id}/books/{uuid}-{filename}
```

Uploads aceitam JPG, PNG, WebP e PDF, conforme o módulo, até **3 MB por arquivo**. Esse limite mantém uploads via Server Actions compatíveis com a hospedagem prevista. Links externos não têm limite de tamanho do arquivo.

Imagens e documentos são abertos com signed URLs de 10 minutos. Somente caminhos e metadados são persistidos. A exclusão usa a API Storage; não remove diretamente `storage.objects`. Se a limpeza do arquivo falhar após excluir o registro, a interface avisa que o administrador precisa limpar o arquivo restante.

## Uso diário

1. Cadastre autora/editora e contatos. Cadastre o livro, sua capa e a origem.
2. Crie a oportunidade; o canal determina a responsável, que pode ser alterada.
3. Registre contatos, follow-ups, versão do media kit e itens da proposta.
4. Aprove e use **Converter em campanha**. Escolha 100% antecipado ou 50/50.
5. No Financeiro, edite a primeira cobrança para **Pago**, informando data real e forma.
6. Use **Iniciar produção**. Adicione serviços do catálogo ou nome personalizado; as ocorrências surgem automaticamente.
7. Em Serviços/Execuções, distribua datas, conclua e desfaça. Reduções de quantidade pedem confirmação e bloqueiam remoção de concluídas.
8. Registre materiais na aba da campanha e confira o histórico da autora/editora.
9. Use os calendários anuais para leitura coletiva e clube. **Divulgar vaga** preenche mês/ano de um template salvo; copiar não envia mensagens automaticamente.
10. No clube, escolha livro e contato da editora, registre a comunicação e crie a campanha do mês.
11. Respostas padrão permitem editar, substituir variáveis e copiar o texto.
12. Temas claro, escuro e sistema ficam em Configurações.

## Verificação

```bash
npm run lint
npm run typecheck
npm run test:db
node scripts/test-database.mjs --fresh
npm run build
```

O teste de banco executa PostgreSQL em memória via PGlite exclusivamente em desenvolvimento, com schemas mínimos de Auth/Storage. Ele verifica as migrations, RLS, integridade entre workspaces, pagamentos, bloqueio de IA, geração de ocorrências, pacotes, leitura coletiva, conversão do clube e respostas. **Não é banco da aplicação nem substitui a validação final no Supabase real.**

A prévia visual foi testada em desktop e mobile, com temas claro/escuro, formulários e aviso de alterações não salvas. O fluxo autenticado e upload real precisam ser verificados após configurar banco e contas.

## Vercel

Depois de aprovar a revisão local:

1. Envie o repositório ao Git e importe na Vercel (framework Next.js).
2. Configure em Preview e Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Execute as migrations e configure as integrantes antes de usar a implantação.
4. No Supabase Auth, configure Site URL com o domínio de produção e as URLs de redirecionamento apropriadas para localhost/Preview/Production.
5. Build command: `npm run build`. Instalação: `npm ci`. Saída padrão do Next.js. Não configure `NEXT_DIST_DIR` na Vercel.
6. Teste login, acesso compartilhado das duas contas, logout, bloqueio sem sessão, cobranças, produção e upload de imagem/PDF.

Nenhum push ou deploy faz parte da revisão local atual. Não há seed comercial obrigatório ou credenciais hardcoded.
