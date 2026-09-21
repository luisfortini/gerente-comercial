import { describe, expect, it } from 'vitest';
import { instante, normalizarAgenda, planejarAgenda, podeAgendar, regrasSchema, type Candidato, type Ocupacao } from '../src/domain/agenda.js';

const regras = regrasSchema.parse({ vendedorId: 'v1', inicio: '2026-09-14', fim: '2026-09-15', tipoInteracao: 'R' });
const agora = instante('2026-09-14', '07:00');
const clientes: Candidato[] = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, codigo: i + 1, nome: `Cliente ${i}`, cidade: i % 2 ? 'A' : 'B', pontuacao: 100 - i, motivo: 'Recompra' }));
const ocupado = (cliente: number, inicio: number, fim: number, dia = regras.inicio): Ocupacao => ({ cliente, inicio, fim, dia });
describe('planejamento de agenda', () => {
  it('conta compromissos existentes no limite diário e informa sobras', () => {
    const r = { ...regras, limiteDiario: 2 };
    const plano = planejarAgenda(clientes, [ocupado(999, 480, 510)], r, agora);
    expect(plano.itens).toHaveLength(3); expect(plano.naoAgendados).toHaveLength(37);
    expect(plano.itens.filter(i => i.dia === r.inicio)).toHaveLength(1);
    expect(plano.itens[0].inicio).toBe(520);
  });
  it('respeita almoço, expediente e intervalo inclusive antes de compromissos', () => {
    const plano = planejarAgenda(clientes, [ocupado(999, 510, 540)], { ...regras, limiteDiario: 50 }, agora);
    for (const i of plano.itens) {
      expect(i.inicio).toBeGreaterThanOrEqual(480); expect(i.fim).toBeLessThanOrEqual(1080);
      expect(i.fim <= 720 || i.inicio >= 780).toBe(true);
      if (i.dia === regras.inicio) expect(i.fim <= 500 || i.inicio >= 550).toBe(true);
    }
  });
  it('não agenda no passado nem em dias bloqueados ou fim de semana', () => {
    expect(planejarAgenda(clientes, [], { ...regras, bloqueios: [regras.inicio, regras.fim] }, agora).itens).toHaveLength(0);
    expect(planejarAgenda(clientes, [], { ...regras, inicio: '2026-09-19', fim: '2026-09-20' }, agora).itens).toHaveLength(0);
    const plano = planejarAgenda(clientes, [], regras, instante(regras.inicio, '15:32'));
    expect(plano.itens[0].inicio).toBe(935);
  });
  it('respeita intervalo de contato antes e depois da janela', () => {
    const plano = planejarAgenda(clientes.slice(0, 2), [ocupado(1, 500, 520, '2026-09-12'), ocupado(2, 500, 520, '2026-09-18')], regras, agora);
    expect(plano.itens).toHaveLength(0);
  });
  it('agenda cada cliente somente uma vez e prioriza maior pontuação', () => {
    const plano = planejarAgenda([...clientes].reverse().concat(clientes), [], regras, agora);
    expect(plano.itens[0].id).toBe('c0');
    expect(new Set(plano.itens.map(i => i.id)).size).toBe(plano.itens.length);
  });
  it('prefere mesma cidade somente quando solicitado', () => {
    const plano = planejarAgenda(clientes, [], { ...regras, agruparCidade: true }, agora);
    expect(plano.itens[0].id).toBe('c0'); expect(plano.itens[1].id).toBe('c2');
  });
  it('bloqueia dia inteiro marcado como feriado', () => {
    const plano = planejarAgenda(clientes, [{ ...ocupado(999, 600, 660), feriado: true }], regras, agora);
    expect(plano.itens.every(i => i.dia === regras.fim)).toBe(true);
  });
  it('revalidação rejeita novo conflito', () => {
    const item = ocupado(1, 480, 500);
    expect(podeAgendar(item, [], regras, agora)).toBe(true);
    expect(podeAgendar(item, [ocupado(2, 490, 520)], regras, agora)).toBe(false);
  });
  it('valida datas reais, limites e horários', () => {
    for (const change of [{ inicio: '2026-02-30' }, { fim: '2027-01-01' }, { limiteDiario: 0 }, { duracao: -1 }, { diasSemana: [] }, { expedienteFim: '07:00' }, { almocoFim: '11:00' }]) expect(regrasSchema.safeParse({ ...regras, ...change }).success).toBe(false);
  });
  it('aceita somente os tipos presencial e remoto', () => {
    expect(regrasSchema.safeParse({ ...regras, tipoInteracao: 'P' }).success).toBe(true);
    expect(regrasSchema.safeParse({ ...regras, tipoInteracao: 'R' }).success).toBe(true);
    expect(regrasSchema.safeParse({ ...regras, tipoInteracao: 'TELEFONE' }).success).toBe(false);
  });
});
describe('contrato da agenda remota', () => {
  const evento = { codigo: 1, cliente: 42, vendedor: 7, dataAgendaLong: instante('2026-09-14', '00:00'), horaInicioAgenda: '09:00:00', horaFimAgenda: '09:30:00' };
  it('interpreta milissegundos e horários no fuso de Brasília', () => {
    expect(normalizarAgenda([evento], 7)[0]).toMatchObject({ dia: '2026-09-14', inicio: 540, fim: 570 });
    expect(normalizarAgenda([evento], 8)).toEqual([]);
  });
  it('trata horário ausente como compromisso de dia inteiro', () => {
    expect(normalizarAgenda([{ ...evento, horaInicioAgenda: '', horaFimAgenda: '' }], 7)[0]).toMatchObject({ inicio: 0, fim: 1440 });
  });
  it('bloqueia tanto o horário original quanto o reagendado', () => {
    const agenda = normalizarAgenda([{ ...evento, novaDataAgenda: '15/09/2026', novaHoraInicial: '14:00', novaHoraFinal: '15:00' }], 7);
    expect(agenda).toHaveLength(2); expect(agenda[1]).toMatchObject({ dia: '2026-09-15', inicio: 840, fim: 900 });
  });
  it('não assume disponibilidade diante de resposta malformada', () => {
    expect(() => normalizarAgenda({ erro: 'falha' }, 7)).toThrow();
    expect(() => normalizarAgenda([{ ...evento, dataAgendaLong: 1789369200 }], 7)).toThrow();
    expect(() => normalizarAgenda([{ ...evento, novaDataAgenda: 'inválida' }], 7)).toThrow();
  });
});
