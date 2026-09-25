import { describe, expect, it } from 'vitest';
import { dividirPorMes } from '../src/domain/periods.js';
describe('sincronização idempotente', () => {
  it('divide períodos longos sem sobreposição', () => {
    const partes = dividirPorMes(new Date('2026-01-15'), new Date('2026-03-10'));
    expect(partes).toHaveLength(3);
    expect(partes[0].inicio.toISOString().slice(0,10)).toBe('2026-01-15');
    expect(partes[2].fim.toISOString().slice(0,10)).toBe('2026-03-10');
  });
  it('usa upserts e chaves únicas no schema para repetição segura', async () => {
    const schema = await import('node:fs/promises').then(fs => fs.readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'));
    expect(schema).toContain('@@unique([empresaId, codigoExterno, filialCodigo])');
    expect(schema).toContain('@@unique([empresaId, chaveExterna])');
    expect(schema).toContain('@@unique([vendaId, produtoId])');
    expect(schema).toContain('onDelete: Cascade');
  });
});
