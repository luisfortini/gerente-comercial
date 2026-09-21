import { describe, expect, it } from 'vitest';
import { agruparComprasPorDia, analisarRecompra, calcularPrioridade, calcularQueda, classificarPrioridade, mediana } from '../src/domain/analytics.js';

describe('motor de oportunidades', () => {
  it('calcula mediana para conjuntos pares e ímpares', () => {
    expect(mediana([9, 1, 5])).toBe(5);
    expect(mediana([1, 3, 7, 9])).toBe(5);
  });
  it('exige ao menos três compras', () => {
    expect(analisarRecompra([{ data: new Date('2026-01-01'), valor: 10 }, { data: new Date('2026-01-21'), valor: 10 }], new Date('2026-03-01'))).toBeNull();
  });
  it('identifica recompra atrasada pela mediana e tolerância', () => {
    const compras = ['2026-01-01','2026-01-21','2026-02-10'].map(data => ({ data: new Date(data), valor: 100 }));
    expect(analisarRecompra(compras, new Date('2026-03-13'))).toMatchObject({ intervaloTipico: 20, tolerancia: 7, diasSemComprar: 31, atrasoDias: 11 });
  });
  it('classifica a pontuação nas faixas documentadas', () => {
    expect(classificarPrioridade(49)).toBe('BAIXA'); expect(classificarPrioridade(50)).toBe('MEDIA'); expect(classificarPrioridade(80)).toBe('ALTA');
    expect(calcularPrioridade({ atrasoDias: 60, intervaloTipico: 20, compras: 20, valorMedio: 10000, quedaPercentual: 60, produtoRecorrente: true })).toBe(100);
  });
  it('compara os dois blocos consecutivos de 90 dias', () => {
    const hoje = new Date('2026-07-01T12:00:00Z');
    const queda = calcularQueda([
      { data: new Date('2026-05-01T12:00:00Z'), valor: 600 },
      { data: new Date('2026-02-15T12:00:00Z'), valor: 1000 },
    ], hoje);
    expect(queda).toEqual({ atual: 600, anterior: 1000, percentual: 40 });
  });
  it('consolida vários pedidos do mesmo dia em um evento de recompra', () => {
    const compras = agruparComprasPorDia([
      { data: new Date('2026-01-01T10:00:00Z'), valor: 100, quantidade: 2 },
      { data: new Date('2026-01-01T18:00:00Z'), valor: 50, quantidade: 1 },
      { data: new Date('2026-01-21T12:00:00Z'), valor: 80, quantidade: 2 },
    ]);
    expect(compras).toHaveLength(2);
    expect(compras[0]).toMatchObject({ valor: 150, quantidade: 3, precoUnitario: 50 });
  });
});
