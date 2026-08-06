/* ============================================
   DASHBOARD ORGANIZADOR SERVICE
   Delegación a DashboardService (única fuente)
   ============================================ */

import { Injectable } from '@angular/core';
import { DashboardService } from './dashboard.service';
import { DashboardStats } from '../types';

@Injectable({
  providedIn: 'root'
})
export class DashboardOrganizadorService {
  constructor(private dashboardService: DashboardService) {}

  /**
   * @deprecated Preferir DashboardService.getStats({ organizadorId, eventoId })
   */
  async getStats(organizadorId: number, eventoId?: number): Promise<DashboardStats> {
    return this.dashboardService.getStats({ organizadorId, eventoId });
  }
}
