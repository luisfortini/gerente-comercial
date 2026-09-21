export function dividirPorMes(inicio: Date, fim: Date) {
  const partes: { inicio: Date; fim: Date }[] = [];
  let cursor = new Date(inicio);
  while (cursor <= fim) {
    const finalMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    partes.push({ inicio: new Date(cursor), fim: finalMes < fim ? finalMes : new Date(fim) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return partes;
}
