import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function exigirAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.gc_session;
  if (!token) return res.status(401).json({ erro: 'Sessão não encontrada' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    req.usuarioId = payload.sub;
    next();
  } catch { return res.status(401).json({ erro: 'Sessão expirada' }); }
}

