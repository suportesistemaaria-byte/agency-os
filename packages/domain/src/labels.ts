/** Rótulos e listas sem dependência de servidor: usados no navegador e no servidor. */
import type { schema as s } from '@aos/db';

type ActivityType = (typeof s.activityType.enumValues)[number];
type TaskStatus = (typeof s.taskStatus.enumValues)[number];
type Priority = (typeof s.priority.enumValues)[number];
type RequestType = (typeof s.requestType.enumValues)[number];
type RequestStatus = (typeof s.requestStatus.enumValues)[number];
type Stage = (typeof s.contentStage.enumValues)[number];
type ClockStatus = (typeof s.slaStatus.enumValues)[number];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  meeting: 'Reunião',
  followup: 'Follow-up',
  proposal: 'Envio de proposta',
  note: 'Observação',
  task: 'Tarefa',
  negotiation: 'Negociação',
};
export const TEAM_FUNCTIONS: Record<string, string> = {
  atendimento: 'Atendimento',
  estrategista: 'Estratégia',
  social_media: 'Social media',
  copy: 'Copy',
  design: 'Design',
  editor: 'Edição de vídeo',
  trafego: 'Tráfego',
};
export const CLIENT_STATUS_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  active: 'Ativo',
  attention: 'Atenção',
  critical: 'Crítico',
  paused: 'Pausado',
  churned: 'Encerrado',
};
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Bloqueada',
  review: 'Em revisão',
  done: 'Concluída',
  cancelled: 'Cancelada',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};
export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  arte_estatica: 'Arte estática',
  arte_impresso: 'Arte para impresso',
  video: 'Vídeo',
  alteracao: 'Alteração',
  fotos_editadas: 'Fotos editadas',
  cardapio: 'Cardápio',
  catalogo: 'Catálogo',
  outro: 'Outro',
};
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  received: 'Recebida',
  triage: 'Triagem',
  assigned: 'Responsável',
  in_production: 'Em produção',
  review: 'Revisão',
  client_approval: 'Aprovação',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};
/** Fluxo aprovado: Recebida → Triagem → Responsável → Em produção → Revisão → Aprovação → Entregue. */
export const REQUEST_FLOW: RequestStatus[] = [
  'received',
  'triage',
  'assigned',
  'in_production',
  'review',
  'client_approval',
  'delivered',
];
export const STAGE_LABEL: Record<Stage, string> = {
  idea: 'Ideia',
  planning: 'Planejamento',
  production: 'Em produção',
  copy: 'Copy',
  design: 'Design',
  internal_review: 'Revisão interna',
  client_approval: 'Aprovação do cliente',
  change_requested: 'Alteração',
  approved: 'Aprovado',
  scheduled: 'Agendado',
  posted: 'Postado',
};
export const STAGES = Object.keys(STAGE_LABEL) as Stage[];
export const PLATFORMS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'Google'];
export const FORMATS = ['Post', 'Carrossel', 'Reels', 'Stories', 'Vídeo', 'Anúncio'];
export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  issued: 'A receber',
  paid: 'Pago',
  partially_paid: 'Parcial',
  overdue: 'Atrasado',
  cancelled: 'Cancelado',
};
/** Rótulos exibidos (handoff, Bloco 4). */
export const SLA_LABEL: Record<ClockStatus, string> = {
  on_time: 'No prazo',
  near_due: 'Próximo',
  overdue: 'Atrasado',
  paused: 'Pausado',
  blocked: 'Bloqueado',
  met: 'Cumprido',
  missed: 'Entregue com atraso',
};

/** Métricas suportadas (rótulo, se entra no engajamento e se é estoque/saldo em vez de soma). */
export const METRICS: Record<string, { label: string; engagement?: boolean; stock?: boolean }> = {
  followers: { label: 'Seguidores', stock: true },
  reach: { label: 'Alcance' },
  impressions: { label: 'Impressões' },
  likes: { label: 'Curtidas', engagement: true },
  comments: { label: 'Comentários', engagement: true },
  shares: { label: 'Compartilhamentos', engagement: true },
  saves: { label: 'Salvamentos', engagement: true },
  video_views: { label: 'Visualizações de vídeo' },
  clicks: { label: 'Cliques' },
  leads: { label: 'Leads' },
};
