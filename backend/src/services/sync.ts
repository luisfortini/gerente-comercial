import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { consultarSirius } from './sirius.js';
import { siriusSessions } from './sirius-session.js';
import { agruparComprasPorDia, analisarRecompra, calcularPrioridade, calcularQueda, classificarPrioridade, GeradorResumoPorTemplate } from '../domain/analytics.js';
import { env } from '../config/env.js';
import { dividirPorMes } from '../domain/periods.js';
import { indexarItensPorVenda, normalizarItensVenda } from '../domain/sales-items.js';

function parseDate(value: unknown): Date {
  if (typeof value === 'number') return new Date(value);
  const text = String(value ?? '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  const date = br ? new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`) : new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: ${text}`);
  return date;
}
const num = (v: unknown) => Number(v ?? 0);
const json = (v: unknown) => v as Prisma.InputJsonValue;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function sincronizar(usuarioId: string, input: { dataInicial: Date; dataFinal: Date; filial: number; vendedores?: number[]; apenasErros?: boolean }) {
  const config = await prisma.configuracaoSirius.findUnique({ where: { usuarioId } });
  const sessao = siriusSessions.get(usuarioId);
  if (!config || !sessao) throw new AppError(401, 'Reconecte ao Sírius antes de sincronizar');
  const resultadoVendedores = await consultarSirius('vendedores', config, sessao.token);
  for (const raw of (Array.isArray(resultadoVendedores.data) ? resultadoVendedores.data : []) as Record<string, unknown>[]) {
    const codigo = num(raw.colaboradorCodigoVendedor);
    if (!codigo) continue;
    await prisma.vendedor.upsert({ where: { codigoExterno_filialCodigo: { codigoExterno: codigo, filialCodigo: input.filial } }, update: { nome: String(raw.razaoSocialVendedor || `Vendedor ${codigo}`), email: raw.emailVendedor ? String(raw.emailVendedor) : null, telefone: raw.telefone1Vendedor ? String(raw.telefone1Vendedor) : null, dadosOriginaisJson: json(raw), sincronizadoEm: new Date() }, create: { codigoExterno: codigo, filialCodigo: input.filial, nome: String(raw.razaoSocialVendedor || `Vendedor ${codigo}`), email: raw.emailVendedor ? String(raw.emailVendedor) : null, telefone: raw.telefone1Vendedor ? String(raw.telefone1Vendedor) : null, dadosOriginaisJson: json(raw) } });
  }
  const execucoes = [];
  for (const periodo of dividirPorMes(input.dataInicial, input.dataFinal)) {
    if (input.apenasErros) {
      const falhou = await prisma.execucaoSincronizacao.findFirst({ where: { dataInicial: periodo.inicio, dataFinal: periodo.fim, status: 'FALHA' } });
      if (!falhou) continue;
    }
    const execucao = await prisma.execucaoSincronizacao.create({ data: { dataInicial: periodo.inicio, dataFinal: periodo.fim, filialCodigo: input.filial, status: 'EM_ANDAMENTO' } });
    try {
      // O modo 0 retorna os pedidos que possuem correspondência integral em vendasproduto.
      // O modo 1 retorna notas sem listaItens e sem chave compatível com esse relatório complementar.
      const filtro = { codigoFilial: input.filial, dataInicial: iso(periodo.inicio), dataFinal: iso(periodo.fim), dataemissaoOuEntrega: 0, faturadosNota: 0, vendedorLogado: 0, vendedorSelecionado: input.vendedores?.length === 1 ? input.vendedores[0] : 0, codigoCliente: 0, produto: 0, fabricanteProduto: 0, relatorioResumido: 0 };
      const [vendas, vendasProduto] = await Promise.all([
        consultarSirius('vendas', config, sessao.token, filtro),
        consultarSirius('vendaProduto', config, sessao.token, filtro),
      ]);
      const rows = (Array.isArray(vendas.data) ? vendas.data : []) as Record<string, unknown>[];
      const itensPorVenda = indexarItensPorVenda((Array.isArray(vendasProduto.data) ? vendasProduto.data : []) as Record<string, unknown>[], input.filial);
      let salvos = 0;
      for (const raw of rows) {
        const vendedorCodigo = num(raw.codigoVendedor);
        if (input.vendedores?.length && !input.vendedores.includes(vendedorCodigo)) continue;
        const clienteCodigo = num(raw.codigoCliente);
        if (!clienteCodigo) continue;
        const vendedor = vendedorCodigo ? await prisma.vendedor.findUnique({ where: { codigoExterno_filialCodigo: { codigoExterno: vendedorCodigo, filialCodigo: input.filial } } }) : null;
        const cliente = await prisma.cliente.upsert({ where: { codigoExterno_filialCodigo: { codigoExterno: clienteCodigo, filialCodigo: input.filial } }, update: { razaoSocial: String(raw.razaoCliente || ''), nomeFantasia: String(raw.fantasiaCliente || ''), vendedorId: vendedor?.id, dadosOriginaisJson: json(raw), sincronizadoEm: new Date() }, create: { codigoExterno: clienteCodigo, filialCodigo: input.filial, razaoSocial: String(raw.razaoCliente || ''), nomeFantasia: String(raw.fantasiaCliente || ''), vendedorId: vendedor?.id, dadosOriginaisJson: json(raw) } });
        const numero = String(raw.numero ?? ''); const serie = String(raw.serie ?? ''); const dataEmissao = parseDate(raw.dataEmissao);
        const chaveExterna = `${input.filial}:${serie}:${numero}:${clienteCodigo}`;
        const venda = await prisma.venda.upsert({ where: { chaveExterna }, update: { dataEmissao, valorTotal: num(raw.valorTotal), clienteId: cliente.id, vendedorId: vendedor?.id, modoRelatorio: 0, dadosOriginaisJson: json(raw), sincronizadoEm: new Date() }, create: { chaveExterna, numero, serie, naturezaOperacao: String(raw.naturezaOperacao || ''), dataEmissao, clienteId: cliente.id, vendedorId: vendedor?.id, filialCodigo: input.filial, modoRelatorio: 0, valorTotal: num(raw.valorTotal), dadosOriginaisJson: json(raw) } });
        const itens = normalizarItensVenda(raw, itensPorVenda, input.filial);
        const produtosSincronizados: string[] = [];
        for (const item of itens) {
          const produto = await prisma.produto.upsert({ where: { codigoExterno: item.codigo }, update: { descricao: item.descricao, fabricante: item.fabricante, dadosOriginaisJson: json(item.dadosOriginais), sincronizadoEm: new Date() }, create: { codigoExterno: item.codigo, descricao: item.descricao, fabricante: item.fabricante, dadosOriginaisJson: json(item.dadosOriginais) } });
          produtosSincronizados.push(produto.id);
          const quantidade = item.quantidade; const total = item.valorTotal;
          await prisma.itemVenda.upsert({ where: { vendaId_produtoId: { vendaId: venda.id, produtoId: produto.id } }, update: { quantidade, valorTotal: total, valorUnitario: quantidade ? total / quantidade : total, dadosOriginaisJson: json(item.dadosOriginais) }, create: { vendaId: venda.id, produtoId: produto.id, quantidade, valorTotal: total, valorUnitario: quantidade ? total / quantidade : total, dadosOriginaisJson: json(item.dadosOriginais) } });
        }
        if (produtosSincronizados.length) await prisma.itemVenda.deleteMany({ where: { vendaId: venda.id, produtoId: { notIn: produtosSincronizados } } });
        salvos++;
      }
      await prisma.execucaoSincronizacao.update({ where: { id: execucao.id }, data: { status: 'CONCLUIDA', registrosRecebidos: rows.length, registrosSalvos: salvos, finalizadaEm: new Date() } });
      execucoes.push({ id: execucao.id, status: 'CONCLUIDA', recebidos: rows.length, salvos });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message.slice(0, 1000) : 'Falha desconhecida';
      await prisma.execucaoSincronizacao.update({ where: { id: execucao.id }, data: { status: 'FALHA', mensagemErro: mensagem, finalizadaEm: new Date() } });
      execucoes.push({ id: execucao.id, status: 'FALHA', erro: mensagem });
    }
  }
  await recalcularOportunidades();
  return execucoes;
}

export async function recalcularOportunidades(hoje = new Date()) {
  const clientes = await prisma.cliente.findMany({ include: { vendas: { where: { modoRelatorio: 0 }, include: { itens: true }, orderBy: { dataEmissao: 'asc' } } } });
  const gerador = new GeradorResumoPorTemplate();
  for (const cliente of clientes) {
    const compras = agruparComprasPorDia(cliente.vendas.map(v => ({ data: v.dataEmissao, valor: Number(v.valorTotal) })));
    const analise = analisarRecompra(compras, hoje);
    const chaveCliente = `recompra-cliente:${cliente.id}`;
    if (analise) {
      const valorMedio = compras.reduce((s, c) => s + c.valor, 0) / compras.length;
      const pontos = calcularPrioridade({ atrasoDias: analise.atrasoDias, intervaloTipico: analise.intervaloTipico, compras: compras.length, valorMedio });
      const resumo = await gerador.gerarResumo({ cliente: cliente.nomeFantasia || cliente.razaoSocial || `Cliente ${cliente.codigoExterno}`, analise });
      const data = { tipo: 'RECOMPRA_CLIENTE' as const, prioridade: classificarPrioridade(pontos), pontuacao: pontos, clienteId: cliente.id, vendedorId: cliente.vendedorId, titulo: 'Recompra atrasada', explicacao: resumo.texto, ultimaCompraEm: cliente.vendas.at(-1)?.dataEmissao, diasSemComprar: analise.diasSemComprar, intervaloMedioDias: analise.intervaloTipico, atrasoDias: analise.atrasoDias, valorPotencial: valorMedio };
      await prisma.oportunidadeComercial.upsert({ where: { chaveAnalitica: chaveCliente }, update: data, create: { chaveAnalitica: chaveCliente, ...data } });
    } else await prisma.oportunidadeComercial.deleteMany({ where: { chaveAnalitica: chaveCliente, status: 'NOVA' } });
    const porProduto = new Map<string, typeof cliente.vendas>();
    for (const venda of cliente.vendas) for (const item of venda.itens) porProduto.set(item.produtoId, [...(porProduto.get(item.produtoId) ?? []), venda]);
    for (const [produtoId, vendas] of porProduto) {
      const comprasProduto = agruparComprasPorDia(vendas.map(v => { const item = v.itens.find(i => i.produtoId === produtoId)!; return { data: v.dataEmissao, valor: Number(item.valorTotal), quantidade: Number(item.quantidade), precoUnitario: Number(item.valorUnitario) }; }));
      const a = analisarRecompra(comprasProduto, hoje);
      const chaveProduto = `recompra-produto:${cliente.id}:${produtoId}`;
      if (!a) { await prisma.oportunidadeComercial.deleteMany({ where: { chaveAnalitica: chaveProduto, status: 'NOVA' } }); continue; }
      const produto = await prisma.produto.findUnique({ where: { id: produtoId } }); if (!produto) continue;
      const pontos = calcularPrioridade({ atrasoDias: a.atrasoDias, intervaloTipico: a.intervaloTipico, compras: comprasProduto.length, valorMedio: comprasProduto.reduce((s,c)=>s+c.valor,0)/comprasProduto.length, produtoRecorrente: true });
      const resumo = await gerador.gerarResumo({ cliente: cliente.nomeFantasia || cliente.razaoSocial || `Cliente ${cliente.codigoExterno}`, produto: produto.descricao, analise: a });
      const data = { tipo: 'RECOMPRA_PRODUTO' as const, prioridade: classificarPrioridade(pontos), pontuacao: pontos, clienteId: cliente.id, vendedorId: cliente.vendedorId, produtoId, titulo: 'Produto com recompra atrasada', explicacao: resumo.texto, ultimaCompraEm: vendas.at(-1)?.dataEmissao, diasSemComprar: a.diasSemComprar, intervaloMedioDias: a.intervaloTipico, atrasoDias: a.atrasoDias, quantidadeMedia: a.quantidadeSugerida, quantidadeSugerida: a.quantidadeSugerida, valorPotencial: a.valorPotencial };
      await prisma.oportunidadeComercial.upsert({ where: { chaveAnalitica: chaveProduto }, update: data, create: { chaveAnalitica: chaveProduto, ...data } });
    }
    const queda = calcularQueda(compras, hoje);
    const chaveQueda = `queda-cliente:${cliente.id}`;
    if (queda.anterior >= env.QUEDA_VOLUME_MINIMO && queda.percentual > env.QUEDA_PERCENTUAL) {
      const valorMedio = compras.length ? compras.reduce((s, c) => s + c.valor, 0) / compras.length : 0;
      const pontos = calcularPrioridade({ compras: compras.length, valorMedio, quedaPercentual: queda.percentual });
      const nome = cliente.nomeFantasia || cliente.razaoSocial || `Cliente ${cliente.codigoExterno}`;
      const explicacao = `${nome} faturou ${queda.atual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} nos últimos 90 dias, contra ${queda.anterior.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} nos 90 dias anteriores. A queda calculada é de ${queda.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.`;
      const data = { tipo: 'CLIENTE_EM_QUEDA' as const, prioridade: classificarPrioridade(pontos), pontuacao: pontos, clienteId: cliente.id, vendedorId: cliente.vendedorId, titulo: 'Cliente em queda', explicacao, ultimaCompraEm: cliente.vendas.at(-1)?.dataEmissao, valorPotencial: Math.max(0, queda.anterior - queda.atual) };
      await prisma.oportunidadeComercial.upsert({ where: { chaveAnalitica: chaveQueda }, update: data, create: { chaveAnalitica: chaveQueda, ...data } });
    } else await prisma.oportunidadeComercial.deleteMany({ where: { chaveAnalitica: chaveQueda, status: 'NOVA' } });
  }
}
