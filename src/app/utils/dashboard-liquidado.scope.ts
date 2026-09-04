/**
 * Alcance de dashboards globales: solo eventos con liquidado = false.
 * Cuando hay eventoId (Inteligencia / ficha), no se aplica el filtro.
 */

export function applyLiquidadoDashboardScope(
  query: any,
  options: {
    eventoId?: number;
    nonLiquidatedIds: number[] | null;
    column?: string;
  }
): any {
  const { eventoId, nonLiquidatedIds, column = 'evento_id' } = options;
  if (eventoId != null || nonLiquidatedIds == null) {
    return query;
  }
  if (nonLiquidatedIds.length === 0) {
    return query.in(column, [-1]);
  }
  return query.in(column, nonLiquidatedIds);
}
