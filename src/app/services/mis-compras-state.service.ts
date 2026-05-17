import { Injectable } from '@angular/core';
import { BoletaComprada, Compra, Evento, TrasladoBoleta } from '../types';
import { AppCacheService } from './app-cache.service';

export interface MisComprasState {
  compras: Compra[];
  comprasConBoletas: Array<{ compra: Compra; boletas: BoletaComprada[] }>;
  eventosConBoletas: any[];
  eventosDisponibles: Evento[];
  trasladosHistorial: TrasladoBoleta[];
  trasladosPendientesRecibir: any[];
  entradasCedidas: BoletaComprada[];
  estadoPagoFiltro: string | null;
  estadoCompraFiltro: string | null;
  eventoFiltro: number | null;
  fechaDesde: string;
  fechaHasta: string;
  searchTerm: string;
  page: number;
  total: number;
  totalPages: number;
  tabBoletasDetalle: 'sin-usar' | 'usadas' | 'sin-asignar';
  eventoExpandidoKey: string | null;
  eventoDetalleKey: string | null;
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root'
})
export class MisComprasStateService {
  private readonly ttlMs = 2 * 60 * 1000;

  constructor(private appCacheService: AppCacheService) {}

  getState(userId: number): MisComprasState | null {
    const state = this.appCacheService.get<MisComprasState>(this.cacheKey(userId), 'session');
    if (!state) return null;
    return this.cloneState(state);
  }

  saveState(userId: number, state: MisComprasState): void {
    this.appCacheService.set(this.cacheKey(userId), this.cloneState(state), 'session');
  }

  isCacheFresh(userId: number, now: number = Date.now()): boolean {
    const state = this.getState(userId);
    if (!state) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clear(userId: number): void {
    this.appCacheService.remove(this.cacheKey(userId), 'session');
  }

  private cacheKey(userId: number): string {
    return `eventum:cache:v1:mis-compras:user:${userId}`;
  }

  private cloneState(state: MisComprasState): MisComprasState {
    return {
      ...state,
      compras: [...state.compras],
      comprasConBoletas: state.comprasConBoletas.map((i) => ({ compra: i.compra, boletas: [...i.boletas] })),
      eventosConBoletas: [...state.eventosConBoletas],
      eventosDisponibles: [...state.eventosDisponibles],
      trasladosHistorial: [...state.trasladosHistorial],
      trasladosPendientesRecibir: [...state.trasladosPendientesRecibir],
      entradasCedidas: [...state.entradasCedidas]
    };
  }
}
