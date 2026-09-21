export type Compra = { data: Date; valor: number; quantidade?: number; precoUnitario?: number };
export type AnaliseRecompra = { intervaloTipico: number; tolerancia: number; diasSemComprar: number; atrasoDias: number; quantidadeSugerida?: number; valorPotencial?: number };

export function agruparComprasPorDia(compras: Compra[]) {
  const dias = new Map<string, Compra>();
  for (const compra of compras) {
    const chave = compra.data.toISOString().slice(0, 10);
    const atual = dias.get(chave) ?? { data: compra.data, valor: 0, quantidade: 0 };
    atual.valor += compra.valor;
    if (typeof compra.quantidade === 'number') atual.quantidade = (atual.quantidade ?? 0) + compra.quantidade;
    dias.set(chave, atual);
  }
  return [...dias.values()].map(compra => ({
    ...compra,
    precoUnitario: compra.quantidade ? compra.valor / compra.quantidade : undefined,
  })).sort((a, b) => a.data.getTime() - b.data.getTime());
}

export function mediana(valores: number[]) {
  if (!valores.length) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function diferencaDias(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function analisarRecompra(compras: Compra[], hoje = new Date()): AnaliseRecompra | null {
  if (compras.length < 3) return null;
  const ordenadas = [...compras].sort((a, b) => a.data.getTime() - b.data.getTime());
  const intervalos = ordenadas.slice(1).map((c, i) => diferencaDias(ordenadas[i].data, c.data));
  const intervaloTipico = Math.round(mediana(intervalos));
  const tolerancia = Math.max(7, Math.round(intervaloTipico * 0.25));
  const diasSemComprar = diferencaDias(ordenadas.at(-1)!.data, hoje);
  if (diasSemComprar <= intervaloTipico + tolerancia) return null;
  const quantidades = ordenadas.map(c => c.quantidade).filter((x): x is number => typeof x === 'number');
  const quantidadeSugerida = quantidades.length ? mediana(quantidades.slice(-5)) : undefined;
  const preco = [...ordenadas].reverse().find(c => c.precoUnitario)?.precoUnitario;
  return { intervaloTipico, tolerancia, diasSemComprar, atrasoDias: diasSemComprar - intervaloTipico, quantidadeSugerida, valorPotencial: quantidadeSugerida && preco ? quantidadeSugerida * preco : undefined };
}

export function calcularQueda(compras: Compra[], hoje = new Date()) {
  const inicioAtual = new Date(hoje); inicioAtual.setDate(inicioAtual.getDate() - 90);
  const inicioAnterior = new Date(hoje); inicioAnterior.setDate(inicioAnterior.getDate() - 180);
  const atual = compras.filter(c => c.data >= inicioAtual && c.data <= hoje).reduce((s, c) => s + c.valor, 0);
  const anterior = compras.filter(c => c.data >= inicioAnterior && c.data < inicioAtual).reduce((s, c) => s + c.valor, 0);
  return { atual, anterior, percentual: anterior > 0 ? ((anterior - atual) / anterior) * 100 : 0 };
}

export function calcularPrioridade(input: { atrasoDias?: number; intervaloTipico?: number; compras: number; valorMedio: number; quedaPercentual?: number; produtoRecorrente?: boolean }) {
  const atraso = Math.min(30, ((input.atrasoDias ?? 0) / Math.max(input.intervaloTipico ?? 30, 1)) * 30);
  const frequencia = Math.min(20, input.compras * 2);
  const valor = Math.min(20, Math.log10(Math.max(input.valorMedio, 1)) * 5);
  const queda = Math.min(20, Math.max(0, input.quedaPercentual ?? 0) * 0.4);
  const recorrencia = input.produtoRecorrente ? 10 : 0;
  return Math.round(Math.min(100, atraso + frequencia + valor + queda + recorrencia));
}

export function classificarPrioridade(pontos: number): 'ALTA' | 'MEDIA' | 'BAIXA' {
  return pontos >= 80 ? 'ALTA' : pontos >= 50 ? 'MEDIA' : 'BAIXA';
}

export interface GeradorResumoComercial {
  gerarResumo(dados: { cliente: string; analise: AnaliseRecompra; produto?: string }): Promise<{ texto: string }>;
}

export class GeradorResumoPorTemplate implements GeradorResumoComercial {
  async gerarResumo({ cliente, analise, produto }: { cliente: string; analise: AnaliseRecompra; produto?: string }) {
    const complemento = analise.quantidadeSugerida ? ` A quantidade típica é ${analise.quantidadeSugerida.toLocaleString('pt-BR')}${analise.valorPotencial ? `, com potencial estimado de ${analise.valorPotencial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}.` : '';
    return { texto: `${cliente}${produto ? ` costuma recomprar ${produto}` : ' costuma comprar'} a cada ${analise.intervaloTipico} dias e está há ${analise.diasSemComprar} dias sem comprar. O atraso atual é de ${analise.atrasoDias} dias.${complemento}` };
  }
}
