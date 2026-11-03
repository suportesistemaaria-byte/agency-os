import { describe, expect, it } from 'vitest';
import { aggregateMonthly, parseMetricsCsv } from './performance';

describe('importação de métricas por CSV', () => {
  const contents = [{ id: '11111111-1111-1111-1111-111111111111', title: 'Reels prato do dia' }];
  it('aceita ponto e vírgula, data brasileira, decimal com vírgula e conteúdo pelo título', () => {
    const rows = parseMetricsCsv(
      'Data;Métrica;Valor;Conteúdo\n05/11/2026;reach;1.234,5;Reels prato do dia\n2026-11-06;likes;80;',
      contents,
    );
    expect(rows).toEqual([
      { date: '2026-11-05', metric: 'reach', value: 1234.5, contentId: contents[0]!.id, platform: null },
      { date: '2026-11-06', metric: 'likes', value: 80, contentId: null, platform: null },
    ]);
  });
  it('aceita vírgula como separador e cabeçalho em inglês', () => {
    expect(
      parseMetricsCsv('date,metric,value,platform\n2026-10-01,followers,5200,Instagram', [])[0],
    ).toMatchObject({ metric: 'followers', value: 5200, platform: 'Instagram' });
  });
  it('aponta a linha com conteúdo desconhecido e exige o cabeçalho mínimo', () => {
    expect(() =>
      parseMetricsCsv('data;metrica;valor;conteudo\n2026-11-01;likes;1;Inexistente', contents),
    ).toThrow(/Linha 2/);
    expect(() => parseMetricsCsv('dia;valor\n2026-11-01;1', [])).toThrow(/cabeçalho/i);
    expect(() => parseMetricsCsv('data;metrica;valor', [])).toThrow();
  });
});

describe('agregação mensal', () => {
  const rows = [
    { metric: 'reach', value: '100', date: '2026-10-03', contentId: null },
    { metric: 'reach', value: '50', date: '2026-10-20', contentId: null },
    { metric: 'reach', value: '999', date: '2026-10-20', contentId: 'c1' },
    { metric: 'followers', value: '1000', date: '2026-10-01', contentId: null },
    { metric: 'followers', value: '1040', date: '2026-10-31', contentId: null },
    { metric: 'likes', value: '30', date: '2026-10-10', contentId: null },
    { metric: 'comments', value: '5', date: '2026-10-10', contentId: null },
    { metric: 'reach', value: '70', date: '2026-11-02', contentId: null },
  ];
  const m = aggregateMonthly(rows, ['2026-10', '2026-11']);
  it('soma métricas de fluxo e ignora as de conteúdo nos totais do perfil', () => {
    expect(m['2026-10']!.reach).toBe(150);
    expect(m['2026-11']!.reach).toBe(70);
  });
  it('estoque (seguidores) usa o último valor do mês', () => {
    expect(m['2026-10']!.followers).toBe(1040);
  });
  it('engajamento = curtidas + comentários + compartilhamentos + salvamentos', () => {
    expect(m['2026-10']!.engagement).toBe(35);
  });
});
