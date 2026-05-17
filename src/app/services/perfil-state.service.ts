import { Injectable } from '@angular/core';
import { Usuario } from '../types';
import { AppCacheService } from './app-cache.service';

export interface PerfilState {
  usuario: Usuario;
  formData: Partial<Usuario>;
  previewUrl: string | null;
  masDatosPerfilAbierto: boolean;
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root'
})
export class PerfilStateService {
  private readonly ttlMs = 2 * 60 * 1000;

  constructor(private appCacheService: AppCacheService) {}

  getState(userId: number): PerfilState | null {
    const state = this.appCacheService.get<PerfilState>(this.cacheKey(userId), 'session');
    if (!state) return null;
    return this.cloneState(state);
  }

  saveState(userId: number, state: PerfilState): void {
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
    return `eventum:cache:v1:perfil:user:${userId}`;
  }

  private cloneState(state: PerfilState): PerfilState {
    return {
      ...state,
      usuario: { ...state.usuario },
      formData: { ...state.formData }
    };
  }
}
