import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { consultarAgendaSirius, inserirAgendaSirius } from './sirius.js';
import { siriusSessions } from './sirius-session.js';
import { diaLocal, hora, instante, normalizarAgenda, planejarAgenda, podeAgendar, regrasSchema, somarDias, type Candidato, type Ocupacao, type RegrasAgenda, type Sugestao } from '../domain/agenda.js';

type DadosPlano = { regras: RegrasAgenda; itens: (Sugestao & { codigoExterno: number })[]; naoAgendados: Candidato[]; existentes: number; vendedorCodigo: number; vendedorNome: string; liberados?: number[] };
const json = (data: unknown) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
const destinoDe = (url: string, filial: number) => `${url.replace(/\/$/, '')}|${filial}`;
export async function contexto(usuarioId: string, vendedorId: string) {
  const config = await prisma.configuracaoSirius.findUnique({ where: { usuarioId } });
  const sessao = siriusSessions.get(usuarioId);
  if (!config || !sessao) throw new AppError(401, 'Conecte-se ao Sírius antes de gerar a agenda.');
  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor?.ativo || vendedor.filialCodigo !== config.filialCodigo || sessao.filialCodigo !== config.filialCodigo) throw new AppError(400, 'Escolha um vendedor ativo da filial conectada.');
  return { config, sessao, vendedor, destino: destinoDe(config.urlBase, config.filialCodigo) };
}
export async function candidatosAgenda(vendedorId: string, clienteIds: string[] = []): Promise<Candidato[]> {
  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor?.ativo) throw new AppError(400, 'Vendedor inválido.');
  const clientes = await prisma.cliente.findMany({ where: { vendedorId, filialCodigo: vendedor.filialCodigo, ...(clienteIds.length ? { id: { in: clienteIds } } : { oportunidades: { some: { status: { in: ['NOVA', 'EM_ANALISE', 'ENCAMINHADA'] } } } }) }, include: { oportunidades: { where: { status: { in: ['NOVA', 'EM_ANALISE', 'ENCAMINHADA'] } }, orderBy: { pontuacao: 'desc' } } } });
  if (clienteIds.length && clientes.length !== new Set(clienteIds).size) throw new AppError(400, 'Há clientes fora da carteira ou da filial do vendedor.');
  return clientes.map(c => ({ id: c.id, codigo: c.codigoExterno, nome: c.nomeFantasia || c.razaoSocial || `Cliente ${c.codigoExterno}`, cidade: c.cidade || '', pontuacao: c.oportunidades[0]?.pontuacao ?? 0, motivo: c.oportunidades[0]?.titulo ?? 'Contato selecionado manualmente' }));
}
async function ocupacaoRemota(ctx: Awaited<ReturnType<typeof contexto>>, r: RegrasAgenda) {
  const resposta = await consultarAgendaSirius(ctx.config, ctx.sessao.token, ctx.vendedor.codigoExterno, somarDias(r.inicio, -r.intervaloClienteDias), somarDias(r.fim, r.intervaloClienteDias));
  try { return normalizarAgenda(resposta.data, ctx.vendedor.codigoExterno); }
  catch { throw new AppError(502, 'Não foi possível interpretar a agenda existente do Sírius. A geração foi bloqueada para evitar conflitos.'); }
}
export async function reservas(db: Prisma.TransactionClient, destino: string, vendedorId: string, remotos: Ocupacao[], ignorar?: string, ignorarExterno?: number) {
  const planos = await db.planoAgenda.findMany({ where: { destino, vendedorId, estado: { in: ['ENVIANDO', 'CONCLUIDO', 'INCERTO'] }, ...(ignorar ? { id: { not: ignorar } } : {}) } });
  const todos = [...remotos];
  for (const plano of planos) {
    const dados = plano.dados as unknown as DadosPlano;
    for (const item of dados.itens) {
      if (dados.liberados?.includes(item.codigoExterno) || (ignorarExterno && item.codigoExterno === ignorarExterno)) continue;
      if (!todos.some(a => a.cliente === item.codigo && a.dia === item.dia && a.inicio === item.inicio && a.fim === item.fim)) todos.push({ ...item, cliente: item.codigo });
    }
  }
  const acoes = await db.acaoAgenda.findMany({ where: { destino, vendedorId, estado: { in: ['ENVIANDO', 'CONCLUIDO', 'INCERTO'] } } });
  for (const acao of acoes) {
    const dados = acao.dados as unknown as { ocupacao?: Ocupacao; codigoExterno?: number; liberada?: boolean };
    const item = dados.ocupacao;
    if (!item || dados.liberada || (ignorarExterno && dados.codigoExterno === ignorarExterno)) continue;
    if (!todos.some(a => a.cliente === item.cliente && a.dia === item.dia && a.inicio === item.inicio && a.fim === item.fim)) todos.push(item);
  }
  return todos;
}
export async function previaAgenda(usuarioId: string, body: unknown) {
  const regras = regrasSchema.parse(body);
  if (regras.inicio < diaLocal(new Date())) throw new AppError(400, 'Escolha hoje ou uma data futura.');
  const ctx = await contexto(usuarioId, regras.vendedorId);
  const candidatos = await candidatosAgenda(regras.vendedorId, regras.clienteIds);
  const remotos = await ocupacaoRemota(ctx, regras);
  const ocupados = await reservas(prisma, ctx.destino, regras.vendedorId, remotos);
  const plano = planejarAgenda(candidatos, ocupados, regras);
  const usados = new Set<number>();
  const dados: DadosPlano = { ...plano, regras, itens: plano.itens.map(i => {
    let codigoExterno: number; do { codigoExterno = randomInt(1, 2147483647); } while (usados.has(codigoExterno)); usados.add(codigoExterno);
    return { ...i, codigoExterno };
  }), existentes: ocupados.filter(a => a.dia >= regras.inicio && a.dia <= regras.fim).length, vendedorCodigo: ctx.vendedor.codigoExterno, vendedorNome: ctx.vendedor.nome };
  return prisma.planoAgenda.create({ data: { usuarioId, destino: ctx.destino, vendedorId: regras.vendedorId, dados: json(dados) } });
}
export async function confirmarAgenda(usuarioId: string, id: string) {
  const plano = await prisma.planoAgenda.findFirst({ where: { id, usuarioId } });
  if (!plano) throw new AppError(404, 'Prévia não encontrada.');
  if (plano.estado !== 'PREVIA') return plano;
  if (Date.now() - plano.criadoEm.getTime() > 30 * 60000) throw new AppError(409, 'A prévia expirou. Gere uma nova prévia.');
  const dados = plano.dados as unknown as DadosPlano;
  if (!dados.itens.length) throw new AppError(400, 'Não há agendamentos viáveis para enviar.');
  const ctx = await contexto(usuarioId, plano.vendedorId);
  if (ctx.destino !== plano.destino || ctx.vendedor.codigoExterno !== dados.vendedorCodigo) throw new AppError(409, 'A conexão ou o vendedor mudou. Gere uma nova prévia.');
  await candidatosAgenda(plano.vendedorId, dados.itens.map(i => i.id));
  // Trava compartilhada pelo banco: duas instâncias não reservam a mesma capacidade.
  const iniciou = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.destino + '|' + plano.vendedorId}))::text`;
    const atual = await tx.planoAgenda.findUniqueOrThrow({ where: { id } });
    if (atual.estado !== 'PREVIA') return false;
    const remotos = await ocupacaoRemota(ctx, dados.regras);
    const ocupados = await reservas(tx, ctx.destino, plano.vendedorId, remotos, id);
    for (const item of dados.itens) {
      const ocupacao = { ...item, cliente: item.codigo };
      if (!podeAgendar(ocupacao, ocupados, dados.regras)) throw new AppError(409, 'A disponibilidade mudou. Gere outra prévia para respeitar os compromissos e limites atuais.');
      ocupados.push(ocupacao);
    }
    await tx.planoAgenda.update({ where: { id }, data: { estado: 'ENVIANDO' } });
    return true;
  }, { timeout: 150000, maxWait: 10000 });
  if (!iniciou) return prisma.planoAgenda.findUniqueOrThrow({ where: { id } });
  // Estado persistido antes da chamada. Timeout/crash não autoriza reenvio automático.
  try {
    const resposta = await inserirAgendaSirius(ctx.config, ctx.sessao.token, dados.itens.map(i => ({ cliente: i.codigo, clienteNovo: 0, codigoExterno: i.codigoExterno, vendedor: dados.vendedorCodigo, dataAgendaLong: instante(i.dia, '00:00'), horaInicioAgenda: hora(i.inicio), horaFimAgenda: hora(i.fim), tipoInteracao: dados.regras.tipoInteracao, sequenciaRota: 0, observacao: `[Gerente Comercial ${id}] ${i.motivo}. Duração: ${dados.regras.duracao} min.` })));
    const retorno = z.array(z.object({ codigo: z.number().int().positive(), codigoExterno: z.number().int(), vendedor: z.number().int() })).parse(resposta.data);
    const completo = retorno.length === dados.itens.length && dados.itens.every(i => retorno.filter(r => r.codigoExterno === i.codigoExterno && r.vendedor === dados.vendedorCodigo).length === 1);
    return await prisma.planoAgenda.update({ where: { id }, data: { estado: completo ? 'CONCLUIDO' : 'INCERTO', resultado: json({ registros: retorno, mensagem: completo ? 'Agendamentos confirmados pelo Sírius.' : 'Retorno parcial ou divergente. Confira no Sírius; este lote não será reenviado.' }) } });
  } catch {
    return prisma.planoAgenda.update({ where: { id }, data: { estado: 'INCERTO', resultado: { mensagem: 'Não foi possível confirmar o resultado do envio. Confira a agenda no Sírius antes de qualquer nova tentativa. Os horários permanecem reservados e este lote não será reenviado.' } } });
  }
}
