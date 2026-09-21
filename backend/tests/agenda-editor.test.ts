import { describe, expect, it } from 'vitest';
import { alterarManualSchema, corpoAlteracao, horarioEfetivo, lerRegistros, periodoAgenda, validarEncaixeManual, versaoAgenda } from '../src/domain/agenda-editor.js';
import { instante } from '../src/domain/agenda.js';

const evento = { codigo: 12, codigoExterno: 123, cliente: 42, clienteNovo: 0, vendedor: 7, dataAgendaLong: instante('2030-01-07', '00:00'), horaInicioAgenda: '09:00', horaFimAgenda: '09:30', status: 'PENDENTE_TESTE', contato: 'Compras', observacao: 'Não alterar', tipoInteracao: 'TESTE', feriado: 0, motivoNaoVenda: 0, ocorAtendida: 0, novaDataAgenda: '', dataLancamento: '2030-01-01', horaLancamento: '08:00', dataDigitacao: '2030-01-01', horaDigitacao: '08:00' };
const input = alterarManualSchema.parse({ chave: '3c6134ae-83a2-40ca-bfc0-c7dbb6c01d93', vendedorId: 'v1', codigo: 12, diaOriginal: '2030-01-07', versao: versaoAgenda(evento), dia: '2030-01-08', inicio: '10:00', fim: '10:30', contato: 'Contato atualizado', status: 'PENDENTE_TESTE' });
describe('edição de agenda', () => {
  it('preserva campos não editados e envia somente campos suportados', () => {
    const corpo = corpoAlteracao(evento, input);
    expect(corpo).toMatchObject({ codigo: 12, vendedor: 7, cliente: 42, dataLancamento: '2030-01-01', motivoNaoVenda: 0, horaInicioAgenda: '10:00', horaFimAgenda: '10:30', contato: 'Contato atualizado', dataAgendaLong: instante(input.dia, '00:00') });
    expect(corpo).not.toHaveProperty('observacao'); expect(corpo).not.toHaveProperty('tipoInteracao'); expect(corpo).not.toHaveProperty('codigoExterno');
  });
  it('altera o horário efetivo quando já existe reagendamento', () => {
    const original = { ...evento, novaDataAgenda: '09/01/2030', novaHoraInicial: '11:00', novaHoraFinal: '12:00' };
    const corpo = corpoAlteracao(original, input);
    expect(corpo).toMatchObject({ dataAgendaLong: evento.dataAgendaLong, novaDataAgenda: '08/01/2030', novaHoraInicial: '10:00', novaHoraFinal: '10:30' });
    expect(horarioEfetivo({ ...original, ...corpo })).toMatchObject({ dia: input.dia, inicio: 600, fim: 630 });
  });
  it('versão é estável com ordem diferente e muda se outro usuário editar', () => {
    expect(versaoAgenda(evento)).toBe(versaoAgenda(Object.fromEntries(Object.entries(evento).reverse()) as typeof evento));
    expect(versaoAgenda(evento)).not.toBe(versaoAgenda({ ...evento, contato: 'Outro' }));
  });
  it('valida resposta e não mistura vendedores', () => {
    expect(lerRegistros([evento], 8)).toEqual([]);
    expect(() => lerRegistros({ sucesso: false }, 7)).toThrow();
    expect(lerRegistros([evento], 7)).toHaveLength(1);
  });
  it('valida mês e intervalo sem aceitar uma janela excessiva', () => {
    expect(periodoAgenda.safeParse({ inicio: '2030-01-01', fim: '2030-01-31' }).success).toBe(true);
    expect(periodoAgenda.safeParse({ inicio: '2030-01-01', fim: '2030-02-01' }).success).toBe(false);
    expect(periodoAgenda.safeParse({ inicio: '2030-02-30', fim: '2030-02-30' }).success).toBe(false);
  });
  const slot = { cliente: 42, dia: '2030-01-07', inicio: 600, fim: 630 };
  it('recusa conflitos e margem insuficiente, admite a margem exata', () => {
    const ocupado = { ...slot, cliente: 9, inicio: 635, fim: 655 };
    expect(() => validarEncaixeManual(slot, [ocupado], 12, 10, 0)).toThrow('conflita');
    expect(() => validarEncaixeManual(slot, [{ ...ocupado, inicio: 640 }], 12, 10, 0)).not.toThrow();
  });
  it('recusa duplicidade diária, capacidade esgotada, feriados e passado', () => {
    expect(() => validarEncaixeManual(slot, [{ ...slot, inicio: 700, fim: 720 }], 12, 10, 0)).toThrow('já tem');
    expect(() => validarEncaixeManual(slot, [{ ...slot, cliente: 9, inicio: 700, fim: 720 }], 1, 10, 0)).toThrow('limite');
    expect(() => validarEncaixeManual(slot, [{ ...slot, feriado: true }], 12, 10, 0)).toThrow('feriado');
    expect(() => validarEncaixeManual(slot, [], 12, 10, instante(slot.dia, '10:01'))).toThrow('futuro');
    expect(() => validarEncaixeManual({ ...slot, fim: 590 }, [], 12, 10, 0)).toThrow('posterior');
  });
});
