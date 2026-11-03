import { Empty, PageHeader } from '@/components/ui';

export default function Page() {
  return (
    <div>
      <PageHeader title="Painel executivo" />
      <Empty title="Chega no Bloco 9 (Gestão)">
        Esta área já aparece na navegação para o layout ficar completo; as funcionalidades entram depois do
        CHECKPOINT 1.
      </Empty>
    </div>
  );
}
