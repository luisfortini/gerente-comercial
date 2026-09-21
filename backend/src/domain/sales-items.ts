export type Registro = Record<string, unknown>;

export type ItemVendaNormalizado = {
  codigo: number;
  descricao: string;
  quantidade: number;
  valorTotal: number;
  fabricante?: string;
  dadosOriginais: Registro[];
};

function numero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dataChave(value: unknown) {
  const text = String(value ?? '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return text.slice(0, 10);
}

export function chaveVendaItens(venda: Registro, filialPadrao: number) {
  const filial = numero(venda.filial) || filialPadrao;
  const vendedor = numero(venda.codigoVendedor);
  const pedido = String(venda.numeroPedido ?? venda.numero ?? '');
  const emissao = dataChave(venda.emissaoPedido ?? venda.dataEmissao);
  return `${filial}:${vendedor}:${pedido}:${emissao}`;
}

export function indexarItensPorVenda(registros: Registro[], filialPadrao: number) {
  const indice = new Map<string, Registro[]>();
  for (const registro of registros) {
    const chave = chaveVendaItens(registro, filialPadrao);
    indice.set(chave, [...(indice.get(chave) ?? []), registro]);
  }
  return indice;
}

export function normalizarItensVenda(venda: Registro, itensComplementares: Map<string, Registro[]>, filialPadrao: number) {
  const itensOriginais = Array.isArray(venda.listaItens) && venda.listaItens.length
    ? venda.listaItens as Registro[]
    : itensComplementares.get(chaveVendaItens(venda, filialPadrao)) ?? [];
  const resultado = new Map<number, ItemVendaNormalizado>();

  for (const item of itensOriginais) {
    const codigo = numero(item.codigoItem ?? item.codigoProduto);
    if (!codigo) continue;
    const quantidade = numero(item.quantidadeItem ?? item.qtdItensPedido ?? item.quantidadeVendida);
    const valorTotal = numero(item.valorItem ?? item.valorTotalItens ?? item.precoFinal);
    const atual = resultado.get(codigo) ?? {
      codigo,
      descricao: String(item.descricaoItem ?? item.descricaoProduto ?? `Produto ${codigo}`),
      quantidade: 0,
      valorTotal: 0,
      fabricante: item.fabricante ? String(item.fabricante) : undefined,
      dadosOriginais: [],
    };
    atual.quantidade += quantidade;
    atual.valorTotal += valorTotal;
    atual.dadosOriginais.push(item);
    resultado.set(codigo, atual);
  }

  return [...resultado.values()];
}
