import { randomInt, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { siriusSessions } from './sirius-session.js';
import { alterarAgendaSirius, consultarAgendaSirius, excluirAgendaSirius, inserirAgendaSirius } from './sirius.js';
import { contexto, reservas } from './agenda.js';
import { diaLocal, hora, instante, minutos, normalizarAgenda, type Ocupacao } from '../domain/agenda.js';
import { alterarManualSchema, corpoAlteracao, excluirManualSchema, horarioEfetivo, incluirManualSchema, lerRegistros, periodoAgenda, validarEncaixeManual, versaoAgenda, type RegistroAgenda } from '../domain/agenda-editor.js';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function visualizarAgenda(empresaId: string, query: unknown) {
  const filtro = periodoAgenda.parse(query);
  const config = await prisma.configuracaoSirius.findUnique({ where: { empresaId } });
  const sessao = siriusSessions.get(empresaId);
  if (!config || !sessao || config.filialCodigo !== sessao.filialCodigo) throw new AppError(401, 'Conecte-se ao Sírius para visualizar a agenda.');
  const vendedores = await prisma.vendedor.findMany({ where: { empresaId, filialCodigo: config.filialCodigo, ...(filtro.vendedorId ? { id: filtro.vendedorId } : {}) }, orderBy: { nome: 'asc' } });
  if (filtro.vendedorId && !vendedores.length) throw new AppError(400, 'Vendedor não pertence à filial conectada.');
  const clientes = await prisma.cliente.findMany({ where: { empresaId, filialCodigo: config.filialCodigo }, select: { codigoExterno: true, nomeFantasia: true, razaoSocial: true, cidade: true } });
  const porCodigo = new Map(clientes.map(c => [c.codigoExterno, c]));
  const eventos: any[] = [], falhas: { vendedorId: string; vendedorNome: string; mensagem: string }[] = [], consultados: string[] = [];
  let proximo = 0;
  // Concorrência limitada para não disparar uma consulta por vendedor ao mesmo tempo.
  await Promise.all(Array.from({ length: Math.min(4, vendedores.length) }, async () => {
    while (proximo < vendedores.length) {
      const vendedor = vendedores[proximo++];
      try {
        const resposta = await consultarAgendaSirius(config, sessao.token, vendedor.codigoExterno, filtro.inicio, filtro.fim);
        const registros = lerRegistros(resposta.data, vendedor.codigoExterno);
        const itens = registros.map(r => {
          const efetivo = horarioEfetivo(r), cliente = porCodigo.get(r.cliente);
          return { codigo: r.codigo, codigoExterno: r.codigoExterno, vendedorId: vendedor.id, vendedorNome: vendedor.nome, vendedorAtivo: vendedor.ativo, clienteCodigo: r.cliente, clienteNome: cliente?.nomeFantasia || cliente?.razaoSocial || (r.clienteNovo ? `Cliente novo ${r.clienteNovo}` : `Cliente ${r.cliente}`), cidade: cliente?.cidade || '', dia: efetivo.dia, diaOriginal: diaLocal(new Date(r.dataAgendaLong)), inicio: efetivo.inicio, fim: efetivo.fim, horarioIndefinido: efetivo.fim === 1440, status: r.status, tipoInteracao: r.tipoInteracao || '', contato: r.contato || '', observacao: r.observacao || '', feriado: Boolean(r.feriado), reagendado: Boolean(r.novaDataAgenda && r.novaDataAgenda !== '0'), versao: versaoAgenda(r) };
        }).filter(e => e.dia >= filtro.inicio && e.dia <= filtro.fim);
        eventos.push(...itens); consultados.push(vendedor.id);
      } catch (erro) { falhas.push({ vendedorId: vendedor.id, vendedorNome: vendedor.nome, mensagem: erro instanceof AppError ? erro.message : 'Não foi possível interpretar ou consultar a agenda deste vendedor.' }); }
    }
  }));
  const unicos = [...new Map(eventos.map(e => [`${e.vendedorId}:${e.codigo}`, e])).values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.inicio - b.inicio || a.vendedorNome.localeCompare(b.vendedorNome));
  return { eventos: unicos, vendedores, falhas, consultados, parcial: falhas.length > 0, atualizadoEm: new Date().toISOString(), filial: config.filialCodigo };
}

type Operacao = 'INCLUIR' | 'ALTERAR' | 'EXCLUIR';
async function consultar(ctx: Awaited<ReturnType<typeof contexto>>, inicio: string, fim: string) {
  return lerRegistros((await consultarAgendaSirius(ctx.config, ctx.sessao.token, ctx.vendedor.codigoExterno, inicio, fim)).data, ctx.vendedor.codigoExterno);
}
async function liberarReservas(tx: Prisma.TransactionClient, empresaId: string, destino: string, vendedorId: string, codigoExterno: number, codigo: number, ignorar: string) {
  if (codigoExterno > 0) {
    const planos = await tx.planoAgenda.findMany({ where: { empresaId, destino, vendedorId, estado: { in: ['CONCLUIDO', 'INCERTO', 'ENVIANDO'] } } });
    for (const plano of planos) {
      const dados = plano.dados as any;
      if (dados.itens.some((i: any) => i.codigoExterno === codigoExterno)) await tx.planoAgenda.update({ where: { id: plano.id }, data: { dados: json({ ...dados, liberados: [...new Set([...(dados.liberados || []), codigoExterno])] }) } });
    }
  }
  const acoes = await tx.acaoAgenda.findMany({ where: { empresaId, destino, vendedorId, id: { not: ignorar } } });
  for (const acao of acoes) {
    const dados = acao.dados as any, resultado = acao.resultado as any;
    if ((codigoExterno > 0 && dados.codigoExterno === codigoExterno) || resultado?.codigo === codigo) await tx.acaoAgenda.update({ where: { id: acao.id }, data: { dados: json({ ...dados, liberada: true }) } });
  }
}

export async function executarAcaoAgenda(usuarioId: string, empresaId: string, operacao: Operacao, body: unknown) {
  const input = operacao === 'INCLUIR' ? incluirManualSchema.parse(body) : operacao === 'ALTERAR' ? alterarManualSchema.parse(body) : excluirManualSchema.parse(body);
  const assinatura = createHash('sha256').update(JSON.stringify({ operacao, input })).digest('hex');
  const ctx = await contexto(empresaId, input.vendedorId);
  let original: RegistroAgenda | undefined, ocupacao: Ocupacao | undefined, codigoExterno = 0;
  let payload: Record<string, unknown> = {};
  const inicioConsulta = 'diaOriginal' in input ? input.diaOriginal : input.dia;
  const fimConsulta = 'dia' in input ? input.dia : inicioConsulta;
  const inicio = inicioConsulta < fimConsulta ? inicioConsulta : fimConsulta, fim = inicioConsulta > fimConsulta ? inicioConsulta : fimConsulta;
  // O mesmo lock do planejamento protege a capacidade compartilhada.
  const acao = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.destino + '|' + input.vendedorId}))::text`;
    const existente = await tx.acaoAgenda.findUnique({ where: { id: input.chave } });
    if (existente) {
      if (existente.usuarioId !== usuarioId || existente.empresaId !== empresaId || (existente.dados as any).assinatura !== assinatura || existente.destino !== ctx.destino) throw new AppError(409, 'A identificação da operação já foi utilizada. Atualize a agenda.');
      return { iniciou: false, registro: existente };
    }
    const registros = await consultar(ctx, inicio, fim);
    if ('codigo' in input) {
      original = registros.find(r => r.codigo === input.codigo);
      if (!original) throw new AppError(404, 'Agendamento não encontrado na agenda deste vendedor. Atualize a visualização.');
      if (versaoAgenda(original) !== input.versao) throw new AppError(409, 'O agendamento mudou desde a consulta. Atualize a agenda antes de editar ou excluir.');
      codigoExterno = original.codigoExterno;
      const pendentes = await tx.acaoAgenda.findMany({ where: { empresaId, destino: ctx.destino, vendedorId: input.vendedorId, estado: { in: ['ENVIANDO', 'INCERTO'] } } });
      if (pendentes.some(a => (a.dados as any).codigo === input.codigo)) throw new AppError(409, 'Há uma operação pendente de confirmação para este agendamento. Confira o resultado no Sírius.');
    }
    if ('dia' in input) {
      const cliente = 'clienteId' in input ? await tx.cliente.findFirst({ where: { id: input.clienteId, empresaId, vendedorId: input.vendedorId, filialCodigo: ctx.config.filialCodigo } }) : undefined;
      if ('clienteId' in input && !cliente) throw new AppError(400, 'Selecione um cliente da carteira e filial deste vendedor.');
      ocupacao = { cliente: cliente?.codigoExterno ?? original!.cliente, dia: input.dia, inicio: minutos(input.inicio), fim: minutos(input.fim) };
      const remotos = normalizarAgenda(registros.filter(r => r.codigo !== original?.codigo), ctx.vendedor.codigoExterno);
      const ocupados = await reservas(tx, empresaId, ctx.destino, input.vendedorId, remotos, undefined, original?.codigoExterno);
      const anterior = original ? horarioEfetivo(original) : undefined;
      const mudouHorario = !anterior || anterior.dia !== ocupacao.dia || anterior.inicio !== ocupacao.inicio || anterior.fim !== ocupacao.fim;
      // Atualizar apenas contato/status de um compromisso passado não é uma nova reserva.
      if (mudouHorario) validarEncaixeManual(ocupacao, ocupados, input.limiteDiario, input.intervalo);
      if ('clienteId' in input) {
        codigoExterno = randomInt(1, 2147483647);
        payload = { cliente: cliente!.codigoExterno, clienteNovo: 0, codigoExterno, vendedor: ctx.vendedor.codigoExterno, dataAgendaLong: instante(input.dia, '00:00'), horaInicioAgenda: input.inicio, horaFimAgenda: input.fim, tipoInteracao: input.tipoInteracao, observacao: input.observacao, sequenciaRota: 0 };
      } else payload = corpoAlteracao(original!, input);
    }
    const registro = await tx.acaoAgenda.create({ data: { id: input.chave, empresaId, usuarioId, destino: ctx.destino, vendedorId: input.vendedorId, operacao, estado: 'ENVIANDO', dados: json({ assinatura, codigo: original?.codigo, codigoExterno, ocupacao, original, payload }) } });
    return { iniciou: true, registro };
  }, { timeout: 150000, maxWait: 10000 });
  if (!acao.iniciou) return acao.registro;
  let codigo = original?.codigo;
  try {
    if (operacao === 'INCLUIR') {
      const resposta = await inserirAgendaSirius(ctx.config, ctx.sessao.token, [payload as any]);
      const resultado = z.array(z.object({ codigo: z.number().int().positive(), codigoExterno: z.number().int(), vendedor: z.number().int() })).length(1).parse(resposta.data);
      if (resultado[0].codigoExterno !== codigoExterno || resultado[0].vendedor !== ctx.vendedor.codigoExterno) throw new Error('Retorno divergente');
      codigo = resultado[0].codigo;
    } else if (operacao === 'ALTERAR') {
      const resposta = await alterarAgendaSirius(ctx.config, ctx.sessao.token, payload);
      if (resposta.data && typeof resposta.data === 'object' && (resposta.data as any).sucesso === false) throw new Error('Alteração recusada');
    } else {
      const resposta = await excluirAgendaSirius(ctx.config, ctx.sessao.token, codigo!);
      if (resposta.data && typeof resposta.data === 'object' && (resposta.data as any).sucesso === false) throw new Error('Exclusão recusada');
    }
    // Alterar/excluir não têm modelo de resposta: confirmação por nova leitura.
    const depois = await consultar(ctx, inicio, fim), evento = depois.find(r => r.codigo === codigo);
    if (operacao === 'EXCLUIR') { if (evento) throw new Error('Exclusão ainda não confirmada'); }
    else {
      if (!evento) throw new Error('Agendamento não encontrado após salvar');
      const h = horarioEfetivo(evento);
      if (h.dia !== ocupacao!.dia || h.inicio !== ocupacao!.inicio || h.fim !== ocupacao!.fim || evento.cliente !== ocupacao!.cliente) throw new Error('Horário divergente');
      if ('status' in input && 'contato' in input && (evento.status !== input.status || (evento.contato || '') !== input.contato)) throw new Error('Campos não confirmados');
    }
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.destino + '|' + input.vendedorId}))::text`;
      if (original) await liberarReservas(tx, empresaId, ctx.destino, input.vendedorId, original.codigoExterno, original.codigo, input.chave);
      return tx.acaoAgenda.update({ where: { id: input.chave }, data: { estado: 'CONCLUIDO', resultado: json({ codigo, mensagem: operacao === 'EXCLUIR' ? 'Agendamento excluído e ausência confirmada no Sírius.' : 'Agendamento salvo e confirmado no Sírius.' }) } });
    }, { timeout: 20000 });
  } catch {
    return prisma.acaoAgenda.update({ where: { id: input.chave }, data: { estado: 'INCERTO', resultado: json({ codigo, mensagem: 'O resultado não pôde ser confirmado. Atualize a agenda e confira no Sírius. Esta operação não será reenviada automaticamente.' }) } });
  }
}
