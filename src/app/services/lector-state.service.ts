import { Injectable } from '@angular/core';
import { AppCacheService } from './app-cache.service';
import { PermisoEscaneo } from './lector-permisos.service';

interface LectorPermisosCacheState {
  userId: number | null;
  permisos: PermisoEscaneo[];
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root'
})
export class LectorStateService {
  private readonly ttlMs = 2 * 60 * 1000;
  private readonly latestCacheKey = 'eventum:cache:v1:lector:permisos:latest';

  constructor(private appCacheService: AppCacheService) {}

  getPermisos(userId: number): PermisoEscaneo[] | null {
    const state = this.appCacheService.get<LectorPermisosCacheState>(this.cacheKey(userId), 'local');
    if (!state) return null;
    return this.clonePermisos(state.permisos);
  }

  savePermisos(userId: number, permisos: PermisoEscaneo[], lastUpdated: number = Date.now()): void {
    const state: LectorPermisosCacheState = {
      userId,
      permisos: this.clonePermisos(permisos),
      lastUpdated
    };
    this.appCacheService.set(this.cacheKey(userId), state, 'local');
    this.appCacheService.set(this.latestCacheKey, state, 'local');
  }

  isCacheFresh(userId: number, now: number = Date.now()): boolean {
    const state = this.appCacheService.get<LectorPermisosCacheState>(this.cacheKey(userId), 'local');
    if (!state?.lastUpdated) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clear(userId: number): void {
    this.appCacheService.remove(this.cacheKey(userId), 'local');
  }

  getLatestPermisos(): PermisoEscaneo[] | null {
    const state = this.appCacheService.get<LectorPermisosCacheState>(this.latestCacheKey, 'local');
    if (!state) return null;
    return this.clonePermisos(state.permisos);
  }

  private cacheKey(userId: number): string {
    return `eventum:cache:v1:lector:permisos:user:${userId}`;
  }

  private clonePermisos(permisos: PermisoEscaneo[]): PermisoEscaneo[] {
    return (permisos || []).map((p) => ({ ...p }));
  }
}
