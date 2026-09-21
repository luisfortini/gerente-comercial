import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import { candidatosAgenda, confirmarAgenda, previaAgenda } from './services/agenda.js';
import { executarAcaoAgenda, visualizarAgenda } from './services/agenda-editor.js';
import { listarAtendimentosCrm, ocorrenciasCrm, registrarAtendimentoCrm } from './services/agenda-crm.js';

export const agendaRoutes = Router();
agendaRoutes.get('/eventos', asyncRoute(async (req, res) => res.json(await visualizarAgenda(req.usuarioId!, req.query))));
agendaRoutes.post('/eventos', asyncRoute(async (req, res) => res.json(await executarAcaoAgenda(req.usuarioId!, 'INCLUIR', req.body))));
agendaRoutes.patch('/eventos/:codigo', asyncRoute(async (req, res) => res.json(await executarAcaoAgenda(req.usuarioId!, 'ALTERAR', { ...req.body, codigo: Number(req.params.codigo) }))));
agendaRoutes.delete('/eventos/:codigo', asyncRoute(async (req, res) => res.json(await executarAcaoAgenda(req.usuarioId!, 'EXCLUIR', { ...req.body, codigo: Number(req.params.codigo) }))));
agendaRoutes.get('/acoes', asyncRoute(async (req, res) => res.json({ acoes: await prisma.acaoAgenda.findMany({ where: { usuarioId: req.usuarioId! }, orderBy: { criadoEm: 'desc' }, take: 20, select: { id: true, operacao: true, estado: true, resultado: true, criadoEm: true } }) })));
agendaRoutes.get('/crm/ocorrencias', asyncRoute(async (req, res) => res.json({ ocorrencias: await ocorrenciasCrm(req.usuarioId!, req.query.vendedorId ? String(req.query.vendedorId) : undefined) })));
agendaRoutes.get('/crm/atendimentos', asyncRoute(async (req, res) => {
  const filtro = z.object({ inicio: z.string(), fim: z.string(), vendedorId: z.string().optional() }).parse(req.query);
  res.json({ atendimentos: await listarAtendimentosCrm(req.usuarioId!, filtro.inicio, filtro.fim, filtro.vendedorId) });
}));
agendaRoutes.post('/eventos/:codigo/atendimentos', asyncRoute(async (req, res) => res.json(await registrarAtendimentoCrm(req.usuarioId!, Number(req.params.codigo), req.body))));
agendaRoutes.get('/candidatos', asyncRoute(async (req, res) => {
  const vendedorId = z.string().min(1).parse(req.query.vendedorId);
  res.json({ candidatos: await candidatosAgenda(vendedorId) });
}));
agendaRoutes.get('/planos', asyncRoute(async (req, res) => {
  res.json({ planos: await prisma.planoAgenda.findMany({ where: { usuarioId: req.usuarioId! }, orderBy: { criadoEm: 'desc' }, take: 20 }) });
}));
agendaRoutes.post('/previa', asyncRoute(async (req, res) => res.json(await previaAgenda(req.usuarioId!, req.body))));
agendaRoutes.post('/planos/:id/confirmar', asyncRoute(async (req, res) => res.json(await confirmarAgenda(req.usuarioId!, String(req.params.id)))));
