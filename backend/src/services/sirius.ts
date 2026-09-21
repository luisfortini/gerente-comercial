import { FormatoAuthorization, type ConfiguracaoSirius } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export type ConfigSirius = Pick<ConfiguracaoSirius, 'urlBase' | 'filialCodigo' | 'loginSirius' | 'formatoAuthorization'>;
export type ResultadoSirius = { status: number; duracaoMs: number; data: unknown; quantidade: number; campos: string[] };

const allowed = new Map([
  ['vendedores', { metodo: 'GET', rota: '/siriusservidor/vendedor/obtertodos' }],
  ['vendedor', { metodo: 'POST', rota: '/siriusservidor/vendedor/obter' }],
  ['carteira', { metodo: 'POST', rota: '/siriusservidor/dashboards/vendedor/carteira-completa' }],
  ['vendas', { metodo: 'POST', rota: '/siriusservidor/relatorios/vendas' }],
  ['produtoCliente', { metodo: 'POST', rota: '/siriusservidor/relatorios/produtocliente' }],
  ['vendaCliente', { metodo: 'POST', rota: '/siriusservidor/relatorios/vendacliente' }],
  ['vendaProduto', { metodo: 'POST', rota: '/siriusservidor/relatorios/vendasproduto' }],
  ['mix', { metodo: 'POST', rota: '/siriusservidor/dashboards/dadosmix' }],
] as const);

async function request(url: string, init: RequestInit): Promise<ResultadoSirius> {
  const inicio = performance.now();
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(env.SIRIUS_TIMEOUT_MS) }); }
  catch (e) { throw new AppError(502, 'API do Sírius indisponível ou excedeu o tempo limite', e instanceof Error ? e.message : undefined); }
  const text = await response.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : null; } catch { throw new AppError(502, 'O Sírius retornou uma resposta inválida'); }
  if (!response.ok) {
    const msg = typeof data === 'object' && data && 'mensagemUsuario' in data ? String((data as any).mensagemUsuario) : `Falha do Sírius (${response.status})`;
    throw new AppError(response.status === 401 || response.status === 403 ? 401 : 502, msg, { statusSirius: response.status });
  }
  const registros = Array.isArray(data) ? data : data ? [data] : [];
  const campos = [...new Set(registros.slice(0, 5).flatMap(x => x && typeof x === 'object' ? Object.keys(x) : []))];
  return { status: response.status, duracaoMs: Math.round(performance.now() - inicio), data, quantidade: registros.length, campos };
}

export async function autenticarSirius(input: { urlBase: string; filialCodigo: number; login: string; senha: string; sistemaCodigo?: number; sistemaVersao?: string; subSistemaCodigo?: number; subSistemaVersao?: string }) {
  const body = { filialCodigo: input.filialCodigo, login: input.login, senha: input.senha, sistemaCodigo: input.sistemaCodigo ?? 0, sistemaVersao: input.sistemaVersao ?? '', subSistemaCodigo: input.subSistemaCodigo ?? 0, subSistemaVersao: input.subSistemaVersao ?? '', token: '' };
  const result = await request(`${input.urlBase.replace(/\/$/, '')}/siriusservidor/autenticacao/entrar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = result.data as Record<string, unknown>;
  if (!data?.sucesso || typeof data.token !== 'string' || !data.token) throw new AppError(401, String(data?.mensagemUsuario || 'Credenciais do Sírius recusadas'));
  return { ...result, auth: { token: data.token, usuarioNome: String(data.usuarioNome || ''), filialCodigo: Number(data.filialCodigo || input.filialCodigo), mensagem: String(data.mensagemUsuario || '') } };
}

export async function consultarSirius(tipo: string, config: ConfigSirius, token: string, body?: unknown) {
  const endpoint = allowed.get(tipo as typeof allowed extends Map<infer K, unknown> ? K : never);
  if (!endpoint) throw new AppError(400, 'Consulta não permitida');
  const authorization = config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token;
  return request(`${config.urlBase.replace(/\/$/, '')}${endpoint.rota}`, {
    method: endpoint.metodo,
    headers: { authorization, 'content-type': 'application/json' },
    ...(endpoint.metodo === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}

export const endpointsSirius = allowed;

// Operações de agenda separadas das consultas de diagnóstico, que continuam somente leitura.
export async function consultarAgendaSirius(config: ConfigSirius, token: string, vendedor: number, inicio: string, fim: string) {
  const query = new URLSearchParams({ filial: String(config.filialCodigo), vendedor: String(vendedor), dataInicial: inicio, dataFinal: fim });
  return request(`${config.urlBase.replace(/\/$/, '')}/siriusservidor/agendavendedor/obter?${query}`, {
    headers: { authorization: config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token },
  });
}
export type NovaAgendaSirius = { cliente: number; clienteNovo: number; codigoExterno: number; dataAgendaLong: number; horaInicioAgenda: string; horaFimAgenda: string; observacao: string; sequenciaRota: number; tipoInteracao: string; vendedor: number };
export async function inserirAgendaSirius(config: ConfigSirius, token: string, agendas: NovaAgendaSirius[]) {
  return request(`${config.urlBase.replace(/\/$/, '')}/siriusservidor/agendavendedor/inserir`, {
    method: 'POST', headers: { authorization: config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token, 'content-type': 'application/json' }, body: JSON.stringify(agendas),
  });
}

export async function alterarAgendaSirius(config: ConfigSirius, token: string, agenda: Record<string, unknown>) {
  return request(`${config.urlBase.replace(/\/$/, '')}/siriusservidor/agendavendedor/alterar`, {
    method: 'POST', headers: { authorization: config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token, 'content-type': 'application/json' }, body: JSON.stringify([agenda]),
  });
}
export async function excluirAgendaSirius(config: ConfigSirius, token: string, codigo: number) {
  if (!Number.isInteger(codigo) || codigo <= 0) throw new AppError(400, 'Código de agendamento inválido.');
  return request(`${config.urlBase.replace(/\/$/, '')}/siriusservidor/agendavendedor/excluir/${codigo}`, {
    method: 'DELETE', headers: { authorization: config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token },
  });
}

export async function consultarOcorrenciasTelemarketingSirius(config: ConfigSirius, token: string) {
  return request(`${config.urlBase.replace(/\/$/, '')}/siriusservidor/ocorrenciatmk/obter`, {
    headers: { authorization: config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token },
  });
}
export type AgendaEventoSirius = { codigoAgenda: number; codigoOcorrencia: number; contato: string; dataAgenda: number; horaAgenda: string; observacao: string; tipoInteracao: string; usuarioLogado: string };
export async function inserirAgendaEventoSirius(config: ConfigSirius, token: string, eventos: AgendaEventoSirius[]) {
  return request(`${config.urlBase.replace(/\/$/, '')}/siriusservidor/agendaevento/inserir`, {
    method: 'POST', headers: { authorization: config.formatoAuthorization === FormatoAuthorization.BEARER ? `Bearer ${token}` : token, 'content-type': 'application/json' }, body: JSON.stringify(eventos),
  });
}
