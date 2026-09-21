import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ db: {} as any, agenda: vi.fn(), ocorrencias: vi.fn(), inserir: vi.fn(), registros: new Map<string, any>() }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: mock.db }));
vi.mock('../src/services/sirius.js', () => ({ consultarAgendaSirius: mock.agenda, consultarOcorrenciasTelemarketingSirius: mock.ocorrencias, inserirAgendaEventoSirius: mock.inserir }));
vi.mock('../src/services/agenda.js', () => ({ contexto: async (_u: string, vendedorId: string) => ({ destino: 'http://sirius|1', config: { urlBase: 'http://sirius', filialCodigo: 1, loginSirius: 'operador.teste' }, sessao: { token: 'TOKEN' }, vendedor: { id: vendedorId, codigoExterno: 7 } }) }));
import { listarAtendimentosCrm, ocorrenciasCrm, registrarAtendimentoCrm } from '../src/services/agenda-crm.js';
import { versaoAgenda } from '../src/domain/agenda-editor.js';
import { instante } from '../src/domain/agenda.js';

const agenda = { codigo: 12, codigoExterno: 123, cliente: 42, clienteNovo: 0, vendedor: 7, dataAgendaLong: instante('2030-01-07', '00:00'), horaInicioAgenda: '09:00', horaFimAgenda: '09:30', status: 'PENDENTE', contato: '', feriado: 0, motivoNaoVenda: 0, ocorAtendida: 0, novaDataAgenda: '' };
const input = { chave: '3c6134ae-83a2-40ca-bfc0-c7dbb6c01d93', vendedorId: 'v1', versao: versaoAgenda(agenda), diaAgenda: '2030-01-07', codigoOcorrencia: 5, contato: 'Maria', observacao: 'Cliente pediu retorno na próxima semana.', tipoInteracao: 'R' };
beforeEach(() => {
  vi.clearAllMocks(); mock.registros.clear();
  Object.assign(mock.db, {
    $transaction: vi.fn(async fn => fn(mock.db)), $queryRaw: vi.fn(async () => []),
    atendimentoAgenda: {
      findUnique: vi.fn(async ({ where }: any) => mock.registros.get(where.id)), findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => { mock.registros.set(data.id, data); return data; }),
      update: vi.fn(async ({ where, data }: any) => { const r = { ...mock.registros.get(where.id), ...data }; mock.registros.set(where.id, r); return r; }),
      findMany: vi.fn(async () => [...mock.registros.values()]),
    },
    configuracaoSirius: { findUnique: vi.fn(async () => ({ urlBase: 'http://sirius', filialCodigo: 1 })) },
  });
  mock.agenda.mockResolvedValue({ data: [agenda] });
  mock.ocorrencias.mockResolvedValue({ data: [{ codigo: 5, descricao: 'Retornar contato', tipo: 'POSITIVA' }, { codigo: 2, descricao: 'Não atendeu', tipo: 'NEGATIVA' }] });
  mock.inserir.mockResolvedValue({ data: null });
});
describe('operação CRM da agenda', () => {
  it('carrega e ordena a tabela de ocorrências do Sírius', async () => {
    const r = await ocorrenciasCrm('u1', 'v1');
    expect(r.map(o => o.codigo)).toEqual([2, 5]);
  });
  it('rejeita uma tabela de ocorrências malformada', async () => {
    mock.ocorrencias.mockResolvedValue({ data: { erro: true } });
    await expect(ocorrenciasCrm('u1', 'v1')).rejects.toThrow('formato não reconhecido');
  });
  it('valida agenda e ocorrência, persiste antes do POST e usa o login configurado', async () => {
    mock.inserir.mockImplementation(async (_c, _t, eventos) => {
      expect(mock.registros.get(input.chave).estado).toBe('ENVIANDO');
      expect(eventos[0]).toMatchObject({ codigoAgenda: 12, codigoOcorrencia: 5, contato: 'Maria', usuarioLogado: 'operador.teste', tipoInteracao: 'R' });
      expect(eventos[0].dataAgenda).toEqual(expect.any(Number)); expect(eventos[0].horaAgenda).toMatch(/^\d{2}:\d{2}$/);
      return { data: null };
    });
    expect((await registrarAtendimentoCrm('u1', 12, input)).estado).toBe('CONCLUIDO');
  });
  it('não repete o envio com a mesma chave e os mesmos dados', async () => {
    await registrarAtendimentoCrm('u1', 12, input); await registrarAtendimentoCrm('u1', 12, input);
    expect(mock.inserir).toHaveBeenCalledTimes(1);
  });
  it('recusa reutilizar a chave com outro conteúdo', async () => {
    await registrarAtendimentoCrm('u1', 12, input);
    await expect(registrarAtendimentoCrm('u1', 12, { ...input, observacao: 'Conteúdo diferente' })).rejects.toThrow('outros dados');
  });
  it('impede segundo atendimento para o mesmo compromisso', async () => {
    mock.db.atendimentoAgenda.findFirst.mockResolvedValue({ estado: 'CONCLUIDO' });
    await expect(registrarAtendimentoCrm('u1', 12, { ...input, chave: '7e111c4d-96cd-4ac1-a1ca-2355ef4dfd56' })).rejects.toThrow('já possui');
    expect(mock.inserir).not.toHaveBeenCalled();
  });
  it('recusa ocorrência inexistente e agenda alterada', async () => {
    await expect(registrarAtendimentoCrm('u1', 12, { ...input, codigoOcorrencia: 999 })).rejects.toThrow('ocorrência válida');
    await expect(registrarAtendimentoCrm('u1', 12, { ...input, versao: '0'.repeat(64) })).rejects.toThrow('mudou');
    expect(mock.inserir).not.toHaveBeenCalled();
  });
  it('recusa tipo de interação fora de P e R', async () => {
    await expect(registrarAtendimentoCrm('u1', 12, { ...input, tipoInteracao: 'TELEFONE' })).rejects.toThrow();
    expect(mock.inserir).not.toHaveBeenCalled();
  });
  it('marca timeout como incerto e não reenvia', async () => {
    mock.inserir.mockRejectedValue(new Error('timeout'));
    expect((await registrarAtendimentoCrm('u1', 12, input)).estado).toBe('INCERTO');
    await registrarAtendimentoCrm('u1', 12, input); expect(mock.inserir).toHaveBeenCalledTimes(1);
  });
  it('lista histórico somente no destino, usuário e intervalo solicitados', async () => {
    await listarAtendimentosCrm('u1', '2030-01-01', '2030-01-31', 'v1');
    expect(mock.db.atendimentoAgenda.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usuarioId: 'u1', destino: 'http://sirius|1', vendedorId: 'v1' }) }));
    await expect(listarAtendimentosCrm('u1', '2030-02-01', '2030-01-01')).rejects.toThrow('Período inválido');
  });
});
