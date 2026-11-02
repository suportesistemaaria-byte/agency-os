/** Catálogo inicial de permissões (V3, seção 5). Persistido na tabela permissions pelo seed. */
export const PERMISSIONS = {
  'comercial.view': 'Ver comercial',
  'comercial.edit': 'Editar comercial',
  'clientes.view': 'Ver clientes',
  'clientes.edit': 'Editar clientes',
  'conteudo.view': 'Ver conteúdos',
  'conteudo.create': 'Criar e editar conteúdos',
  'conteudo.approve': 'Aprovar conteúdo internamente',
  'conteudo.approve_on_behalf': 'Aprovar em nome do cliente (com justificativa)',
  'tasks.view': 'Ver tarefas',
  'tasks.edit': 'Editar tarefas',
  'requests.view': 'Ver solicitações',
  'requests.edit': 'Editar solicitações',
  'sla.override': 'Alterar prazo de SLA manualmente',
  'financeiro.view': 'Ver financeiro',
  'financeiro.edit': 'Editar financeiro',
  'reports.view': 'Ver relatórios',
  'members.manage': 'Gerenciar membros e cargos',
  'settings.manage': 'Gerenciar configurações',
  'audit.view': 'Ver auditoria',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
type Grant = [PermissionKey, 'all' | 'team' | 'own'];
const all = (...k: PermissionKey[]): Grant[] => k.map((p) => [p, 'all']);
const team = (...k: PermissionKey[]): Grant[] => k.map((p) => [p, 'team']);
const own = (...k: PermissionKey[]): Grant[] => k.map((p) => [p, 'own']);
const ALL_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Cargos de sistema (editáveis por workspace). Matriz da V3, seção 5. */
export const SYSTEM_ROLES: Record<string, { name: string; grants: Grant[] }> = {
  admin: { name: 'Admin', grants: all(...ALL_KEYS) },
  gestor: { name: 'Gestor', grants: all(...ALL_KEYS.filter((k) => k !== 'financeiro.edit' && k !== 'settings.manage')) },
  comercial: { name: 'Comercial', grants: [...all('comercial.view', 'comercial.edit', 'clientes.view'), ...own('tasks.view', 'tasks.edit')] },
  atendimento: { name: 'Atendimento', grants: [...all('comercial.view'), ...team('clientes.view', 'clientes.edit', 'conteudo.view', 'conteudo.create', 'tasks.view', 'tasks.edit', 'requests.view', 'requests.edit')] },
  estrategista: { name: 'Estrategista', grants: team('clientes.view', 'conteudo.view', 'conteudo.create', 'tasks.view', 'tasks.edit', 'requests.view') },
  social_media: { name: 'Social media', grants: team('clientes.view', 'conteudo.view', 'conteudo.create', 'tasks.view', 'tasks.edit', 'requests.view') },
  copywriter: { name: 'Copywriter', grants: [...team('clientes.view', 'conteudo.view', 'conteudo.create'), ...own('tasks.view', 'tasks.edit')] },
  designer: { name: 'Designer', grants: [...team('clientes.view', 'conteudo.view', 'conteudo.create'), ...own('tasks.view', 'tasks.edit')] },
  editor: { name: 'Editor', grants: [...team('clientes.view', 'conteudo.view', 'conteudo.create'), ...own('tasks.view', 'tasks.edit')] },
  trafego: { name: 'Tráfego', grants: [...team('clientes.view', 'conteudo.view', 'reports.view'), ...own('tasks.view', 'tasks.edit')] },
  financeiro: { name: 'Financeiro', grants: [...all('financeiro.view', 'financeiro.edit', 'clientes.view', 'reports.view'), ...own('tasks.view', 'tasks.edit')] },
};
