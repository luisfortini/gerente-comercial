import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/config/env.js', () => ({ env: { SIRIUS_TIMEOUT_MS: 1000 } }));
import { alterarAgendaSirius, consultarAgendaSirius, consultarOcorrenciasTelemarketingSirius, excluirAgendaSirius, inserirAgendaEventoSirius, inserirAgendaSirius } from '../src/services/sirius.js';
const config = { urlBase: 'http://sirius/', filialCodigo: 3, loginSirius: 'teste', formatoAuthorization: 'BEARER' as const };
afterEach(() => vi.unstubAllGlobals());
describe('integração HTTP de agenda', () => {
  it('consulta ocorrências de telemarketing e inclui evento com array', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('[]', { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 201 })); vi.stubGlobal('fetch', fetch);
    await consultarOcorrenciasTelemarketingSirius(config, 'token-teste');
    const evento = { codigoAgenda: 12, codigoOcorrencia: 5, contato: 'Maria', dataAgenda: 1894017600000, horaAgenda: '10:00', observacao: 'Contato realizado', tipoInteracao: 'R', usuarioLogado: 'operador' };
    await inserirAgendaEventoSirius(config, 'token-teste', [evento]);
    expect(fetch.mock.calls[0][0]).toBe('http://sirius/siriusservidor/ocorrenciatmk/obter');
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    expect(fetch.mock.calls[1][0]).toBe('http://sirius/siriusservidor/agendaevento/inserir');
    expect(fetch.mock.calls[1][1].method).toBe('POST'); expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual([evento]);
  });
  it('altera por POST com array e aceita exclusão 204 sem corpo', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    const alteracao = { codigo: 12, status: 'TESTE', horaInicioAgenda: '10:00', horaFimAgenda: '10:30' };
    await alterarAgendaSirius(config, 'token-teste', alteracao);
    const resposta = await excluirAgendaSirius(config, 'token-teste', 12);
    expect(fetch.mock.calls[0][0]).toBe('http://sirius/siriusservidor/agendavendedor/alterar');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([alteracao]);
    expect(fetch.mock.calls[1][0]).toBe('http://sirius/siriusservidor/agendavendedor/excluir/12');
    expect(fetch.mock.calls[1][1].method).toBe('DELETE'); expect(resposta.data).toBeNull();
  });
  it('recusa código de exclusão inválido antes de fazer a chamada', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(excluirAgendaSirius(config, 'token', -1)).rejects.toThrow('inválido'); expect(fetch).not.toHaveBeenCalled();
  });
  it('consulta com filial, vendedor e período usando GET', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 })); vi.stubGlobal('fetch', fetch);
    await consultarAgendaSirius(config, 'token-teste', 7, '2030-01-01', '2030-01-31');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://sirius/siriusservidor/agendavendedor/obter?filial=3&vendedor=7&dataInicial=2030-01-01&dataFinal=2030-01-31');
    expect(init.headers.authorization).toBe('Bearer token-teste'); expect(init.body).toBeUndefined();
  });
  it('inclui somente pela rota documentada com corpo em array', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 })); vi.stubGlobal('fetch', fetch);
    const evento = { cliente: 42, clienteNovo: 0, codigoExterno: 123, dataAgendaLong: 1893985200000, horaInicioAgenda: '08:00', horaFimAgenda: '08:20', observacao: 'Teste', sequenciaRota: 0, tipoInteracao: 'R', vendedor: 7 };
    await inserirAgendaSirius({ ...config, formatoAuthorization: 'PURO' }, 'token-teste', [evento]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://sirius/siriusservidor/agendavendedor/inserir'); expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('token-teste'); expect(JSON.parse(init.body)).toEqual([evento]);
  });
  it('recusa resposta inválida em vez de assumir agenda vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>erro</html>', { status: 200 })));
    await expect(consultarAgendaSirius(config, 'token', 7, '2030-01-01', '2030-01-31')).rejects.toThrow('resposta inválida');
  });
});
