import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  LectorPermisosService,
  PermisoEscaneo,
} from '../../services/lector-permisos.service';
import { LectorStateService } from '../../services/lector-state.service';
import type { AuthStateCallback } from '../../services/auth.service';

type GrupoEvento = {
  evento_id: number;
  titulo: string;
  tipos: { tipo_boleta_id: number | null; nombre: string }[];
};

type GrupoLugar = {
  lugar_id: number;
  titulo: string;
  tipos: { tipo_cover_id: number; nombre: string }[];
};

@Component({
  selector: 'app-lector-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './lector-home.html',
  styleUrl: './lector-home.css',
})
export class LectorHome implements OnInit, OnDestroy {
  permisos: PermisoEscaneo[] = [];
  grupos: GrupoEvento[] = [];
  gruposCover: GrupoLugar[] = [];
  loading = true;
  refreshing = false;
  private unsubscribeAuthState: (() => void) | null = null;

  constructor(
    private authService: AuthService,
    private lectorPermisos: LectorPermisosService,
    private lectorStateService: LectorStateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const userId = this.authService.getUsuarioId();
    const cachedPermisos =
      (userId ? this.lectorStateService.getPermisos(userId) : null) ||
      this.lectorStateService.getLatestPermisos();

    if (cachedPermisos) {
      this.aplicarPermisos(cachedPermisos);
      this.loading = false;
      this.cdr.markForCheck();
      void this.cargarPermisos({ background: true, userId: this.authService.getUsuarioId() });
      this.suscribirRecargaPorAuth();
      return;
    }

    void this.cargarPermisos({ background: false, userId: this.authService.getUsuarioId() });
    this.suscribirRecargaPorAuth();
  }

  ngOnDestroy(): void {
    if (this.unsubscribeAuthState) {
      this.unsubscribeAuthState();
      this.unsubscribeAuthState = null;
    }
  }

  get usuario() {
    return this.authService.getUsuario();
  }

  private aplicarPermisos(permisos: PermisoEscaneo[]): void {
    this.permisos = [...permisos];
    this.grupos = this.agruparPorEvento(this.permisos);
    this.gruposCover = this.agruparPorLugar(this.permisos);
  }

  private async cargarPermisos(options?: { background?: boolean; userId: number | null }): Promise<void> {
    const background = options?.background ?? false;
    this.loading = !background;
    this.refreshing = background;
    try {
      const permisos = await this.lectorPermisos.fetchMisPermisosEscaneo();
      this.aplicarPermisos(permisos);
      if (options?.userId) {
        this.lectorStateService.savePermisos(options.userId, this.permisos);
      }
    } catch {
      if (!background) {
        this.permisos = [];
        this.grupos = [];
        this.gruposCover = [];
      }
    } finally {
      this.loading = false;
      this.refreshing = false;
      this.cdr.markForCheck();
    }
  }

  private suscribirRecargaPorAuth(): void {
    const callback: AuthStateCallback = () => {
      const userId = this.authService.getUsuarioId();
      if (!userId) return;

      if (this.permisos.length > 0) {
        void this.cargarPermisos({ background: true, userId });
      } else {
        void this.cargarPermisos({ background: false, userId });
      }
    };
    this.unsubscribeAuthState = this.authService.onAuthStateChange(callback);
  }

  private agruparPorEvento(permisos: PermisoEscaneo[]): GrupoEvento[] {
    const map = new Map<number, GrupoEvento>();
    for (const p of permisos.filter((x) => x.scope === 'evento' && x.evento_id)) {
      const eventoId = p.evento_id!;
      let g = map.get(eventoId);
      if (!g) {
        g = { evento_id: eventoId, titulo: p.titulo_contexto, tipos: [] };
        map.set(eventoId, g);
      }
      if (!g.tipos.some((t) => t.tipo_boleta_id === p.tipo_boleta_id)) {
        const tipoEsProducto = p.tipo_boleta_id == null || p.categoria === 'producto';
        const nombreRaw = String(p.nombre_tipo || '').trim();
        const nombreSeguro = tipoEsProducto
          ? 'Productos del evento'
          : !nombreRaw || nombreRaw.toLowerCase().includes('null')
            ? 'Tipo de boleta'
            : nombreRaw;

        g.tipos.push({
          tipo_boleta_id: tipoEsProducto ? null : p.tipo_boleta_id,
          nombre: nombreSeguro,
        });
      }
    }
    return [...map.values()];
  }

  private agruparPorLugar(permisos: PermisoEscaneo[]): GrupoLugar[] {
    const map = new Map<number, GrupoLugar>();
    for (const p of permisos.filter((x) => x.scope === 'cover' && x.lugar_id && x.tipo_cover_id)) {
      const lugarId = p.lugar_id!;
      let g = map.get(lugarId);
      if (!g) {
        g = { lugar_id: lugarId, titulo: p.titulo_contexto, tipos: [] };
        map.set(lugarId, g);
      }
      if (!g.tipos.some((t) => t.tipo_cover_id === p.tipo_cover_id)) {
        g.tipos.push({
          tipo_cover_id: p.tipo_cover_id!,
          nombre: p.nombre_tipo || 'Cover',
        });
      }
    }
    return [...map.values()];
  }
}
