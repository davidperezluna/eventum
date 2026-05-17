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

interface PerfilPublicState {
  usuario: Partial<Usuario>;
  formData: Partial<Usuario>;
  previewUrl: string | null;
  masDatosPerfilAbierto: boolean;
  lastUpdated: number;
}

interface PerfilSensitiveState {
  usuario: Usuario;
  formData: Partial<Usuario>;
}

export interface PerfilStateResult {
  state: PerfilState | null;
  hasSensitiveData: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PerfilStateService {
  private readonly ttlMs = 2 * 60 * 1000;

  constructor(private appCacheService: AppCacheService) {}

  getState(userId: number): PerfilStateResult {
    const publicState = this.appCacheService.get<PerfilPublicState>(this.publicCacheKey(userId), 'local');
    if (!publicState) {
      return { state: null, hasSensitiveData: false };
    }

    const sensitiveState = this.appCacheService.get<PerfilSensitiveState>(this.sensitiveCacheKey(userId), 'session');
    const mergedState: PerfilState = {
      usuario: (sensitiveState?.usuario || publicState.usuario) as Usuario,
      formData: sensitiveState?.formData || publicState.formData || {},
      previewUrl: publicState.previewUrl ?? null,
      masDatosPerfilAbierto: publicState.masDatosPerfilAbierto,
      lastUpdated: publicState.lastUpdated
    };

    return {
      state: this.cloneState(mergedState),
      hasSensitiveData: !!sensitiveState
    };
  }

  saveState(userId: number, state: PerfilState): void {
    const safeState = this.cloneState(state);
    const publicState: PerfilPublicState = {
      usuario: {
        id: safeState.usuario.id,
        nombre: safeState.usuario.nombre,
        apellido: safeState.usuario.apellido,
        email: safeState.usuario.email,
        telefono: safeState.usuario.telefono,
        genero: safeState.usuario.genero,
        ciudad: safeState.usuario.ciudad,
        pais: safeState.usuario.pais,
        foto_perfil: safeState.usuario.foto_perfil,
        tipo_usuario_id: safeState.usuario.tipo_usuario_id
      },
      formData: {
        nombre: safeState.formData.nombre || '',
        apellido: safeState.formData.apellido || '',
        telefono: safeState.formData.telefono || '',
        genero: safeState.formData.genero,
        ciudad: safeState.formData.ciudad || '',
        pais: safeState.formData.pais || '',
        foto_perfil: safeState.formData.foto_perfil || ''
      },
      previewUrl: safeState.previewUrl,
      masDatosPerfilAbierto: safeState.masDatosPerfilAbierto,
      lastUpdated: safeState.lastUpdated
    };

    const sensitiveState: PerfilSensitiveState = {
      usuario: safeState.usuario,
      formData: safeState.formData
    };

    this.appCacheService.set(this.publicCacheKey(userId), publicState, 'local');
    this.appCacheService.set(this.sensitiveCacheKey(userId), sensitiveState, 'session');
  }

  isCacheFresh(userId: number, now: number = Date.now()): boolean {
    const result = this.getState(userId);
    if (!result.state) return false;
    return now - result.state.lastUpdated < this.ttlMs;
  }

  clear(userId: number): void {
    this.appCacheService.remove(this.publicCacheKey(userId), 'local');
    this.appCacheService.remove(this.sensitiveCacheKey(userId), 'session');
  }

  private publicCacheKey(userId: number): string {
    return `eventum:cache:v1:perfil:public:user:${userId}`;
  }

  private sensitiveCacheKey(userId: number): string {
    return `eventum:cache:v1:perfil:sensitive:user:${userId}`;
  }

  private cloneState(state: PerfilState): PerfilState {
    return {
      ...state,
      usuario: { ...state.usuario },
      formData: { ...state.formData }
    };
  }
}
