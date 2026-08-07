import { Injectable } from '@angular/core';
import { DashboardService } from '../services/dashboard.service';
import { ReportesService, ReporteEvento, ReporteVentas } from '../services/reportes.service';
import { EventosService } from '../services/eventos.service';
import { AuthService } from '../services/auth.service';
import { DashboardStats, Evento, Producto, TipoBoleta, CuponDescuento } from '../types';
import { DemoScenarioService } from './demo-scenario.service';
import { DemoBuildContext } from './demo-scenario.types';
import { pickHeroEvento } from './demo-stats.builder';
import { DemoBaseScenario } from './demo-base.scenario';

/**
 * Fachada de datos para pantallas del panel.
 * Delega a servicios reales o al escenario activo sin que las pantallas conozcan el laboratorio.
 */
@Injectable({ providedIn: 'root' })
export class DemoDataProvider {
  private contextCache: { orgId: number; at: number; ctx: DemoBuildContext } | null = null;
  private readonly contextTtlMs = 30_000;

  constructor(
    private authService: AuthService,
    private dashboardService: DashboardService,
    private reportesService: ReportesService,
    private eventosService: EventosService,
    private demoScenarioService: DemoScenarioService,
  ) {}

  async getOrganizerDashboardStats(organizadorId: number): Promise<DashboardStats> {
    const scenario = this.activeScenario();
    if (!scenario) {
      return this.dashboardService.getStats({ organizadorId });
    }
    const ctx = await this.buildContext(organizadorId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.buildOrganizerDashboard(ctx, params);
  }

  async getEventDashboardStats(organizadorId: number | null, eventoId: number): Promise<DashboardStats | null> {
    const scenario = this.activeScenario();
    if (!scenario) {
      if (organizadorId != null) {
        return this.dashboardService.getStats({ organizadorId, eventoId }).catch(() => null);
      }
      return this.dashboardService.getStats(eventoId).catch(() => null);
    }
    const orgId = organizadorId ?? this.authService.getUsuarioId();
    if (orgId == null) return null;
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.buildEventDashboardStats(ctx, params, eventoId);
  }

  async getReporteEvento(organizadorId: number | null, eventoId: number): Promise<ReporteEvento | null> {
    const scenario = this.activeScenario();
    if (!scenario) {
      return this.reportesService.getReporteEvento(eventoId).catch(() => null);
    }
    const orgId = organizadorId ?? this.authService.getUsuarioId();
    if (orgId == null) return null;
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.buildReporteEvento(ctx, params, eventoId);
  }

  async getVentasPorDia(
    desde: string,
    hasta: string,
    organizadorId: number | undefined,
    eventoId: number,
  ): Promise<ReporteVentas[]> {
    const scenario = this.activeScenario();
    if (!scenario) {
      return this.reportesService
        .getVentasPorDia(desde, hasta, organizadorId, eventoId)
        .catch(() => []);
    }
    const orgId = organizadorId ?? this.authService.getUsuarioId();
    if (orgId == null) return [];
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.buildVentasPorDia(ctx, params, eventoId);
  }

  async applyTiposBoleta(tipos: TipoBoleta[], eventoId: number): Promise<TipoBoleta[]> {
    const scenario = this.activeScenario();
    if (!scenario) return tipos;
    const orgId = this.authService.getUsuarioId();
    if (orgId == null) return tipos;
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.applyTiposBoleta(tipos, ctx, params, eventoId);
  }

  async applyProductos(productos: Producto[], eventoId: number): Promise<Producto[]> {
    const scenario = this.activeScenario();
    if (!scenario) return productos;
    const orgId = this.authService.getUsuarioId();
    if (orgId == null) return productos;
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.applyProductos(productos, ctx, params, eventoId);
  }

  async applyCupones(cupones: CuponDescuento[], eventoId: number): Promise<CuponDescuento[]> {
    const scenario = this.activeScenario();
    if (!scenario) return cupones;
    const orgId = this.authService.getUsuarioId();
    if (orgId == null) return cupones;
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    return scenario.applyCupones(cupones, ctx, params, eventoId);
  }

  async applyEventoPresentation(evento: Evento): Promise<Evento> {
    const scenario = this.activeScenario();
    if (!scenario) return evento;
    const orgId = this.authService.getUsuarioId();
    if (orgId == null) return evento;
    const ctx = await this.buildContext(orgId);
    const params = this.demoScenarioService.getActiveState()!.params;
    const hints = scenario.getEventoPresentationHints(ctx, params, evento.id);
    if (scenario instanceof DemoBaseScenario) {
      return scenario.applyEventoHints(evento, hints);
    }
    return evento;
  }

  invalidateContextCache(): void {
    this.contextCache = null;
  }

  private activeScenario() {
    if (!this.demoScenarioService.isSimulatedViewActive()) return null;
    return this.demoScenarioService.getActiveScenarioDefinition();
  }

  private async buildContext(organizadorId: number): Promise<DemoBuildContext> {
    const now = Date.now();
    if (
      this.contextCache &&
      this.contextCache.orgId === organizadorId &&
      now - this.contextCache.at < this.contextTtlMs
    ) {
      return this.contextCache.ctx;
    }

    const response = await this.eventosService
      .getEventos({ organizador_id: organizadorId, limit: 50, activo: undefined })
      .catch(() => ({ data: [] as Evento[] }));

    const eventos = response.data ?? [];
    const state = this.demoScenarioService.getActiveState();
    let heroEvento: Evento | null = null;

    if (state?.heroEventoId) {
      heroEvento = eventos.find((e) => e.id === state.heroEventoId) ?? null;
    }
    if (!heroEvento) {
      const provisional: DemoBuildContext = {
        organizadorId,
        eventos,
        heroEventoId: null,
        heroEvento: null,
      };
      heroEvento = pickHeroEvento(provisional);
    }

    const ctx: DemoBuildContext = {
      organizadorId,
      eventos,
      heroEventoId: heroEvento?.id ?? null,
      heroEvento,
    };

    this.contextCache = { orgId: organizadorId, at: now, ctx };
    return ctx;
  }
}
