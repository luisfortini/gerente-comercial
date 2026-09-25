import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function exigirAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.gc_session;
  if (!token) return res.status(401).json({ erro: 'Sessão não encontrada' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; empresaId: string; papel: 'ADMIN' };
    if (!payload.empresaId || payload.papel !== 'ADMIN') throw new Error('Sessão sem empresa');
    req.usuarioId = payload.sub;
    req.empresaId = payload.empresaId;
    req.papel = payload.papel;
    next();
  } catch { return res.status(401).json({ erro: 'Sessão expirada' }); }
}

export function exigirIdentidade(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.gc_identity;
  if (!token) return res.status(401).json({ erro: 'Faça login novamente' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; finalidade: string };
    if (payload.finalidade !== 'selecionar_empresa') throw new Error('Token inválido');
    req.usuarioId = payload.sub;
    next();
  } catch { return res.status(401).json({ erro: 'A seleção de empresa expirou' }); }
}
