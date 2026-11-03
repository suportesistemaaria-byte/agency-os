import { Empty } from '@/components/ui';

export default function NoPermission() {
  return (
    <Empty title="Sem permissão">
      Seu perfil não tem acesso a esta área. Se precisar, peça ao Admin uma exceção individual.
    </Empty>
  );
}
