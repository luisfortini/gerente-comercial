import { z } from 'zod';

export const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Data inválida');
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
export const hora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const diaLocal = (data: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
export const somarDias = (dia: string, dias: number) => new Date(Date.parse(dia + 'T12:00:00Z') + dias * 86400000).toISOString().slice(0, 10);
export const instante = (dia: string, horario: string) => Date.parse(`${dia}T${horario}:00-03:00`);
export const regrasSchema = z.object({
  vendedorId: z.string().min(1), inicio: diaSchema, fim: diaSchema,
  limiteDiario: z.number().int().min(1).max(50).default(12),
  duracao: z.number().int().min(5).max(240).default(20),
  intervalo: z.number().int().min(0).max(180).default(10),
  expedienteInicio: horaSchema.default('08:00'), expedienteFim: horaSchema.default('18:00'),
  almocoInicio: horaSchema.default('12:00'), almocoFim: horaSchema.default('13:00'),
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  bloqueios: z.array(diaSchema).max(90).default([]),
  intervaloClienteDias: z.number().int().min(1).max(90).default(7),
  agruparCidade: z.boolean().default(false),
  tipoInteracao: z.enum(['P', 'R']),
  clienteIds: z.array(z.string().min(1)).max(500).default([]),
}).superRefine((r, ctx) => {
  const erro = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (r.inicio > r.fim || r.fim > somarDias(r.inicio, 30)) erro('Escolha um período de até 31 dias, em ordem crescente.');
  if (minutos(r.expedienteInicio) >= minutos(r.expedienteFim)) erro('Expediente inválido.');
  if (minutos(r.almocoInicio) >= minutos(r.almocoFim)) erro('Intervalo de almoço inválido.');
  if (minutos(r.almocoInicio) < minutos(r.expedienteInicio) || minutos(r.almocoFim) > minutos(r.expedienteFim)) erro('O almoço deve estar dentro do expediente.');
});
export type RegrasAgenda = z.infer<typeof regrasSchema>;
export type Candidato = { id: string; codigo: number; nome: string; cidade: string; pontuacao: number; motivo: string };
export type Ocupacao = { cliente: number; dia: string; inicio: number; fim: number; feriado?: boolean; codigo?: number };
export type Sugestao = Candidato & { dia: string; inicio: number; fim: number };
export const sobrepoe = (a: number, b: number, c: number, d: number) => a < d && b > c;
export function podeAgendar(item: Ocupacao, ocupados: Ocupacao[], r: RegrasAgenda, agora = Date.now()) {
  const diaSemana = new Date(item.dia + 'T12:00:00Z').getUTCDay();
  if (item.dia < r.inicio || item.dia > r.fim || !r.diasSemana.includes(diaSemana) || r.bloqueios.includes(item.dia)) return false;
  if (instante(item.dia, hora(item.inicio)) <= agora || item.inicio < minutos(r.expedienteInicio) || item.fim > minutos(r.expedienteFim)) return false;
  if (sobrepoe(item.inicio, item.fim, minutos(r.almocoInicio), minutos(r.almocoFim))) return false;
  const dia = ocupados.filter(o => o.dia === item.dia);
  if (dia.length >= r.limiteDiario || dia.some(o => o.feriado || sobrepoe(item.inicio, item.fim, o.inicio - r.intervalo, o.fim + r.intervalo))) return false;
  return !ocupados.some(o => o.cliente === item.cliente && Math.abs(Date.parse(o.dia) - Date.parse(item.dia)) / 86400000 < r.intervaloClienteDias);
}
export function planejarAgenda(candidatos: Candidato[], ocupados: Ocupacao[], r: RegrasAgenda, agora = Date.now()) {
  const pendentes = [...new Map(candidatos.map(c => [c.id, c])).values()].sort((a, b) => b.pontuacao - a.pontuacao || a.nome.localeCompare(b.nome) || a.id.localeCompare(b.id));
  const agenda = [...ocupados]; const itens: Sugestao[] = [];
  for (let dia = r.inicio; dia <= r.fim; dia = somarDias(dia, 1)) {
    let cidade = '';
    for (let inicio = minutos(r.expedienteInicio); inicio + r.duracao <= minutos(r.expedienteFim); inicio += 5) {
      if (!pendentes.length) break;
      // Testa capacidade/horário uma vez antes de procurar o primeiro cliente elegível.
      if (!podeAgendar({ cliente: -1, dia, inicio, fim: inicio + r.duracao }, agenda, r, agora)) continue;
      const elegivel = (c: Candidato) => podeAgendar({ cliente: c.codigo, dia, inicio, fim: inicio + r.duracao }, agenda, r, agora);
      const c = (r.agruparCidade && cidade ? pendentes.find(c => c.cidade === cidade && elegivel(c)) : undefined) ?? pendentes.find(elegivel);
      if (!c) continue;
      const item = { ...c, dia, inicio, fim: inicio + r.duracao };
      itens.push(item); agenda.push({ ...item, cliente: c.codigo });
      pendentes.splice(pendentes.indexOf(c), 1); cidade = c.cidade;
    }
  }
  return { itens, naoAgendados: pendentes.map(c => ({ ...c, motivo: 'Sem horário viável no período: capacidade, bloqueios ou intervalo entre contatos.' })) };
}

const remotoSchema = z.array(z.object({
  codigo: z.number().int(), cliente: z.number().int(), vendedor: z.number().int(),
  dataAgendaLong: z.number().finite(), horaInicioAgenda: z.string(), horaFimAgenda: z.string(),
  feriado: z.number().optional(), novaDataAgenda: z.string().nullish(), novaHoraInicial: z.string().nullish(), novaHoraFinal: z.string().nullish(),
}));
export function normalizarAgenda(data: unknown, vendedor: number): Ocupacao[] {
  const registros = remotoSchema.parse(data);
  return registros.filter(a => a.vendedor === vendedor).flatMap(a => {
    // O contrato Java utiliza epoch em milissegundos. Valores em segundos são rejeitados.
    if (a.dataAgendaLong < 946684800000 || a.dataAgendaLong > 4102444800000) throw new Error('Data da agenda do Sírius fora do formato esperado (epoch em milissegundos).');
    const dia = diaLocal(new Date(a.dataAgendaLong));
    const h1 = horaSchema.safeParse(a.horaInicioAgenda.slice(0, 5)), h2 = horaSchema.safeParse(a.horaFimAgenda.slice(0, 5));
    const valido = h1.success && h2.success && minutos(h1.data) < minutos(h2.data);
    const base: Ocupacao = { codigo: a.codigo, cliente: a.cliente, dia, inicio: valido ? minutos(h1.data!) : 0, fim: valido ? minutos(h2.data!) : 1440, feriado: Boolean(a.feriado) };
    if (!a.novaDataAgenda || a.novaDataAgenda === '0') return [base];
    // Sem semântica de status documentada, preservamos também o horário original.
    let nova = a.novaDataAgenda.slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(nova)) nova = nova.split('/').reverse().join('-');
    if (!diaSchema.safeParse(nova).success) throw new Error('Data de reagendamento do Sírius não reconhecida.');
    const n1 = horaSchema.safeParse(a.novaHoraInicial?.slice(0, 5)), n2 = horaSchema.safeParse(a.novaHoraFinal?.slice(0, 5));
    const nv = n1.success && n2.success && minutos(n1.data) < minutos(n2.data);
    return [base, { ...base, dia: nova, inicio: nv ? minutos(n1.data!) : 0, fim: nv ? minutos(n2.data!) : 1440 }];
  });
}
