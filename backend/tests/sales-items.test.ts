import { describe, expect, it } from 'vitest';
import { indexarItensPorVenda, normalizarItensVenda } from '../src/domain/sales-items.js';

describe('itens complementares de vendas', () => {
  const venda = { numero: 42, codigoVendedor: 7, dataEmissao: '2026-08-20', listaItens: null };
  const complementares = [
    { filial: 1, numeroPedido: 42, codigoVendedor: 7, emissaoPedido: '2026-08-20', codigoProduto: 10, descricaoProduto: 'Produto A', qtdItensPedido: 2, valorTotalItens: 30, fabricante: 'Fábrica' },
    { filial: 1, numeroPedido: 42, codigoVendedor: 7, emissaoPedido: '2026-08-20', codigoProduto: 10, descricaoProduto: 'Produto A', qtdItensPedido: 1, valorTotalItens: 15, fabricante: 'Fábrica' },
  ];

  it('associa pelo pedido, vendedor, filial e data e consolida produtos repetidos', () => {
    const itens = normalizarItensVenda(venda, indexarItensPorVenda(complementares, 1), 1);
    expect(itens).toMatchObject([{ codigo: 10, quantidade: 3, valorTotal: 45, fabricante: 'Fábrica' }]);
  });

  it('prefere listaItens quando o endpoint principal a fornece', () => {
    const itens = normalizarItensVenda({ ...venda, listaItens: [{ codigoItem: 20, descricaoItem: 'Produto direto', quantidadeItem: 4, valorItem: 80 }] }, indexarItensPorVenda(complementares, 1), 1);
    expect(itens).toMatchObject([{ codigo: 20, quantidade: 4, valorTotal: 80 }]);
  });
});
