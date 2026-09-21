export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "integer"
  | "money"
  | "date"
  | "datetime-local"
  | "time"
  | "select"
  | "checkbox"
  | "package-items"
  | "relation"
  | "member";
export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  source?: string;
  persist?: boolean;
}
export interface Module {
  table: string;
  route: string;
  title: string;
  description: string;
  label: string;
  fields: Field[];
}
export type Row = {
  id: string;
  workspace_id: string;
  [key: string]: string | number | boolean | string[] | null;
};
export const options: Record<string, Record<string, string>> = {
  channel: {
    email: "E-mail",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    x_twitter: "X/Twitter",
    other: "Outro",
  },
  cover: {
    unknown: "A confirmar",
    confirmed_human: "Confirmada • sem IA",
    confirmed_ai: "Produzida por IA",
    replaced: "Capa substituída",
  },
  contact: {
    author: "Autora",
    publisher: "Editora",
  },
  opportunity: {
    new: "Nova",
    negotiating: "Em negociação",
    waiting_data: "Aguardando dados",
    awaiting_payment: "Aguardando pagamento",
    in_production: "Em produção",
    delivered: "Finalizada / entregue",
    lost: "Não fechada",
    cancelled: "Cancelada",
  },
  proposal: {
    media_kit: "Media kit",
    custom: "Personalizada",
    loyalty: "Fidelização",
  },
  contractItemKind: {
    service: "Serviço avulso",
    package: "Plano mensal",
  },
  direction: {
    incoming: "Recebido",
    outgoing: "Enviado",
  },
  campaign: {
    advertising: "Publicidade",
    custom: "Personalizada",
    collective_reading: "Leitura coletiva",
    book_club: "Clube presencial",
    other: "Outra",
  },
  campaignStatus: {
    draft: "Rascunho",
    awaiting_payment: "Aguardando pagamento",
    active: "Em produção",
    paused: "Pausada",
    completed: "Concluída",
    cancelled: "Cancelada",
  },
  plan: {
    full_upfront: "100% antecipado",
    half_and_half: "50% sinal + 50% entrega",
    monthly_full: "Mensalidade integral",
  },
  paymentPlanAction: {
    keep: "Manter cobranças atuais",
    rebuild_pending: "Recriar cobranças pendentes",
    rebuild_all: "Recriar todas as cobranças, inclusive recebidas",
  },
  occurrence: {
    pending: "Pendente",
    in_progress: "Em andamento",
    in_revision: "Em alteração",
    completed: "Concluído",
    cancelled: "Cancelado",
  },
  schedule: {
    to_confirm: "A confirmar",
    scheduled: "Data definida",
  },
  mediaKitSent: {
    no: "Não",
    yes: "Sim",
  },
  payment: {
    pending: "Pendente",
    paid: "Pago",
    cancelled: "Cancelado",
  },
  method: {
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    bank_transfer: "Transferência",
    cash: "Dinheiro",
    other: "Outro",
  },
  month: {
    "1": "Janeiro",
    "2": "Fevereiro",
    "3": "Março",
    "4": "Abril",
    "5": "Maio",
    "6": "Junho",
    "7": "Julho",
    "8": "Agosto",
    "9": "Setembro",
    "10": "Outubro",
    "11": "Novembro",
    "12": "Dezembro",
  },
  reading: {
    available: "Disponível",
    prospecting: "Prospecção",
    reserved: "Reservado",
    confirmed: "Confirmado",
    completed: "Concluído",
    cancelled: "Cancelado",
  },
  club: {
    planning: "Planejamento",
    book_selected: "Livro escolhido",
    contact_pending: "Contato pendente",
    contacted: "Contato realizado",
    confirmed: "Confirmado",
    completed: "Concluído",
    cancelled: "Cancelado",
  },
  priority: {
    medium: "Média",
    high: "Alta",
    low: "Baixa",
  },
  task: {
    pending: "Pendente",
    in_progress: "Em andamento",
    in_revision: "Em alteração",
    completed: "Concluída",
    cancelled: "Cancelada",
  },
  category: {
    "Media Kit": "Media Kit",
    "Primeiro Contato": "Primeiro Contato",
    "Follow-up": "Follow-up",
    Orçamento: "Orçamento",
    Pagamento: "Pagamento",
    "Dados do Livro": "Dados do Livro",
    "Política sobre IA": "Política sobre IA",
    "Leitura Coletiva": "Leitura Coletiva",
    "Clube do Livro": "Clube do Livro",
    Agradecimento: "Agradecimento",
    Outro: "Outro",
  },
  templateChannel: {
    all: "Todos",
    email: "E-mail",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    x_twitter: "X/Twitter",
  },
  asset: {
    link: "Link",
    image: "Imagem",
    document: "Documento",
  },
};
export const modules: Module[] = [
  {
    table: "authors",
    route: "autoras",
    title: "Autoras",
    description: "Dados de contato, livros e campanhas por autora.",
    label: "name",
    fields: [
      {
        name: "name",
        label: "Nome",
        type: "text",
        required: true,
      },
      {
        name: "pen_name",
        label: "Nome artístico",
        type: "text",
        required: false,
      },
      {
        name: "email",
        label: "E-mail",
        type: "email",
        required: false,
      },
      {
        name: "whatsapp",
        label: "WhatsApp",
        type: "text",
        required: false,
      },
      {
        name: "instagram",
        label: "Instagram",
        type: "text",
        required: false,
      },
      {
        name: "x_twitter",
        label: "X/Twitter",
        type: "text",
        required: false,
      },
      {
        name: "preferred_contact_channel",
        label: "Canal preferido",
        type: "select",
        required: false,
        source: "channel",
      },
      {
        name: "website",
        label: "Site",
        type: "url",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    table: "publishers",
    route: "editoras",
    title: "Editoras",
    description: "Parcerias, contatos e trabalhos realizados.",
    label: "name",
    fields: [
      {
        name: "name",
        label: "Nome",
        type: "text",
        required: true,
      },
      {
        name: "website",
        label: "Site",
        type: "url",
        required: false,
      },
      {
        name: "instagram",
        label: "Instagram",
        type: "text",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
      {
        name: "contact_name",
        label: "Nome do contato",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "contact_role_or_department",
        label: "Cargo / departamento",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "contact_email",
        label: "E-mail do contato",
        type: "email",
        required: false,
        persist: false,
      },
      {
        name: "contact_whatsapp",
        label: "WhatsApp / telefone",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "contact_instagram",
        label: "Instagram",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "contact_x_twitter",
        label: "X/Twitter",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "contact_preferred_channel",
        label: "Canal preferido",
        type: "select",
        required: false,
        source: "channel",
        persist: false,
      },
    ],
  },
  {
    table: "publisher_contacts",
    route: "contatos",
    title: "Contatos",
    description: "Responsáveis pelo atendimento em cada editora.",
    label: "name",
    fields: [
      {
        name: "publisher_id",
        label: "Editora",
        type: "relation",
        required: true,
        source: "publishers",
      },
      {
        name: "name",
        label: "Nome",
        type: "text",
        required: true,
      },
      {
        name: "role_or_department",
        label: "Cargo / departamento",
        type: "text",
        required: false,
      },
      {
        name: "email",
        label: "E-mail",
        type: "email",
        required: false,
      },
      {
        name: "whatsapp",
        label: "WhatsApp",
        type: "text",
        required: false,
      },
      {
        name: "instagram",
        label: "Instagram",
        type: "text",
        required: false,
      },
      {
        name: "x_twitter",
        label: "X/Twitter",
        type: "text",
        required: false,
      },
      {
        name: "preferred_contact_channel",
        label: "Canal preferido",
        type: "select",
        required: false,
        source: "channel",
      },
      {
        name: "last_contact_at",
        label: "Último contato",
        type: "datetime-local",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    table: "books",
    route: "livros",
    title: "Livros",
    description: "Informações essenciais, capa e links do livro.",
    label: "title",
    fields: [
      {
        name: "title",
        label: "Título",
        type: "text",
        required: true,
      },
      {
        name: "author_id",
        label: "Autora",
        type: "relation",
        required: false,
        source: "authors",
      },
      { name: "publisher_id", label: "Editora", type: "relation", required: false, source: "publishers" },
      {
        name: "publisher_id",
        label: "Editora",
        type: "relation",
        required: false,
        source: "publishers",
      },
      {
        name: "new_publisher_name",
        label: "Nova editora (opcional)",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "synopsis",
        label: "Sinopse",
        type: "textarea",
        required: false,
      },
      {
        name: "purchase_url",
        label: "Link de compra",
        type: "url",
        required: false,
      },
      {
        name: "cover_external_url",
        label: "Link da capa",
        type: "url",
        required: false,
      },
      {
        name: "images_url",
        label: "Link de imagens / ilustrações",
        type: "url",
        required: false,
      },
      {
        name: "tropes",
        label: "Tropes",
        type: "text",
        required: false,
      },
      {
        name: "additional_fields",
        label: "Outros",
        type: "textarea",
        required: false,
      },
      {
        name: "release_year",
        label: "Ano de lançamento",
        type: "integer",
        required: false,
      },
    ],
  },
  {
    table: "opportunities",
    route: "oportunidades",
    title: "Oportunidades",
    description: "Negociações, propostas e acompanhamento comercial.",
    label: "name",
    fields: [
      {
        name: "name",
        label: "Identificação (gerada pela autora e livro)",
        type: "text",
        required: false,
        persist: false,
      },
      {
        name: "contact_type",
        label: "Tipo de contato",
        type: "select",
        required: false,
        source: "contact",
      },
      {
        name: "author_id",
        label: "Autora",
        type: "relation",
        required: true,
        source: "authors",
      },
      {
        name: "book_id",
        label: "Livro",
        type: "relation",
        required: true,
        source: "books",
      },
      {
        name: "source_channel",
        label: "Canal de origem",
        type: "select",
        required: true,
        source: "channel",
      },
      { name: "media_kit_notes", label: "Media kit", type: "textarea", required: false },
      {
        name: "status",
        label: "Etapa",
        type: "select",
        required: true,
        source: "opportunity",
      },
      {
        name: "ai_cover_policy_informed",
        label: "Política sobre IA informada",
        type: "checkbox",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  { table: "opportunity_services", route: "servicos-oportunidade", title: "Serviços contratados", description: "Serviços e planos desta oportunidade.", label: "id", fields: [
    { name: "opportunity_id", label: "Oportunidade", type: "relation", required: true, source: "opportunities" },
    { name: "item_kind", label: "Tipo", type: "select", required: true, source: "contractItemKind" },
    { name: "service_type_id", label: "Serviço avulso", type: "relation", required: false, source: "service_types" },
    { name: "service_package_id", label: "Plano mensal", type: "relation", required: false, source: "service_packages" },
    { name: "quantity", label: "Quantidade", type: "integer", required: true },
    { name: "unit_price", label: "Valor unitário / mensal", type: "money", required: true },
    { name: "duration_months", label: "Meses do plano", type: "integer", required: false },
    { name: "payment_terms", label: "Pagamento", type: "select", required: true, source: "plan" },
    { name: "selected_package_item_ids", label: "Serviços incluídos no plano", type: "package-items", required: false },
    { name: "notes", label: "Observações", type: "textarea", required: false },
  ] },
  {
    table: "communication_logs",
    route: "comunicacoes",
    title: "Comunicações",
    description: "Timeline dos contatos comerciais.",
    label: "summary",
    fields: [
      {
        name: "opportunity_id",
        label: "Oportunidade",
        type: "relation",
        required: false,
        source: "opportunities",
      },
      {
        name: "author_id",
        label: "Autora",
        type: "relation",
        required: false,
        source: "authors",
      },
      {
        name: "publisher_id",
        label: "Editora",
        type: "relation",
        required: false,
        source: "publishers",
      },
      {
        name: "publisher_contact_id",
        label: "Contato",
        type: "relation",
        required: false,
        source: "publisher_contacts",
      },
      {
        name: "channel",
        label: "Canal",
        type: "select",
        required: true,
        source: "channel",
      },
      {
        name: "direction",
        label: "Direção",
        type: "select",
        required: true,
        source: "direction",
      },
      {
        name: "contacted_at",
        label: "Data do contato",
        type: "datetime-local",
        required: true,
      },
      {
        name: "summary",
        label: "Resumo",
        type: "textarea",
        required: true,
      },
      {
        name: "next_follow_up_at",
        label: "Próximo retorno",
        type: "datetime-local",
        required: false,
      },
    ],
  },
  {
    table: "media_kits",
    route: "media-kits",
    title: "Media kit",
    description: "Versões e material comercial.",
    label: "name",
    fields: [
      {
        name: "name",
        label: "Nome",
        type: "text",
        required: true,
      },
      {
        name: "version",
        label: "Versão",
        type: "text",
        required: true,
      },
      {
        name: "year",
        label: "Ano",
        type: "integer",
        required: true,
      },
      {
        name: "description",
        label: "Descrição",
        type: "textarea",
        required: false,
      },
      {
        name: "external_url",
        label: "Link externo",
        type: "url",
        required: false,
      },
      {
        name: "active",
        label: "Versão ativa",
        type: "checkbox",
        required: false,
      },
      {
        name: "register_sent",
        label: "Registrar como enviada",
        type: "checkbox",
        required: false,
        persist: false,
      },
      {
        name: "sent_opportunity_id",
        label: "Vincular à oportunidade",
        type: "relation",
        source: "opportunities",
        required: false,
        persist: false,
      },
      {
        name: "sent_channel",
        label: "Canal de envio",
        type: "select",
        source: "channel",
        required: false,
        persist: false,
      },
    ],
  },
  {
    table: "service_types",
    route: "servicos",
    title: "Catálogo de serviços",
    description: "Modelos e valores padrão; não representa serviços contratados.",
    label: "name",
    fields: [
      {
        name: "name",
        label: "Nome",
        type: "text",
        required: true,
      },
      {
        name: "description",
        label: "Descrição",
        type: "textarea",
        required: false,
      },
      {
        name: "default_price",
        label: "Preço padrão",
        type: "money",
        required: true,
      },
      {
        name: "active",
        label: "Ativo",
        type: "checkbox",
        required: false,
      },
    ],
  },
  {
    table: "service_packages",
    route: "pacotes",
    title: "Pacotes de fidelização",
    description: "Serviços recorrentes com condições especiais.",
    label: "name",
    fields: [
      {
        name: "name",
        label: "Nome",
        type: "text",
        required: true,
      },
      {
        name: "description",
        label: "Descrição",
        type: "textarea",
        required: false,
      },
      {
        name: "duration_months",
        label: "Duração sugerida em meses",
        type: "integer",
        required: true,
      },
      {
        name: "regular_price",
        label: "Preço regular",
        type: "money",
        required: false,
      },
      {
        name: "package_price",
        label: "Valor mensal",
        type: "money",
        required: true,
      },
      {
        name: "active",
        label: "Ativo",
        type: "checkbox",
        required: false,
      },
    ],
  },
  {
    table: "service_package_items",
    route: "itens-pacote",
    title: "Itens do pacote",
    description: "Defina os serviços de cada mês.",
    label: "id",
    fields: [
      {
        name: "package_id",
        label: "Pacote",
        type: "relation",
        required: true,
        source: "service_packages",
      },
      {
        name: "service_type_id",
        label: "Serviço",
        type: "relation",
        required: true,
        source: "service_types",
      },
      {
        name: "book_id",
        label: "Livro relacionado",
        type: "relation",
        required: false,
        source: "books",
      },
      {
        name: "quantity_per_month",
        label: "Quantidade por mês",
        type: "integer",
        required: true,
      },
      {
        name: "choice_group",
        label: "Grupo de escolha (opcional)",
        type: "text",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    table: "service_occurrences",
    route: "execucoes",
    title: "Execuções",
    description: "Uma data para cada repetição.",
    label: "sequence_number",
    fields: [
      {
        name: "opportunity_service_id",
        label: "Serviço contratado",
        type: "relation",
        required: true,
        source: "opportunity_services",
      },
      { name: "sequence_number", label: "Repetição", type: "integer", required: true },
      {
        name: "schedule_status",
        label: "Agendamento",
        type: "select",
        required: true,
        source: "schedule",
      },
      {
        name: "scheduled_date",
        label: "Data",
        type: "date",
        required: false,
      },
      {
        name: "scheduled_time",
        label: "Horário",
        type: "time",
        required: false,
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        source: "occurrence",
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
      {
        name: "assigned_to",
        label: "Responsável pela execução",
        type: "member",
        required: false,
      },
    ],
  },
  {
    table: "payments",
    route: "financeiro",
    title: "Financeiro",
    description: "Pagamentos recebidos, previstos e em atraso.",
    label: "description",
    fields: [
      {
        name: "opportunity_service_id",
        label: "Serviço contratado",
        type: "relation",
        required: true,
        source: "opportunity_services",
      },
      {
        name: "description",
        label: "Descrição",
        type: "text",
        required: false,
      },
      {
        name: "installment_number",
        label: "Parcela",
        type: "integer",
        required: true,
      },
      {
        name: "amount",
        label: "Valor",
        type: "money",
        required: true,
      },
      {
        name: "due_date",
        label: "Previsão",
        type: "date",
        required: true,
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        source: "payment",
      },
      {
        name: "paid_at",
        label: "Recebimento real",
        type: "datetime-local",
        required: false,
      },
      {
        name: "payment_method",
        label: "Forma de pagamento",
        type: "select",
        required: false,
        source: "method",
      },
      {
        name: "payment_method_custom",
        label: "Outra forma de pagamento",
        type: "text",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    table: "collective_reading_slots",
    route: "leitura-coletiva",
    title: "Leitura coletiva",
    description: "Reservas mensais e programação das leituras.",
    label: "month",
    fields: [
      {
        name: "year",
        label: "Ano",
        type: "integer",
        required: true,
      },
      {
        name: "month",
        label: "Mês",
        type: "select",
        required: true,
        source: "month",
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        source: "reading",
      },
      {
        name: "author_id",
        label: "Autora",
        type: "relation",
        required: false,
        source: "authors",
      },
      {
        name: "book_id",
        label: "Livro",
        type: "relation",
        required: false,
        source: "books",
      },
      {
        name: "contact_started_at",
        label: "Contato iniciado",
        type: "datetime-local",
        required: false,
      },
      {
        name: "confirmed_at",
        label: "Confirmado em",
        type: "datetime-local",
        required: false,
      },
      {
        name: "announcement_published_at",
        label: "Anúncio publicado em",
        type: "datetime-local",
        required: false,
      },
      {
        name: "announcement_channel",
        label: "Canal do anúncio",
        type: "select",
        required: false,
        source: "channel",
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    table: "book_club_slots",
    route: "clube-presencial",
    title: "Clube presencial",
    description: "Livros selecionados, editoras e datas dos encontros.",
    label: "month",
    fields: [
      {
        name: "year",
        label: "Ano",
        type: "integer",
        required: true,
      },
      {
        name: "month",
        label: "Mês",
        type: "select",
        required: true,
        source: "month",
      },
      {
        name: "status",
        label: "Etapa",
        type: "select",
        required: true,
        source: "club",
      },
      {
        name: "book_id",
        label: "Livro",
        type: "relation",
        required: false,
        source: "books",
      },
      {
        name: "publisher_contact_id",
        label: "Contato da editora",
        type: "relation",
        required: false,
        source: "publisher_contacts",
      },
      {
        name: "responsible_user_id",
        label: "Responsável",
        type: "member",
        required: false,
      },
      {
        name: "contact_started_at",
        label: "Primeiro contato",
        type: "datetime-local",
        required: false,
      },
      {
        name: "proposal_sent_at",
        label: "Proposta enviada",
        type: "datetime-local",
        required: false,
      },
      {
        name: "confirmed_at",
        label: "Confirmação",
        type: "datetime-local",
        required: false,
      },
      {
        name: "notes",
        label: "Observações",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    table: "tasks",
    route: "tarefas",
    title: "Tarefas",
    description: "Espaço para organizar a rotina da equipe.",
    label: "title",
    fields: [
      {
        name: "title",
        label: "Título",
        type: "text",
        required: true,
      },
      {
        name: "description",
        label: "Descrição",
        type: "textarea",
        required: false,
      },
      {
        name: "assigned_to",
        label: "Responsável",
        type: "member",
        required: false,
      },
      {
        name: "due_date",
        label: "Data",
        type: "date",
        required: true,
      },
      {
        name: "due_time",
        label: "Horário",
        type: "time",
        required: false,
      },
      {
        name: "priority",
        label: "Prioridade",
        type: "select",
        required: true,
        source: "priority",
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        source: "task",
      },
      {
        name: "related_opportunity_id",
        label: "Oportunidade",
        type: "relation",
        required: false,
        source: "opportunities",
      },
    ],
  },
  {
    table: "response_templates",
    route: "respostas",
    title: "Respostas padrão",
    description: "Modelos de mensagens para atendimento aos clientes.",
    label: "title",
    fields: [
      {
        name: "title",
        label: "Título",
        type: "text",
        required: true,
      },
      {
        name: "category",
        label: "Categoria",
        type: "select",
        required: true,
        source: "category",
      },
      {
        name: "channel",
        label: "Canal",
        type: "select",
        required: true,
        source: "templateChannel",
      },
      {
        name: "content",
        label:
          "Texto • variáveis: {nome}, {autora}, {livro}, {editora}, {valor}, {mes}, {ano}",
        type: "textarea",
        required: true,
      },
      {
        name: "active",
        label: "Ativa",
        type: "checkbox",
        required: false,
      },
    ],
  },
  {
    table: "client_assets",
    route: "materiais",
    title: "Materiais",
    description: "Arquivos e links produzidos para cada trabalho.",
    label: "title",
    fields: [
      {
        name: "author_id",
        label: "Autora",
        type: "relation",
        required: false,
        source: "authors",
      },
      {
        name: "publisher_id",
        label: "Editora",
        type: "relation",
        required: false,
        source: "publishers",
      },
      {
        name: "book_id",
        label: "Livro",
        type: "relation",
        required: false,
        source: "books",
      },
      {
        name: "service_occurrence_id",
        label: "Execução",
        type: "relation",
        required: false,
        source: "service_occurrences",
      },
      {
        name: "title",
        label: "Título",
        type: "text",
        required: true,
      },
      {
        name: "description",
        label: "Descrição",
        type: "textarea",
        required: false,
      },
      {
        name: "asset_type",
        label: "Tipo",
        type: "select",
        required: true,
        source: "asset",
      },
      {
        name: "external_url",
        label: "Link externo",
        type: "url",
        required: false,
      },
    ],
  },
  {
    table: "channel_assignments",
    route: "canais",
    title: "Canais",
    description: "Distribuição dos contatos da equipe.",
    label: "channel",
    fields: [
      {
        name: "channel",
        label: "Canal",
        type: "select",
        required: true,
        source: "channel",
      },
      {
        name: "responsible_user_id",
        label: "Responsável",
        type: "member",
        required: true,
      },
    ],
  },
];
export function moduleByRoute(route: string) {
  return modules.find((m) => m.route === route);
}
export function moduleByTable(table: string) {
  return modules.find((m) => m.table === table);
}
export const primaryModules = [
  "authors",
  "publishers",
  "publisher_contacts",
  "books",
  "opportunities",
];
export const ACTIVE_OPPORTUNITY_STATUSES = new Set([
  "new",
  "negotiating",
  "waiting_data",
  "awaiting_payment",
  "in_production",
]);
export const isActiveOpportunity = (row: Row) =>
  !row.archived_at && ACTIVE_OPPORTUNITY_STATUSES.has(String(row.status));
export const labelOf = (row: Row, table: string): string => {
  const label = String(
    row[moduleByTable(table)?.label ?? "name"] ||
      row.custom_name ||
      row.description ||
      row.name ||
      row.title ||
      row.id.slice(0, 8),
  );
  return table === "media_kits" && row.year
    ? label + " — " + String(row.year)
    : label;
};
export const memberLabel = (member?: Partial<Row> | null) =>
  String(member?.username || member?.full_name || member?.email || "—");
