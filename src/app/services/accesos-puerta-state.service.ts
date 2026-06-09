import { Injectable } from '@angular/core';
import { CoverAccesoPuertaItem } from '../core/cover-acceso-puerta';
import { AppCacheService } from './app-cache.service';

export interface AccesosPuertaState {
  allItems: CoverAccesoPuertaItem[];
  activos: CoverAccesoPuertaItem[];
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root',
})
export class AccesosPuertaStateService {
  private readonly ttlMs = 2 * 60 * 1000;

  constructor(private appCacheService: AppCacheService) {}

  getState(userId: number): AccesosPuertaState | null {
    const state = this.appCacheService.get<AccesosPuertaState>(
      this.cacheKey(userId),
      'local'
    );
    if (!state) return null;
    return this.cloneState(state);
  }

  saveState(userId: number, state: AccesosPuertaState): void {
    this.appCacheService.set(this.cacheKey(userId), this.cloneState(state), 'local');
  }

  isCacheFresh(userId: number, now: number = Date.now()): boolean {
    const state = this.getState(userId);
    if (!state) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clear(userId: number): void {
    this.appCacheService.remove(this.cacheKey(userId), 'local');
  }

  private cacheKey(userId: number): string {
    return `eventum:cache:v1:accesos-puerta:user:${userId}`;
  }

  private cloneState(state: AccesosPuertaState): AccesosPuertaState {
    return {
      lastUpdated: state.lastUpdated,
      activos: state.activos.map((item) => this.cloneItem(item)),
      allItems: state.allItems.map((item) => this.cloneItem(item)),
    };
  }

  private cloneItem(item: CoverAccesoPuertaItem): CoverAccesoPuertaItem {
    return {
      compra: { ...item.compra },
      boleta: { ...item.boleta },
      esCedida: item.esCedida,
    };
  }
}
