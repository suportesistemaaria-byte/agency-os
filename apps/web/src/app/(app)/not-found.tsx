import { Empty, LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <Empty title="Não encontrado">
      O registro não existe ou foi removido.{' '}
      <LinkButton href="/hoje" className="mt-3">
        Voltar para Hoje
      </LinkButton>
    </Empty>
  );
}
