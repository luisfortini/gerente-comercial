import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(400).json({ erro: 'Dados inválidos', detalhes: error.flatten() });
  if (error instanceof AppError) return res.status(error.status).json({ erro: error.message, detalhes: error.details });
  console.error({ erro: error instanceof Error ? error.message : 'Erro desconhecido' });
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}

export const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => void fn(req, res).catch(next);

