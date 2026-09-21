const statusSirius: Record<string, string> = {
  P: 'Positivado',
  C: 'Recusado',
  A: 'Em aberto',
  R: 'Reagendado',
};

export function statusSiriusLabel(status?: string, fallback = 'Sem status') {
  const codigo = status?.trim().toUpperCase();
  if (!codigo) return fallback;
  return statusSirius[codigo] || status!;
}
