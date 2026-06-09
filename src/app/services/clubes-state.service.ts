import { Injectable } from '@angular/core';
import { DetalleLugarCoverPublico, LugarCoverListado } from '../types/covers';
import { AppCacheService } from './app-cache.service';

export interface ClubesExplorarState {
  lugares: LugarCoverListado[];
  scrollY: number;
  lastUpdated: number;
}

export interface ClubDetalleState {
  detalle: DetalleLugarCoverPublico;
  scrollY: number;
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root',
})
export class ClubesStateService {
  private readonly ttlMs = 2 * 60 * 1000;
  private readonly explorarCacheKey = 'eventum:cache:v1:clubes-explorar';
  private readonly detalleCacheKey = 'eventum:cache:v1:club-detalle';
  private explorarState: ClubesExplorarState | null = null;
  private hydratedDetalle = false;
  private readonly detalleByLugarId = new Map<number, ClubDetalleState>();

  constructor(private appCacheService: AppCacheService) {}

  getExplorarState(): ClubesExplorarState | null {
    if (!this.explorarState) {
      const persisted = this.appCacheService.get<ClubesExplorarState>(this.explorarCacheKey, 'local');
      if (persisted) {
        this.explorarState = this.cloneExplorarState(persisted);
      }
    }
    if (!this.explorarState) return null;
    return this.cloneExplorarState(this.explorarState);
  }

  saveExplorarState(state: ClubesExplorarState): void {
    if (!state.lugares?.length) {
      return;
    }
    this.explorarState = this.cloneExplorarState(state);
    this.appCacheService.set(this.explorarCacheKey, this.explorarState, 'local');
  }

  isExplorarCacheFresh(now: number = Date.now()): boolean {
    const state = this.getExplorarState();
    if (!state) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clearExplorar(): void {
    this.explorarState = null;
    this.appCacheService.remove(this.explorarCacheKey, 'local');
  }

  getDetalleState(lugarId: number): ClubDetalleState | null {
    this.hydrateDetalleIfNeeded();
    const state = this.detalleByLugarId.get(lugarId);
    if (!state) return null;
    return this.cloneDetalleState(state);
  }

  saveDetalleState(lugarId: number, state: ClubDetalleState): void {
    if (!state.detalle) {
      return;
    }
    this.hydrateDetalleIfNeeded();
    this.detalleByLugarId.set(lugarId, this.cloneDetalleState(state));
    this.persistDetalle();
  }

  isDetalleCacheFresh(lugarId: number, now: number = Date.now()): boolean {
    this.hydrateDetalleIfNeeded();
    const state = this.detalleByLugarId.get(lugarId);
    if (!state) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clearDetalle(lugarId?: number): void {
    this.hydrateDetalleIfNeeded();
    if (typeof lugarId === 'number') {
      this.detalleByLugarId.delete(lugarId);
      this.persistDetalle();
      return;
    }
    this.detalleByLugarId.clear();
    this.persistDetalle();
  }

  private hydrateDetalleIfNeeded(): void {
    if (this.hydratedDetalle) return;
    this.hydratedDetalle = true;
    const persisted = this.appCacheService.get<Record<string, ClubDetalleState>>(this.detalleCacheKey, 'local');
    if (!persisted || typeof persisted !== 'object') return;

    for (const [lugarIdRaw, rawState] of Object.entries(persisted)) {
      const lugarId = Number(lugarIdRaw);
      if (!Number.isFinite(lugarId) || !rawState?.detalle) continue;
      this.detalleByLugarId.set(lugarId, this.cloneDetalleState(rawState));
    }
  }

  private persistDetalle(): void {
    const serializable: Record<string, ClubDetalleState> = {};
    for (const [lugarId, state] of this.detalleByLugarId.entries()) {
      serializable[String(lugarId)] = this.cloneDetalleState(state);
    }
    this.appCacheService.set(this.detalleCacheKey, serializable, 'local');
  }

  private cloneExplorarState(state: ClubesExplorarState): ClubesExplorarState {
    return {
      ...state,
      lugares: [...state.lugares],
    };
  }

  private cloneDetalleState(state: ClubDetalleState): ClubDetalleState {
    return {
      ...state,
      detalle: {
        lugar: { ...state.detalle.lugar },
        tipos_cover: [...state.detalle.tipos_cover],
        sesiones: [...state.detalle.sesiones],
      },
    };
  }
}
