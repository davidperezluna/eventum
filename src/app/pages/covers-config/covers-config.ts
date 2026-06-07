import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { LugaresService } from '../../services/lugares.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { coversEventumEnabled } from '../../core/covers-feature';
import { Lugar } from '../../types';

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

  constructor(
    private lugaresService: LugaresService,
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
    void this.loadLugares();
  }

  async loadLugares(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      const res = await this.lugaresService.getLugares({
        limit: 500,
        search: this.searchTerm || undefined,
        activo: true,
      });
      this.lugares = res.data ?? [];
    } catch {
      this.lugares = [];
      await this.alertService.error('No se pudieron cargar los lugares.');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  coversHabilitado(lugar: Lugar): boolean {
    return !!(lugar as Lugar & { covers_habilitado?: boolean }).covers_habilitado;
  }

  irConfigurar(lugarId: number): void {
    void this.router.navigate(['/covers-config', lugarId]);
  }
}
