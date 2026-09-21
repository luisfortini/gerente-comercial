import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ plano: {} as any, inserir: vi.fn(), consultar: vi.fn(), db: {} as any }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: mock.db }));
vi.mock('../src/services/sirius.js', () => ({ inserirAgendaSirius: mock.inserir, consultarAgendaSirius: mock.consultar }));
vi.mock('../src/services/sirius-session.js', () => ({ siriusSessions: { get: () => ({ token: 'test', filialCodigo: 1 }) } }));
import { confirmarAgenda, previaAgenda } from '../src/services/agenda.js';
import { regrasSchema } from '../src/domain/agenda.js';

beforeEach(() => {
  vi.clearAllMocks();
  const regras = regrasSchema.parse({ vendedorId: 'v1', inicio: '2030-01-07', fim: '2030-01-07', tipoInteracao: 'R' });
  mock.plano = { id: 'p1', usuarioId: 'u1', criadoEm: new Date(), destino: 'http://sirius|1', vendedorId: 'v1', estado: 'PREVIA', dados: { regras, vendedorCodigo: 7, itens: [{ id: 'c1', codigo: 42, codigoExterno: 123, dia: regras.inicio, inicio: 480, fim: 500, motivo: 'Recompra' }] } };
  Object.assign(mock.db, {
    acaoAgenda: { findMany: vi.fn(async () => []) },
    planoAgenda: { create: vi.fn(async ({ data }: any) => ({ id: 'preview', ...data })), findFirst: vi.fn(async ({ where }: any) => where.usuarioId === 'u1' ? mock.plano : null), findUniqueOrThrow: vi.fn(async () => mock.plano), findMany: vi.fn(async () => []), update: vi.fn(async ({ data }: any) => Object.assign(mock.plano, data)) },
    vendedor: { findUnique: vi.fn(async () => ({ ativo: true, filialCodigo: 1, codigoExterno: 7 })) },
    configuracaoSirius: { findUnique: vi.fn(async () => ({ filialCodigo: 1, urlBase: 'http://sirius' })) },
    cliente: { findMany: vi.fn(async () => [{ id: 'c1', codigoExterno: 42, oportunidades: [] }]) },
    $queryRaw: vi.fn(async () => []), $transaction: vi.fn(async fn => fn(mock.db)),
  });
  mock.consultar.mockResolvedValue({ data: [] });
  mock.inserir.mockResolvedValue({ data: [{ codigo: 99, codigoExterno: 123, vendedor: 7 }] });
});
describe('confirmação de agendas', () => {
  it('considera reservas de inclusões manuais ao montar a prévia', async () => {
    mock.db.acaoAgenda.findMany.mockResolvedValue([{ dados: { ocupacao: { cliente: 99, dia: '2030-01-07', inicio: 480, fim: 510 } } }]);
    const p = await previaAgenda('u1', mock.plano.dados.regras);
    expect((p.dados as any).itens[0].inicio).toBe(520);
  });
  it('ignora reservas já liberadas por edição ou exclusão confirmada', async () => {
    mock.db.planoAgenda.findMany.mockResolvedValue([{ dados: { itens: [{ codigoExterno: 123, codigo: 99, dia: '2030-01-07', inicio: 480, fim: 510 }], liberados: [123] } }]);
    mock.db.acaoAgenda.findMany.mockResolvedValue([{ dados: { liberada: true, ocupacao: { cliente: 99, dia: '2030-01-07', inicio: 480, fim: 510 } } }]);
    const p = await previaAgenda('u1', mock.plano.dados.regras);
    expect((p.dados as any).itens[0].inicio).toBe(480);
  });
  it('prévia consulta e persiste sem criar compromissos externos', async () => {
    const plano = await previaAgenda('u1', mock.plano.dados.regras);
    expect((plano.dados as any).itens).toHaveLength(1);
    expect(mock.db.planoAgenda.create).toHaveBeenCalledTimes(1);
    expect(mock.inserir).not.toHaveBeenCalled();
  });
  it('persiste envio antes de chamar o Sírius e não reenvia o mesmo lote', async () => {
    mock.inserir.mockImplementation(async () => { expect(mock.plano.estado).toBe('ENVIANDO'); return { data: [{ codigo: 99, codigoExterno: 123, vendedor: 7 }] }; });
    expect((await confirmarAgenda('u1', 'p1')).estado).toBe('CONCLUIDO');
    await confirmarAgenda('u1', 'p1'); expect(mock.inserir).toHaveBeenCalledTimes(1);
  });
  it('timeout deixa resultado incerto sem reenvio', async () => {
    mock.inserir.mockRejectedValue(new Error('timeout'));
    expect((await confirmarAgenda('u1', 'p1')).estado).toBe('INCERTO');
    await confirmarAgenda('u1', 'p1'); expect(mock.inserir).toHaveBeenCalledTimes(1);
  });
  it('resposta parcial não é anunciada como sucesso', async () => {
    mock.inserir.mockResolvedValue({ data: [] });
    expect((await confirmarAgenda('u1', 'p1')).estado).toBe('INCERTO');
  });
  it('rejeita prévia expirada e acesso de outro usuário', async () => {
    await expect(confirmarAgenda('u2', 'p1')).rejects.toThrow('não encontrada');
    mock.plano.criadoEm = new Date(Date.now() - 31 * 60000);
    await expect(confirmarAgenda('u1', 'p1')).rejects.toThrow('expirou');
    expect(mock.inserir).not.toHaveBeenCalled();
  });
  it('não envia se uma nova reserva consumir a capacidade', async () => {
    mock.db.planoAgenda.findMany.mockResolvedValue([{ dados: { itens: [{ codigo: 9, dia: '2030-01-07', inicio: 480, fim: 510 }] } }]);
    await expect(confirmarAgenda('u1', 'p1')).rejects.toThrow('disponibilidade mudou');
    expect(mock.inserir).not.toHaveBeenCalled();
  });
  it('não envia se consulta de agenda falhar', async () => {
    mock.consultar.mockRejectedValue(new Error('offline'));
    await expect(confirmarAgenda('u1', 'p1')).rejects.toThrow('offline');
    expect(mock.inserir).not.toHaveBeenCalled(); expect(mock.plano.estado).toBe('PREVIA');
  });
});
