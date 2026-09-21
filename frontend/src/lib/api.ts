export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'include', headers: { 'content-type': 'application/json', ...init?.headers }, ...init });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detalhes = data.detalhes;
    const validacao = detalhes && typeof detalhes === 'object'
      ? [...(Array.isArray(detalhes.formErrors) ? detalhes.formErrors : []), ...Object.values(detalhes.fieldErrors || {}).flat()].filter(x => typeof x === 'string').join(' ')
      : '';
    throw new Error(validacao || data.erro || `Erro ${response.status}`);
  }
  return data;
}
export const moeda = (v?: number | string | null) => Number(v ?? 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
export const dataBr = (v?: string | null) => v ? new Intl.DateTimeFormat('pt-BR').format(new Date(v)) : 'Dados insuficientes';
export const rotulo = (v?: string) => v ? v.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase()) : '—';
