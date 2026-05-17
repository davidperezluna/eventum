import { Injectable } from '@angular/core';
import { CategoriaEvento, Evento, Lugar, Palco, TipoBoleta } from '../types';
import { AppCacheService } from './app-cache.service';

export interface DetalleEventoState {
  evento: Evento;
  tiposBoleta: TipoBoleta[];
  lugar: Lugar | null;
  categoria: CategoriaEvento | null;
  palcosDisponiblesPorTipo: Map<number, Palco[]>;
  palcosCatalogoPorTipo: Map<number, Palco[]>;
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root'
})
export class DetalleEventoStateService {
  private readonly ttlMs = 5 * 60 * 1000;
  private readonly cacheKey = 'eventum:cache:v1:detalle-evento';
  private hydrated = false;
  private readonly stateByEventoId = new Map<number, DetalleEventoState>();

  constructor(private appCacheService: AppCacheService) {}

  getState(eventoId: number): DetalleEventoState | null {
    this.hydrateIfNeeded();
    const state = this.stateByEventoId.get(eventoId);
    if (!state) return null;
    return this.cloneState(state);
  }

  saveState(eventoId: number, state: DetalleEventoState): void {
    this.hydrateIfNeeded();
    this.stateByEventoId.set(eventoId, this.cloneState(state));
    this.persist();
  }

  isCacheFresh(eventoId: number, now: number = Date.now()): boolean {
    this.hydrateIfNeeded();
    const state = this.stateByEventoId.get(eventoId);
    if (!state) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clear(eventoId?: number): void {
    this.hydrateIfNeeded();
    if (typeof eventoId === 'number') {
      this.stateByEventoId.delete(eventoId);
      this.persist();
      return;
    }
    this.stateByEventoId.clear();
    this.persist();
  }

  private cloneState(state: DetalleEventoState): DetalleEventoState {
    return {
      ...state,
      tiposBoleta: [...state.tiposBoleta],
      lugar: state.lugar ? { ...state.lugar } : null,
      categoria: state.categoria ? { ...state.categoria } : null,
      palcosDisponiblesPorTipo: new Map(
        Array.from(state.palcosDisponiblesPorTipo.entries()).map(([k, v]) => [k, [...v]])
      ),
      palcosCatalogoPorTipo: new Map(
        Array.from(state.palcosCatalogoPorTipo.entries()).map(([k, v]) => [k, [...v]])
      )
    };
  }

  private hydrateIfNeeded(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    const persisted = this.appCacheService.get<Record<string, any>>(this.cacheKey, 'local');
    if (!persisted || typeof persisted !== 'object') return;

    for (const [eventoIdRaw, rawState] of Object.entries(persisted)) {
      const eventoId = Number(eventoIdRaw);
      if (!Number.isFinite(eventoId) || !rawState) continue;
      this.stateByEventoId.set(eventoId, this.deserializeState(rawState));
    }
  }

  private persist(): void {
    const serializable: Record<string, unknown> = {};
    for (const [eventoId, state] of this.stateByEventoId.entries()) {
      serializable[String(eventoId)] = this.serializeState(state);
    }
    this.appCacheService.set(this.cacheKey, serializable, 'local');
  }

  private serializeState(state: DetalleEventoState): Record<string, unknown> {
    return {
      ...state,
      palcosDisponiblesPorTipo: Array.from(state.palcosDisponiblesPorTipo.entries()),
      palcosCatalogoPorTipo: Array.from(state.palcosCatalogoPorTipo.entries())
    };
  }

  private deserializeState(raw: any): DetalleEventoState {
    return {
      evento: raw.evento,
      tiposBoleta: raw.tiposBoleta || [],
      lugar: raw.lugar || null,
      categoria: raw.categoria || null,
      palcosDisponiblesPorTipo: new Map((raw.palcosDisponiblesPorTipo || []) as Array<[number, Palco[]]>),
      palcosCatalogoPorTipo: new Map((raw.palcosCatalogoPorTipo || []) as Array<[number, Palco[]]>),
      lastUpdated: Number(raw.lastUpdated || 0)
    };
  }
}
