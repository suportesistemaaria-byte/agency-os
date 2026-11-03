export interface NavItem {
  href: string;
  label: string;
  icon: string;
  perm?: string;
}
export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Grupos da sidebar (protótipo, direção D). A interface só esconde o que o servidor já bloqueia. */
export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/hoje', label: 'Hoje', icon: 'today' },
      { href: '/painel', label: 'Painel executivo', icon: 'dashboard', perm: 'reports.view' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/comercial', label: 'Dashboard', icon: 'chart', perm: 'comercial.view' },
      { href: '/comercial/pipeline', label: 'Pipeline', icon: 'kanban', perm: 'comercial.view' },
      { href: '/comercial/leads', label: 'Leads', icon: 'search', perm: 'comercial.view' },
      { href: '/comercial/propostas', label: 'Propostas', icon: 'file', perm: 'comercial.view' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { href: '/clientes', label: 'Carteira', icon: 'building', perm: 'clientes.view' },
      { href: '/clientes/onboarding', label: 'Onboarding', icon: 'rocket', perm: 'clientes.view' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/conteudos', label: 'Conteúdos', icon: 'image', perm: 'conteudo.view' },
      { href: '/aprovacoes', label: 'Aprovações', icon: 'check', perm: 'conteudo.view' },
      { href: '/solicitacoes', label: 'Solicitações', icon: 'inbox', perm: 'requests.view' },
      { href: '/tarefas', label: 'Tarefas', icon: 'list', perm: 'tasks.view' },
      { href: '/calendario', label: 'Calendário', icon: 'calendar' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/campanhas', label: 'Campanhas', icon: 'flag', perm: 'conteudo.view' },
      { href: '/equipe', label: 'Equipe', icon: 'users', perm: 'members.manage' },
      { href: '/reunioes', label: 'Reuniões', icon: 'event' },
      { href: '/arquivos', label: 'Arquivos', icon: 'folder', perm: 'clientes.view' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/financeiro', label: 'Visão geral', icon: 'bank', perm: 'financeiro.view' },
      { href: '/financeiro/receber', label: 'Receitas · a receber', icon: 'in', perm: 'financeiro.view' },
      { href: '/financeiro/despesas', label: 'Despesas · a pagar', icon: 'out', perm: 'financeiro.view' },
      { href: '/financeiro/fluxo-de-caixa', label: 'Fluxo de caixa', icon: 'trend', perm: 'financeiro.view' },
      { href: '/financeiro/inadimplencia', label: 'Inadimplência', icon: 'alert', perm: 'financeiro.view' },
      { href: '/financeiro/contratos', label: 'Contratos', icon: 'contract', perm: 'financeiro.view' },
    ],
  },
  {
    label: 'Inteligência',
    items: [{ href: '/inteligencia', label: 'Performance', icon: 'trend', perm: 'reports.view' }],
  },
  {
    label: 'Conhecimento',
    items: [{ href: '/conhecimento', label: 'Base da agência', icon: 'book' }],
  },
];

export const CRUMB: Record<string, string> = {
  hoje: 'Hoje',
  painel: 'Painel executivo',
  comercial: 'Comercial',
  pipeline: 'Pipeline',
  leads: 'Leads',
  propostas: 'Propostas',
  oportunidades: 'Oportunidade',
  clientes: 'Clientes',
  onboarding: 'Onboarding',
  conteudos: 'Conteúdos',
  aprovacoes: 'Aprovações',
  solicitacoes: 'Solicitações',
  tarefas: 'Tarefas',
  calendario: 'Calendário',
  equipe: 'Equipe',
  campanhas: 'Campanhas',
  reunioes: 'Reuniões',
  arquivos: 'Arquivos',
  financeiro: 'Financeiro',
  receber: 'Receitas · a receber',
  despesas: 'Despesas · a pagar',
  contratos: 'Contratos',
  'fluxo-de-caixa': 'Fluxo de caixa',
  inadimplencia: 'Inadimplência',
  configuracoes: 'Configurações',
  usuarios: 'Usuários',
  cargos: 'Cargos e permissões',
  sla: 'Expediente e SLA',
  inteligencia: 'Inteligência',
  conhecimento: 'Conhecimento',
};
