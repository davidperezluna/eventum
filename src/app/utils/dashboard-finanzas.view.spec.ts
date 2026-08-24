import { describe, expect, it } from 'vitest';
import { DashboardStats } from '../types';
import { buildFinanzasOrganizadorView } from './dashboard-finanzas.view';

describe('buildFinanzasOrganizadorView', () => {
  it('shows the service percentage over the sale subtotal', () => {
    const stats = {
      ingresos_totales: 108_000,
      valor_servicio_total: 8_000,
      neto_ventas_post_wompi_total: 100_000,
    } as DashboardStats;

    expect(buildFinanzasOrganizadorView(stats, false).servicioPct).toBe(8);
  });

  it('does not report 7 % for a configured 8 % service charge', () => {
    const stats = {
      ingresos_totales: 216_000,
      valor_servicio_total: 16_000,
      neto_ventas_post_wompi_total: 200_000,
    } as DashboardStats;

    const view = buildFinanzasOrganizadorView(stats, false);
    expect(view.servicioPct).toBe(8);
    expect(view.servicioEventum).toBe(16_000);
  });
});
