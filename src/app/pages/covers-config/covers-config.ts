import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { LugaresService } from '../../services/lugares.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { coversEventumEnabled } from '../../core/covers-feature';
import { Lugar, Usuario } from '../../types';

type EstadoCoverLugar = 'publicado' | 'pausado' | 'sin_responsable';

@Component({
  selector: 'app-covers-config',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './covers-config.html',
  styleUrl: './covers-config.css',
})
export class CoversConfig implements OnInit {
  lugares: Lugar[] = [];
  loading = false;
  searchTerm = '';
  esAdministrador = false;
  private organizadoresById = new Map<number, Usuario>();
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private lugaresService: LugaresService,
    private usuariosService: UsuariosService,
    private authService: AuthService,
    private alertService: AlertService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!coversEventumEnabled) {
      void this.router.navigate(['/dashboard']);
      return;
    }
    if (!this.authService.isAdministrador() && !this.authService.isOrganizador()) {
      void this.alertService.warning('Acceso denegado', 'Solo admin u organizador.');
      void this.router.navigate(['/dashboard']);
      return;
    }
    this.esAdministrador = this.authService.isAdministrador();
    void this.loadData();
  }

  get mostrarBusqueda(): boolean {
    return this.esAdministrador || this.lugares.length > 3 || !!this.searchTerm;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      const [lugaresRes, organizadores] = await Promise.all([
        this.lugaresService.getLugares({
          limit: 500,
          search: this.searchTerm || undefined,
          activo: true,
        }),
        this.esAdministrador
          ? this.usuariosService.getOrganizadores().catch(() => [] as Usuario[])
          : Promise.resolve([] as Usuario[]),
      ]);

      this.organizadoresById = new Map(organizadores.map((o) => [o.id, o]));
      let lugares = lugaresRes.data ?? [];

      if (!this.esAdministrador) {
        const uid = this.authService.getUsuarioId();
        lugares = lugares.filter((l) => l.covers_organizador_id === uid);
      }

      this.lugares = lugares;
    } catch {
      this.lugares = [];
      await this.alertService.error('No se pudieron cargar los lugares.');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.loadData(), 280);
  }

  estadoDe(lugar: Lugar): EstadoCoverLugar {
    if (!lugar.covers_organizador_id) return 'sin_responsable';
    if (lugar.covers_habilitado) return 'publicado';
    return 'pausado';
  }

  labelEstado(lugar: Lugar): string {
    switch (this.estadoDe(lugar)) {
      case 'publicado':
        return 'Publicado';
      case 'pausado':
        return 'Pausado';
      default:
        return 'Sin responsable';
    }
  }

  labelResponsable(lugar: Lugar): string {
    if (!lugar.covers_organizador_id) return 'Sin responsable';
    const org = this.organizadoresById.get(lugar.covers_organizador_id);
    if (!org) return '';
    const nombre = [org.nombre, org.apellido].filter(Boolean).join(' ').trim();
    return nombre || org.email;
  }

  irConfigurar(lugarId: number): void {
    void this.router.navigate(['/covers-config', lugarId]);
  }
}
