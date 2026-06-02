import { Injectable } from '@angular/core';
import { CategoriaEvento, Evento } from '../types';
import { AppCacheService } from './app-cache.service';

export interface EventosClienteState {
  eventos: Evento[];
  eventosFiltrados: Evento[];
  eventosFinalizados: Evento[];
  categorias: CategoriaEvento[];
  resumenProductosPorEvento: Record<string, { cantidad: number; precioMinimo: number }>;
  searchTerm: string;
  categoriaFiltro: number | null;
  scrollY: number;
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root'
})
export class EventosClienteStateService {
  private readonly ttlMs = 5 * 60 * 1000;
  private readonly cacheKey = 'eventum:cache:v1:eventos-cliente';
  private state: EventosClienteState | null = null;

  constructor(private appCacheService: AppCacheService) {}

  getState(): EventosClienteState | null {
    if (!this.state) {
      const persisted = this.appCacheService.get<EventosClienteState>(this.cacheKey, 'local');
      if (persisted) {
        this.state = this.cloneState(persisted);
      }
    }
    if (!this.state) return null;
    return this.cloneState(this.state);
  }

  saveState(state: EventosClienteState): void {
    this.state = this.cloneState(state);
    this.appCacheService.set(this.cacheKey, this.state, 'local');
  }

  isCacheFresh(now: number = Date.now()): boolean {
    if (!this.state) return false;
    return now - this.state.lastUpdated < this.ttlMs;
  }

  clear(): void {
    this.state = null;
    this.appCacheService.remove(this.cacheKey, 'local');
  }

  private cloneState(state: EventosClienteState): EventosClienteState {
    return {
      ...state,
      eventos: [...state.eventos],
      eventosFiltrados: [...state.eventosFiltrados],
      eventosFinalizados: [...state.eventosFinalizados],
      categorias: [...state.categorias],
      resumenProductosPorEvento: { ...state.resumenProductosPorEvento }
    };
  }
}
