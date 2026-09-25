type SessaoSirius = { token: string; conectadoEm: Date; usuarioNome?: string; filialCodigo: number };
const sessoes = new Map<string, SessaoSirius>();
export const siriusSessions = {
  get: (empresaId: string) => sessoes.get(empresaId),
  set: (empresaId: string, sessao: SessaoSirius) => sessoes.set(empresaId, sessao),
  delete: (empresaId: string) => sessoes.delete(empresaId),
};
