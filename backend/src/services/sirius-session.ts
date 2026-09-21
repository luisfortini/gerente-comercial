type SessaoSirius = { token: string; conectadoEm: Date; usuarioNome?: string; filialCodigo: number };
const sessoes = new Map<string, SessaoSirius>();
export const siriusSessions = {
  get: (usuarioId: string) => sessoes.get(usuarioId),
  set: (usuarioId: string, sessao: SessaoSirius) => sessoes.set(usuarioId, sessao),
  delete: (usuarioId: string) => sessoes.delete(usuarioId),
};

