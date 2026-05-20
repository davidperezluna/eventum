import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  LectorPermisosService,
  PermisoEscaneo,
} from '../../services/lector-permisos.service';

type GrupoEvento = {
  evento_id: number;
  titulo: string;
  tipos: { tipo_boleta_id: number; nombre: string }[];
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

  constructor(
    private authService: AuthService,
    private lectorPermisos: LectorPermisosService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.cargarPermisos();
  }

  get usuario() {
    return this.authService.getUsuario();
  }

  private async cargarPermisos(): Promise<void> {
    this.loading = true;
    try {
      this.permisos = await this.lectorPermisos.fetchMisPermisosEscaneo();
      this.grupos = this.agruparPorEvento(this.permisos);
    } catch {
      this.permisos = [];
      this.grupos = [];
    } finally {
      this.loading = false;
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
        g.tipos.push({
          tipo_boleta_id: p.tipo_boleta_id,
          nombre: p.nombre_tipo_boleta,
        });
      }
    }
    return [...map.values()];
  }

}
