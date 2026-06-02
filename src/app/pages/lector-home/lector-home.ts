import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  LectorPermisosService,
  PermisoEscaneo,
} from '../../services/lector-permisos.service';
import { LectorStateService } from '../../services/lector-state.service';

type GrupoEvento = {
  evento_id: number;
  titulo: string;
  tipos: { tipo_boleta_id: number | null; nombre: string }[];
};

@Component({
  selector: 'app-lector-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './lector-home.html',
  styleUrl: './lector-home.css',
})
export class LectorHome implements OnInit {
  permisos: PermisoEscaneo[] = [];
  grupos: GrupoEvento[] = [];
  loading = true;
  refreshing = false;

  constructor(
    private authService: AuthService,
    private lectorPermisos: LectorPermisosService,
    private lectorStateService: LectorStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const userId = this.authService.getUsuarioId();
    const cachedPermisos = userId ? this.lectorStateService.getPermisos(userId) : null;

    if (cachedPermisos) {
      this.permisos = cachedPermisos;
      this.grupos = this.agruparPorEvento(this.permisos);
      this.loading = false;
      this.cdr.markForCheck();
      void this.cargarPermisos({ background: true, userId });
      return;
    }

    void this.cargarPermisos({ background: false, userId });
  }

  get usuario() {
    return this.authService.getUsuario();
  }

  private async cargarPermisos(options?: { background?: boolean; userId: number | null }): Promise<void> {
    const background = options?.background ?? false;
    this.loading = !background;
    this.refreshing = background;
    try {
      this.permisos = await this.lectorPermisos.fetchMisPermisosEscaneo();
      this.grupos = this.agruparPorEvento(this.permisos);
      if (options?.userId) {
        this.lectorStateService.savePermisos(options.userId, this.permisos);
      }
    } catch {
      if (!background) {
        this.permisos = [];
        this.grupos = [];
      }
    } finally {
      this.loading = false;
      this.refreshing = false;
      this.cdr.markForCheck();
    }
  }

  private agruparPorEvento(permisos: PermisoEscaneo[]): GrupoEvento[] {
    const map = new Map<number, GrupoEvento>();
    for (const p of permisos) {
      let g = map.get(p.evento_id);
      if (!g) {
        g = { evento_id: p.evento_id, titulo: p.titulo_evento, tipos: [] };
        map.set(p.evento_id, g);
      }
      if (!g.tipos.some((t) => t.tipo_boleta_id === p.tipo_boleta_id)) {
        const tipoEsProducto = p.tipo_boleta_id == null || p.categoria === 'producto';
        const nombreRaw = String(p.nombre_tipo_boleta || '').trim();
        const nombreSeguro = tipoEsProducto
          ? 'Productos del evento'
          : (!nombreRaw || nombreRaw.toLowerCase().includes('null') ? 'Tipo de boleta' : nombreRaw);

        g.tipos.push({
          tipo_boleta_id: tipoEsProducto ? null : p.tipo_boleta_id,
          nombre: nombreSeguro,
        });
      }
    }
    return [...map.values()];
  }

}
