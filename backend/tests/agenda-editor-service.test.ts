import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ db: {} as any, consultar: vi.fn(), incluir: vi.fn(), alterar: vi.fn(), excluir: vi.fn(), reservas: vi.fn(), acoes: new Map<string, any>() }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: mock.db }));
vi.mock('../src/services/sirius.js', () => ({ consultarAgendaSirius: mock.consultar, inserirAgendaSirius: mock.incluir, alterarAgendaSirius: mock.alterar, excluirAgendaSirius: mock.excluir }));
vi.mock('../src/services/sirius-session.js', () => ({ siriusSessions: { get: () => ({ token: 'TESTE', filialCodigo: 1 }) } }));
vi.mock('../src/services/agenda.js', () => ({ contexto: async (_user: string, vendedorId: string) => ({ destino: 'http://sirius|1', config: { urlBase: 'http://sirius', filialCodigo: 1 }, sessao: { token: 'TESTE' }, vendedor: { id: vendedorId, codigoExterno: 7, nome: 'Vendedor' } }), reservas: mock.reservas }));
import { executarAcaoAgenda, visualizarAgenda } from '../src/services/agenda-editor.js';
import { versaoAgenda } from '../src/domain/agenda-editor.js';
import { instante } from '../src/domain/agenda.js';

const evento = { codigo: 12, codigoExterno: 123, cliente: 42, clienteNovo: 0, vendedor: 7, dataAgendaLong: instante('2030-01-07', '00:00'), horaInicioAgenda: '09:00', horaFimAgenda: '09:30', status: 'TESTE', contato: '', feriado: 0, motivoNaoVenda: 0, ocorAtendida: 0, novaDataAgenda: '' };
const base = { chave: '3c6134ae-83a2-40ca-bfc0-c7dbb6c01d93', vendedorId: 'v1', codigo: 12, diaOriginal: '2030-01-07', versao: versaoAgenda(evento) };
const edit = { ...base, dia: '2030-01-08', inicio: '10:00', fim: '10:30', contato: 'Compras', status: 'TESTE' };
beforeEach(() => {
  vi.clearAllMocks(); mock.acoes.clear();
  Object.assign(mock.db, {
    $transaction: vi.fn(async fn => fn(mock.db)), $queryRaw: vi.fn(async () => []),
    acaoAgenda: { findUnique: vi.fn(async ({ where }: any) => mock.acoes.get(where.id)), findMany: vi.fn(async () => []), create: vi.fn(async ({ data }: any) => { mock.acoes.set(data.id, data); return data; }), update: vi.fn(async ({ where, data }: any) => { const a = { ...mock.acoes.get(where.id), ...data }; mock.acoes.set(where.id, a); return a; }) },
    planoAgenda: { findMany: vi.fn(async () => []), update: vi.fn() },
    cliente: { findFirst: vi.fn(async () => ({ codigoExterno: 42 })), findMany: vi.fn(async () => [{ codigoExterno: 42, nomeFantasia: 'Cliente teste', cidade: 'BH' }]) },
    vendedor: { findMany: vi.fn(async () => [{ id: 'v1', codigoExterno: 7, nome: 'Vendedor', ativo: true }]) },
    configuracaoSirius: { findUnique: vi.fn(async () => ({ urlBase: 'http://sirius', filialCodigo: 1 })) },
  });
  mock.consultar.mockReset().mockResolvedValue({ data: [evento] });
  mock.incluir.mockReset(); mock.alterar.mockReset().mockResolvedValue({ data: null }); mock.excluir.mockReset().mockResolvedValue({ data: null });
  mock.reservas.mockReset().mockResolvedValue([]);
});
describe('operações de agenda no Sírius', () => {
  it('consulta geral identifica cada vendedor e relata falhas parciais', async () => {
    mock.db.vendedor.findMany.mockResolvedValue([{ id: 'v1', codigoExterno: 7, nome: 'A' }, { id: 'v2', codigoExterno: 8, nome: 'B' }]);
    mock.consultar.mockImplementation(async (_c, _t, codigo) => { if (codigo === 8) throw new Error('offline'); return { data: [evento] }; });
    const r = await visualizarAgenda('u1', { inicio: '2030-01-07', fim: '2030-01-07' });
    expect(r.parcial).toBe(true); expect(r.eventos[0]).toMatchObject({ vendedorId: 'v1', clienteNome: 'Cliente teste' });
    expect(r.falhas[0].vendedorId).toBe('v2'); expect(r.consultados).toEqual(['v1']);
  });
  it('filtro individual restringe consulta e bloqueia vendedor de outra filial', async () => {
    await visualizarAgenda('u1', { inicio: '2030-01-07', fim: '2030-01-07', vendedorId: 'v1' });
    expect(mock.db.vendedor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { filialCodigo: 1, id: 'v1' } }));
    mock.db.vendedor.findMany.mockResolvedValue([]);
    await expect(visualizarAgenda('u1', { inicio: '2030-01-07', fim: '2030-01-07', vendedorId: 'estranho' })).rejects.toThrow('filial');
  });
  it('não escreve quando o evento mudou ou não pertence ao vendedor', async () => {
    await expect(executarAcaoAgenda('u1', 'ALTERAR', { ...edit, versao: '0'.repeat(64) })).rejects.toThrow('mudou');
    await expect(executarAcaoAgenda('u1', 'EXCLUIR', { ...base, codigo: 99 })).rejects.toThrow('não encontrado');
    expect(mock.alterar).not.toHaveBeenCalled(); expect(mock.excluir).not.toHaveBeenCalled();
  });
  it('edita, verifica o resultado e libera a reserva antiga preservando o histórico', async () => {
    mock.consultar.mockResolvedValueOnce({ data: [evento] }).mockResolvedValueOnce({ data: [{ ...evento, dataAgendaLong: instante(edit.dia, '00:00'), horaInicioAgenda: edit.inicio, horaFimAgenda: edit.fim, contato: edit.contato }] });
    mock.db.planoAgenda.findMany.mockResolvedValue([{ id: 'plano', dados: { itens: [{ codigoExterno: 123 }], liberados: [] } }]);
    expect((await executarAcaoAgenda('u1', 'ALTERAR', edit)).estado).toBe('CONCLUIDO');
    expect(mock.db.planoAgenda.update).toHaveBeenCalledWith({ where: { id: 'plano' }, data: { dados: { itens: [{ codigoExterno: 123 }], liberados: [123] } } });
    await executarAcaoAgenda('u1', 'ALTERAR', edit); expect(mock.alterar).toHaveBeenCalledTimes(1);
  });
  it('exclui somente o código validado e confirma ausência', async () => {
    mock.consultar.mockResolvedValueOnce({ data: [evento] }).mockResolvedValueOnce({ data: [] });
    expect((await executarAcaoAgenda('u1', 'EXCLUIR', base)).estado).toBe('CONCLUIDO');
    expect(mock.excluir).toHaveBeenCalledWith(expect.anything(), 'TESTE', 12);
    await executarAcaoAgenda('u1', 'EXCLUIR', base); expect(mock.excluir).toHaveBeenCalledTimes(1);
  });
  it('não anuncia exclusão se o registro continuar presente', async () => {
    expect((await executarAcaoAgenda('u1', 'EXCLUIR', base)).estado).toBe('INCERTO');
    expect(mock.db.planoAgenda.update).not.toHaveBeenCalled();
  });
  it('permite atualizar apenas contato de compromisso passado sem criar nova reserva', async () => {
    const passado = { ...evento, dataAgendaLong: instante('2020-01-07', '00:00') };
    mock.consultar.mockResolvedValueOnce({ data: [passado] }).mockResolvedValueOnce({ data: [{ ...passado, contato: 'Atualizado' }] });
    const input = { ...base, diaOriginal: '2020-01-07', versao: versaoAgenda(passado), dia: '2020-01-07', inicio: '09:00', fim: '09:30', contato: 'Atualizado', status: 'TESTE' };
    expect((await executarAcaoAgenda('u1', 'ALTERAR', input)).estado).toBe('CONCLUIDO');
  });
  it('timeout mantém operação incerta e impede repetição', async () => {
    mock.alterar.mockRejectedValue(new Error('timeout'));
    expect((await executarAcaoAgenda('u1', 'ALTERAR', edit)).estado).toBe('INCERTO');
    await executarAcaoAgenda('u1', 'ALTERAR', edit); expect(mock.alterar).toHaveBeenCalledTimes(1);
  });
  it('criação manual valida cliente, reserva antes do POST e verifica leitura posterior', async () => {
    mock.consultar.mockResolvedValueOnce({ data: [] });
    mock.incluir.mockImplementation(async (_c, _t, payload) => {
      expect(mock.acoes.get(base.chave).estado).toBe('ENVIANDO');
      const novo = { ...evento, ...payload[0], codigo: 21 };
      mock.consultar.mockResolvedValue({ data: [novo] });
      return { data: [{ codigo: 21, codigoExterno: novo.codigoExterno, vendedor: 7 }] };
    });
    const input = { chave: base.chave, vendedorId: 'v1', clienteId: 'c1', dia: '2030-01-08', inicio: '10:00', fim: '10:30', tipoInteracao: 'R' };
    expect((await executarAcaoAgenda('u1', 'INCLUIR', input)).estado).toBe('CONCLUIDO');
    await executarAcaoAgenda('u1', 'INCLUIR', input); expect(mock.incluir).toHaveBeenCalledTimes(1);
    await expect(executarAcaoAgenda('u2', 'INCLUIR', input)).rejects.toThrow('já foi utilizada');
  });
  it('não envia inclusão se o cliente não pertence à carteira', async () => {
    mock.db.cliente.findFirst.mockResolvedValue(null);
    await expect(executarAcaoAgenda('u1', 'INCLUIR', { chave: base.chave, vendedorId: 'v1', clienteId: 'estranho', dia: '2030-01-08', inicio: '10:00', fim: '10:30', tipoInteracao: 'R' })).rejects.toThrow('carteira');
    expect(mock.incluir).not.toHaveBeenCalled();
  });
  it('bloqueia edição de evento com resultado de operação anterior ainda incerto', async () => {
    mock.db.acaoAgenda.findMany.mockResolvedValue([{ dados: { codigo: 12 } }]);
    await expect(executarAcaoAgenda('u1', 'ALTERAR', edit)).rejects.toThrow('pendente');
    expect(mock.alterar).not.toHaveBeenCalled();
  });
});
