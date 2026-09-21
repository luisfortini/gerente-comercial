import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { AppError, asyncRoute } from './lib/errors.js';
import { exigirAuth } from './middleware/auth.js';
import { autenticarSirius, consultarSirius, endpointsSirius } from './services/sirius.js';
import { siriusSessions } from './services/sirius-session.js';
import { sincronizar } from './services/sync.js';
import { diferencaDias, mediana } from './domain/analytics.js';
import { agendaRoutes } from './agenda-routes.js';

export const routes = Router();
const loginSchema = z.object({ email: z.string().email(), senha: z.string().min(1) });

routes.get('/health', (_req, res) => res.json({ status: 'ok' }));
routes.post('/auth/login', asyncRoute(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const usuario = await prisma.usuario.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!usuario?.ativo || !(await bcrypt.compare(input.senha, usuario.senhaHash))) throw new AppError(401, 'E-mail ou senha inválidos');
  const token = jwt.sign({ sub: usuario.id }, env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie('gc_session', token, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: 8 * 60 * 60 * 1000, path: '/' });
  return res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
}));
routes.post('/auth/logout', exigirAuth, (req, res) => { if (req.usuarioId) siriusSessions.delete(req.usuarioId); res.clearCookie('gc_session', { path: '/' }); res.status(204).end(); });
routes.get('/auth/me', exigirAuth, asyncRoute(async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuarioId! }, select: { id: true, nome: true, email: true } });
  res.json({ usuario });
}));

routes.use(exigirAuth);
routes.use('/agenda', agendaRoutes);
const configSchema = z.object({ urlBase: z.string().url(), filialCodigo: z.coerce.number().int().positive(), login: z.string().min(1), senha: z.string().min(1), formatoAuthorization: z.enum(['PURO', 'BEARER']).default('PURO'), sistemaCodigo: z.coerce.number().int().optional(), sistemaVersao: z.string().optional(), subSistemaCodigo: z.coerce.number().int().optional(), subSistemaVersao: z.string().optional() });
routes.get('/sirius/config', asyncRoute(async (req, res) => {
  const config = await prisma.configuracaoSirius.findUnique({ where: { usuarioId: req.usuarioId! }, select: { urlBase: true, filialCodigo: true, loginSirius: true, formatoAuthorization: true, sistemaCodigo: true, sistemaVersao: true, subSistemaCodigo: true, subSistemaVersao: true, conectadoEm: true, ultimoStatus: true } });
  const sessao = siriusSessions.get(req.usuarioId!);
  res.json({ config: config ?? { urlBase: env.SIRIUS_DEFAULT_URL, filialCodigo: 1, formatoAuthorization: 'PURO' }, conectado: Boolean(sessao), usuarioNome: sessao?.usuarioNome });
}));
routes.post('/sirius/conectar', asyncRoute(async (req, res) => {
  const input = configSchema.parse(req.body);
  const result = await autenticarSirius(input);
  await prisma.configuracaoSirius.upsert({ where: { usuarioId: req.usuarioId! }, update: { urlBase: input.urlBase, filialCodigo: input.filialCodigo, loginSirius: input.login, formatoAuthorization: input.formatoAuthorization, sistemaCodigo: input.sistemaCodigo, sistemaVersao: input.sistemaVersao, subSistemaCodigo: input.subSistemaCodigo, subSistemaVersao: input.subSistemaVersao, conectadoEm: new Date(), ultimoStatus: 'Conectado' }, create: { usuarioId: req.usuarioId!, urlBase: input.urlBase, filialCodigo: input.filialCodigo, loginSirius: input.login, formatoAuthorization: input.formatoAuthorization, sistemaCodigo: input.sistemaCodigo, sistemaVersao: input.sistemaVersao, subSistemaCodigo: input.subSistemaCodigo, subSistemaVersao: input.subSistemaVersao, conectadoEm: new Date(), ultimoStatus: 'Conectado' } });
  siriusSessions.set(req.usuarioId!, { token: result.auth.token, conectadoEm: new Date(), usuarioNome: result.auth.usuarioNome, filialCodigo: result.auth.filialCodigo });
  res.json({ conectado: true, usuarioNome: result.auth.usuarioNome, filialCodigo: result.auth.filialCodigo, duracaoMs: result.duracaoMs, mensagem: result.auth.mensagem });
}));

const diagnosticoSchema = z.object({ tipo: z.enum(['vendedores','vendedor','carteira','vendas','produtoCliente','vendaCliente','vendaProduto','mix']), body: z.record(z.unknown()).optional() });
routes.post('/diagnostico', asyncRoute(async (req, res) => {
  const input = diagnosticoSchema.parse(req.body);
  const config = await prisma.configuracaoSirius.findUnique({ where: { usuarioId: req.usuarioId! } }); const sessao = siriusSessions.get(req.usuarioId!);
  if (!config || !sessao) throw new AppError(401, 'Reconecte ao Sírius');
  const inicio = performance.now();
  const mascarar = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.slice(0, 3).map(mascarar);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /cpf|cnpj|documento|inscricao|telefone|celular|email|endereco|logradouro|bairro|cep|nome|razao|fantasia/i.test(k) ? '***mascarado***' : mascarar(v)]));
  };
  const endpoint = endpointsSirius.get(input.tipo)!;
  try {
    const result = await consultarSirius(input.tipo, config, sessao.token, input.body);
    res.json({ sucesso: true, endpoint: endpoint.rota, metodo: endpoint.metodo, statusHttp: result.status, duracaoMs: result.duracaoMs, quantidade: result.quantidade, campos: result.campos, amostra: mascarar(result.data) });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const details = error.details as { statusSirius?: number } | undefined;
    res.json({ sucesso: false, endpoint: endpoint.rota, metodo: endpoint.metodo, statusHttp: details?.statusSirius ?? error.status, duracaoMs: Math.round(performance.now() - inicio), quantidade: 0, campos: [], erro: error.message });
  }
}));

routes.post('/sincronizacoes', asyncRoute(async (req, res) => {
  const input = z.object({ dataInicial: z.coerce.date(), dataFinal: z.coerce.date(), filial: z.coerce.number().int().positive(), vendedores: z.array(z.number().int()).optional(), apenasErros: z.boolean().optional() }).parse(req.body);
  if (input.dataInicial > input.dataFinal) throw new AppError(400, 'A data inicial deve ser anterior à final');
  res.json({ execucoes: await sincronizar(req.usuarioId!, input) });
}));
routes.get('/sincronizacoes', asyncRoute(async (_req, res) => res.json({ execucoes: await prisma.execucaoSincronizacao.findMany({ orderBy: { iniciadaEm: 'desc' }, take: 50 }) })));

routes.get('/vendedores', asyncRoute(async (_req, res) => res.json({ vendedores: await prisma.vendedor.findMany({ orderBy: { nome: 'asc' } }) })));
routes.get('/dashboard', asyncRoute(async (req, res) => {
  const filtro = z.object({ inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), vendedorId: z.string().min(1).optional() }).parse(req.query);
  const hoje = new Date();
  const padraoInicio = new Date(hoje); padraoInicio.setFullYear(padraoInicio.getFullYear() - 1);
  const inicio = filtro.inicio ? new Date(`${filtro.inicio}T00:00:00.000Z`) : padraoInicio;
  const fim = filtro.fim ? new Date(`${filtro.fim}T23:59:59.999Z`) : hoje;
  if (inicio > fim) throw new AppError(400, 'A data inicial deve ser anterior ou igual à data final');
  const vendedorId = filtro.vendedorId;
  const where = { modoRelatorio: 0, dataEmissao: { gte: inicio, lte: fim }, ...(vendedorId ? { vendedorId } : {}) };
  const vendas = await prisma.venda.findMany({ where, include: { vendedor: true } });
  const oportunidades = await prisma.oportunidadeComercial.findMany({ where: { ultimaCompraEm: { gte: inicio, lte: fim }, ...(vendedorId ? { vendedorId } : {}) } });
  const faturamento = vendas.reduce((s, v) => s + Number(v.valorTotal), 0);
  const porMes = new Map<string, number>(); const porVendedor = new Map<string, number>();
  vendas.forEach(v => { const mes = v.dataEmissao.toISOString().slice(0,7); porMes.set(mes, (porMes.get(mes) ?? 0) + Number(v.valorTotal)); const nome=v.vendedor?.nome ?? 'Sem vendedor'; porVendedor.set(nome,(porVendedor.get(nome)??0)+Number(v.valorTotal)); });
  const count = (key: 'prioridade'|'tipo') => {
    const grupos = new Map<string, number>();
    oportunidades.forEach(o => grupos.set(o[key], (grupos.get(o[key]) ?? 0) + 1));
    return [...grupos].map(([nome, valor]) => ({ nome, valor }));
  };
  res.json({ periodo: { inicio: inicio.toISOString(), fim: fim.toISOString(), vendedorId: vendedorId ?? null }, indicadores: { faturamento, vendas: vendas.length, ticketMedio: vendas.length ? faturamento / vendas.length : 0, clientesAtivos: new Set(vendas.map(v => v.clienteId)).size, recompraAtrasada: oportunidades.filter(o => o.tipo === 'RECOMPRA_CLIENTE').length, clientesRisco: oportunidades.filter(o => o.tipo === 'CLIENTE_EM_QUEDA').length, oportunidades: oportunidades.length, potencial: oportunidades.reduce((s,o)=>s+Number(o.valorPotencial??0),0) }, graficos: { faturamentoMensal: [...porMes].map(([nome,valor])=>({nome,valor})).sort((a,b)=>a.nome.localeCompare(b.nome)), vendasVendedor: [...porVendedor].map(([nome,valor])=>({nome,valor})), oportunidadesPrioridade: count('prioridade'), oportunidadesTipo: count('tipo') } });
}));

routes.get('/oportunidades', asyncRoute(async (req, res) => {
  const where: Record<string, unknown> = {}; if (req.query.vendedorId) where.vendedorId=String(req.query.vendedorId); if(req.query.prioridade) where.prioridade=String(req.query.prioridade); if(req.query.tipo) where.tipo=String(req.query.tipo);
  res.json({ oportunidades: await prisma.oportunidadeComercial.findMany({ where, include: { cliente: true, vendedor: true, produto: true }, orderBy: [{ prioridade: 'desc' }, { pontuacao: 'desc' }] }) });
}));
routes.patch('/oportunidades/:id/status', asyncRoute(async (req, res) => {
  const { status } = z.object({ status: z.enum(['NOVA','EM_ANALISE','ENCAMINHADA','CONTATO_REALIZADO','VENDA_REALIZADA','SEM_INTERESSE','DESCARTADA']) }).parse(req.body);
  const oportunidade = await prisma.oportunidadeComercial.update({ where: { id: String(req.params.id) }, data: { status } });
  res.json({ oportunidade });
}));
routes.get('/clientes', asyncRoute(async (_req,res) => {
  const clientes = await prisma.cliente.findMany({ include: { vendedor: true, _count: { select: { vendas: { where: { modoRelatorio: 0 } }, oportunidades: true } } }, orderBy: { nomeFantasia: 'asc' } });
  res.json({ clientes });
}));
routes.get('/clientes/:id', asyncRoute(async (req,res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: String(req.params.id) },
    include: { vendedor: true, vendas: { where: { modoRelatorio: 0 }, include: { itens: { include: { produto: true } } }, orderBy: { dataEmissao: 'desc' } }, oportunidades: { include: { produto: true }, orderBy: { pontuacao: 'desc' } } },
  });
  if (!cliente) throw new AppError(404,'Cliente não encontrado');
  const faturamento = cliente.vendas.reduce((s,v) => s + Number(v.valorTotal), 0);
  const mensal = new Map<string,number>();
  const produtos = new Map<string,{descricao:string,fabricante:string|null,quantidade:number,valor:number,datas:Date[]}>();
  cliente.vendas.forEach(v => {
    const mes = v.dataEmissao.toISOString().slice(0,7);
    mensal.set(mes,(mensal.get(mes)??0)+Number(v.valorTotal));
    v.itens.forEach(i => {
      const atual=produtos.get(i.produtoId)??{descricao:i.produto.descricao,fabricante:i.produto.fabricante,quantidade:0,valor:0,datas:[]};
      atual.quantidade += Number(i.quantidade); atual.valor += Number(i.valorTotal); atual.datas.push(v.dataEmissao); produtos.set(i.produtoId,atual);
    });
  });
  const produtosResumo = [...produtos.values()].map(({ datas, ...produto }) => {
    const ordenadas = [...datas].sort((a,b)=>a.getTime()-b.getTime());
    const intervalos = ordenadas.slice(1).map((data, indice) => diferencaDias(ordenadas[indice], data));
    return { ...produto, compras: new Set(ordenadas.map(data => data.toISOString().slice(0,10))).size, ultimaCompra: ordenadas.at(-1) ?? null, intervaloTipicoDias: intervalos.length ? Math.round(mediana(intervalos.filter(dias => dias > 0))) || null : null };
  });
  res.json({ cliente, resumo: { faturamento, ticketMedio: cliente.vendas.length ? faturamento/cliente.vendas.length : 0, ultimaCompra: cliente.vendas[0]?.dataEmissao??null, historicoMensal: [...mensal].map(([mes,valor])=>({mes,valor})).sort((a,b)=>a.mes.localeCompare(b.mes)), produtos:produtosResumo.sort((a,b)=>b.valor-a.valor).slice(0,10) } });
}));
