import { createHash } from 'node:crypto';
import { z } from 'zod';
import { diaLocal, diaSchema, instante, minutos, normalizarAgenda, somarDias, sobrepoe, type Ocupacao } from './agenda.js';
import { AppError } from '../lib/errors.js';

export const horaEditor = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário HH:mm.');
export const periodoAgenda = z.object({ inicio: diaSchema, fim: diaSchema, vendedorId: z.string().min(1).optional() }).refine(p => p.inicio <= p.fim && p.fim <= somarDias(p.inicio, 30), 'Escolha um período de até 31 dias.');
export const registroAgenda = z.object({
  codigo: z.number().int().positive(), codigoExterno: z.number().int(), cliente: z.number().int(), clienteNovo: z.number().int(), vendedor: z.number().int(),
  dataAgendaLong: z.number().min(946684800000).max(4102444800000), horaInicioAgenda: z.string(), horaFimAgenda: z.string(), status: z.string(),
  tipoInteracao: z.string().nullish(), observacao: z.string().nullish(), contato: z.string().nullish(),
  dataDigitacao: z.string().nullish(), dataLancamento: z.string().nullish(), horaDigitacao: z.string().nullish(), horaLancamento: z.string().nullish(),
  feriado: z.number().int(), motivoNaoVenda: z.number().int(), ocorAtendida: z.number().int(),
  novaDataAgenda: z.string().nullish(), novaHoraInicial: z.string().nullish(), novaHoraFinal: z.string().nullish(),
});
export type RegistroAgenda = z.infer<typeof registroAgenda>;
export function lerRegistros(data: unknown, vendedor: number) {
  const resultado = z.array(registroAgenda).safeParse(data);
  if (!resultado.success) throw new AppError(502, 'O Sírius retornou agendamentos em formato não reconhecido.');
  return resultado.data.filter(r => r.vendedor === vendedor);
}
export function versaoAgenda(registro: RegistroAgenda) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(registro).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
}
export function horarioEfetivo(r: RegistroAgenda) {
  const ocupacoes = normalizarAgenda([r], r.vendedor);
  return ocupacoes[ocupacoes.length - 1];
}
const base = { chave: z.string().uuid(), vendedorId: z.string().min(1) };
const horario = { dia: diaSchema, inicio: horaEditor, fim: horaEditor, limiteDiario: z.number().int().min(1).max(50).default(12), intervalo: z.number().int().min(0).max(180).default(10) };
export const incluirManualSchema = z.object({ ...base, ...horario, clienteId: z.string().min(1), tipoInteracao: z.enum(['P', 'R']), observacao: z.string().max(2000).default('') });
export const alterarManualSchema = z.object({ ...base, ...horario, codigo: z.number().int().positive(), diaOriginal: diaSchema, versao: z.string().regex(/^[a-f0-9]{64}$/), status: z.string().min(1).max(40), contato: z.string().max(200).default('') });
export const excluirManualSchema = z.object({ ...base, codigo: z.number().int().positive(), diaOriginal: diaSchema, versao: z.string().regex(/^[a-f0-9]{64}$/) });
export function validarEncaixeManual(item: Ocupacao, ocupados: Ocupacao[], limite: number, intervalo: number, agora = Date.now()) {
  if (item.inicio >= item.fim || item.inicio < 0 || item.fim > 1439) throw new AppError(400, 'O horário final deve ser posterior ao inicial, no mesmo dia.');
  if (instante(item.dia, `${String(Math.floor(item.inicio / 60)).padStart(2, '0')}:${String(item.inicio % 60).padStart(2, '0')}`) <= agora) throw new AppError(400, 'Escolha um horário futuro.');
  const dia = ocupados.filter(o => o.dia === item.dia);
  if (dia.some(o => o.feriado)) throw new AppError(409, 'O dia está sinalizado como feriado na agenda do vendedor.');
  if (dia.length >= limite) throw new AppError(409, 'O limite diário já foi atingido. Escolha outro dia ou revise o limite.');
  if (dia.some(o => sobrepoe(item.inicio, item.fim, o.inicio - intervalo, o.fim + intervalo))) throw new AppError(409, 'O horário conflita com outro compromisso ou com a margem entre atendimentos.');
  if (dia.some(o => o.cliente === item.cliente)) throw new AppError(409, 'Este cliente já tem um agendamento neste dia.');
}
export function corpoAlteracao(original: RegistroAgenda, input: z.infer<typeof alterarManualSchema>) {
  // Somente campos de AgendaVendedorRequest. Tipo de interação e observação não fazem parte desse contrato.
  const { codigoExterno: _externo, clienteNovo: _novo, observacao: _obs, tipoInteracao: _tipo, ...preservados } = original;
  if (original.novaDataAgenda && original.novaDataAgenda !== '0') {
    const novaDataAgenda = /^\d{2}\/\d{2}\/\d{4}/.test(original.novaDataAgenda) ? input.dia.split('-').reverse().join('/') : input.dia;
    return { ...preservados, novaDataAgenda, novaHoraInicial: input.inicio, novaHoraFinal: input.fim, status: input.status, contato: input.contato };
  }
  return { ...preservados, dataAgendaLong: instante(input.dia, '00:00'), horaInicioAgenda: input.inicio, horaFimAgenda: input.fim, status: input.status, contato: input.contato };
}
