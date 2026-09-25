declare global {
  namespace Express { interface Request { usuarioId?: string; empresaId?: string; papel?: 'ADMIN' } }
}
export {};
