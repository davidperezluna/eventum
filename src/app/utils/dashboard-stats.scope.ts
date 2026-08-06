export interface DashboardStatsScope {
  eventoId?: number;
  organizadorId?: number;
}

export function normalizeDashboardStatsScope(
  scope?: number | DashboardStatsScope
): DashboardStatsScope {
  if (scope == null) {
    return {};
  }
  if (typeof scope === 'number') {
    return { eventoId: scope };
  }
  return scope;
}
