import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { diaLocal, diaSchema } from '../domain/agenda.js';
import { horarioEfetivo, lerRegistros, versaoAgenda } from '../domain/agenda-editor.js';
import { contexto } from './agenda.js';
import { consultarAgendaSirius, consultarOcorrenciasTelemarketingSirius, inserirAgendaEventoSirius } from './sirius.js';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const ocorrenciaSchema = z.object({ codigo: z.number().int().positive(), descricao: z.string().min(1), tipo: z.string() });
function validarOcorrencias(data: unknown) {
  const parsed = z.array(ocorrenciaSchema).safeParse(data);
  if (!parsed.success) throw new AppError(502, 'A tabela de ocorrências do Sírius veio em formato não reconhecido.');
  return parsed.data.sort((a, b) => a.descricao.localeCompare(b.descricao));
}
export const atendimentoSchema = z.object({
  chave: z.string().uuid(), vendedorId: z.string().min(1), versao: z.string().regex(/^[a-f0-9]{64}$/), diaAgenda: diaSchema,
  codigoOcorrencia: z.number().int().positive(), contato: z.string().trim().min(1).max(200), observacao: z.string().trim().min(3).max(4000),
  tipoInteracao: z.enum(['P', 'R']),
});
export async function ocorrenciasCrm(usuarioId: string, vendedorId?: string) {
  let config, sessao;
  if (vendedorId) ({ config, sessao } = await contexto(usuarioId, vendedorId));
  else {
    config = await prisma.configuracaoSirius.findUnique({ where: { usuarioId } });
    const { siriusSessions } = await import('./sirius-session.js'); sessao = siriusSessions.get(usuarioId);
    if (!config || !sessao || config.filialCodigo !== sessao.filialCodigo) throw new AppError(401, 'Conecte-se ao Sírius para operar a agenda.');
  }
  const resposta = await consultarOcorrenciasTelemarketingSirius(config, sessao.token);
  return validarOcorrencias(resposta.data);
}
export async function listarAtendimentosCrm(usuarioId: string, inicio: string, fim: string, vendedorId?: string) {
  diaSchema.parse(inicio); diaSchema.parse(fim);
  if (inicio > fim) throw new AppError(400, 'Período inválido.');
  const config = await prisma.configuracaoSirius.findUnique({ where: { usuarioId } });
  if (!config) throw new AppError(401, 'Conecte-se ao Sírius para operar a agenda.');
  const destino = `${config.urlBase.replace(/\/$/, '')}|${config.filialCodigo}`;
  const registros = await prisma.atendimentoAgenda.findMany({ where: { usuarioId, destino, ...(vendedorId ? { vendedorId } : {}), criadoEm: { gte: new Date(`${inicio}T00:00:00-03:00`), lte: new Date(`${fim}T23:59:59.999-03:00`) } }, orderBy: { criadoEm: 'desc' } });
  return registros;
}
export async function registrarAtendimentoCrm(usuarioId: string, codigoAgenda: number, body: unknown) {
  if (!Number.isInteger(codigoAgenda) || codigoAgenda <= 0) throw new AppError(400, 'Código de agendamento inválido.');
  const input = atendimentoSchema.parse(body), ctx = await contexto(usuarioId, input.vendedorId);
  const assinatura = createHash('sha256').update(JSON.stringify({ codigoAgenda, input })).digest('hex');
  let payload: any;
  const preparado = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.destino + '|' + input.vendedorId + '|' + codigoAgenda}))::text`;
    const existente = await tx.atendimentoAgenda.findUnique({ where: { id: input.chave } });
    if (existente) {
      if (existente.usuarioId !== usuarioId || existente.destino !== ctx.destino || existente.agendaCodigo !== codigoAgenda || (existente.dados as any).assinatura !== assinatura) throw new AppError(409, 'A identificação do atendimento já foi utilizada com outros dados.');
      return { iniciou: false, registro: existente };
    }
    const outro = await tx.atendimentoAgenda.findFirst({ where: { destino: ctx.destino, vendedorId: input.vendedorId, agendaCodigo: codigoAgenda, estado: { in: ['ENVIANDO', 'CONCLUIDO', 'INCERTO'] } }, orderBy: { criadoEm: 'desc' } });
    if (outro) throw new AppError(409, 'Este agendamento já possui atendimento registrado ou pendente de confirmação.');
    const [agendaResposta, ocorrenciaResposta] = await Promise.all([
      consultarAgendaSirius(ctx.config, ctx.sessao.token, ctx.vendedor.codigoExterno, input.diaAgenda, input.diaAgenda),
      consultarOcorrenciasTelemarketingSirius(ctx.config, ctx.sessao.token),
    ]);
    const agenda = lerRegistros(agendaResposta.data, ctx.vendedor.codigoExterno).find(a => a.codigo === codigoAgenda);
    if (!agenda) throw new AppError(404, 'Agendamento não encontrado para este vendedor e data. Atualize a fila.');
    if (versaoAgenda(agenda) !== input.versao) throw new AppError(409, 'O agendamento mudou desde a consulta. Atualize a fila antes de registrar o atendimento.');
    const ocorrencia = validarOcorrencias(ocorrenciaResposta.data).find(o => o.codigo === input.codigoOcorrencia);
    if (!ocorrencia) throw new AppError(400, 'Selecione uma ocorrência válida da tabela atual do Sírius.');
    const efetivo = horarioEfetivo(agenda), agora = new Date();
    payload = { codigoAgenda, codigoOcorrencia: ocorrencia.codigo, contato: input.contato, dataAgenda: agora.getTime(), horaAgenda: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(agora), observacao: input.observacao, tipoInteracao: input.tipoInteracao, usuarioLogado: ctx.config.loginSirius };
    const registro = await tx.atendimentoAgenda.create({ data: { id: input.chave, usuarioId, destino: ctx.destino, vendedorId: input.vendedorId, agendaCodigo: codigoAgenda, agendaVersao: input.versao, estado: 'ENVIANDO', dados: json({ assinatura, agenda: { cliente: agenda.cliente, dia: efetivo.dia, inicio: efetivo.inicio, fim: efetivo.fim, status: agenda.status }, ocorrencia, payload }) } });
    return { iniciou: true, registro };
  }, { timeout: 150000, maxWait: 10000 });
  if (!preparado.iniciou) return preparado.registro;
  try {
    const resposta = await inserirAgendaEventoSirius(ctx.config, ctx.sessao.token, [payload]);
    if (resposta.data && typeof resposta.data === 'object' && !Array.isArray(resposta.data) && (resposta.data as any).sucesso === false) throw new Error('Atendimento recusado');
    return prisma.atendimentoAgenda.update({ where: { id: input.chave }, data: { estado: 'CONCLUIDO', resultado: json({ mensagem: 'Atendimento registrado no Sírius.', resposta: resposta.data }) } });
  } catch {
    return prisma.atendimentoAgenda.update({ where: { id: input.chave }, data: { estado: 'INCERTO', resultado: { mensagem: 'O resultado não pôde ser confirmado. Confira o histórico no Sírius antes de repetir; este atendimento não será reenviado automaticamente.' } } });
  }
}
