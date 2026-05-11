import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';

import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { BoletasService } from '../../services/boletas.service';
import { PalcosService } from '../../services/palcos.service';
import { Router } from '@angular/router';

import { EstadoPalco, Palco, PaginatedResponse, TipoBoleta } from '../../types';

@Component({
  selector: 'app-palcos',
  imports: [CommonModule, FormsModule],
  templateUrl: './palcos.html',
  styleUrl: './palcos.css',
})
export class Palcos implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tiposPalco: TipoBoleta[] = [];
  palcos: Palco[] = [];
  tiposMap = new Map<number, TipoBoleta>();

  loading = false;
  error = '';

  total = 0;
  page = 1;
  limit = 10;

  searchTerm = '';
  tipoFiltro: number | null = null;
  estadoFiltro: EstadoPalco | null = null;

  // Para usar el enum en el template
  EstadoPalco = EstadoPalco;

  /** Evita doble clic mientras Supabase actualiza */
  palcoOperandoId: number | null = null;

  constructor(
    private boletasService: BoletasService,
    private palcosService: PalcosService,
    private alertService: AlertService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Este panel está pensado para administración
    if (!this.authService.isAdministrador()) {
      this.alertService.warning('Acceso denegado', 'Solo administradores pueden gestionar palcos.');
      this.router.navigate(['/dashboard']);
      return;
    }

    this.loadTiposPalco();
  }

  private loadTiposPalco() {
    // Sin filtrar por activo: los palcos pueden seguir ligados a tipos inactivos y deben mostrarse igual.
    this.boletasService
      .getAllTiposBoleta()
      .then((tipos) => {
        const lista = tipos || [];
        this.tiposMap = new Map(lista.map((t) => [t.id, t]));
        // Filtro del desplegable: solo líneas de tipo palco; incluye activas e inactivas.
        this.tiposPalco = lista.filter((t) => !!t.es_palco);
        this.tipoFiltro = null;
      })
      .finally(() => {
        this.loadPalcos();
        this.cdr.detectChanges();
      });
  }

  async loadPalcos() {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    try {
      const response: PaginatedResponse<Palco> = await this.palcosService.getPalcos({
        page: this.page,
        limit: this.limit,
        tipo_boleta_id: this.tipoFiltro ?? undefined,
        estado: this.estadoFiltro ?? undefined,
        search: this.searchTerm || undefined
      });

      this.palcos = response.data || [];
      this.total = response.total || 0;
    } catch (err: any) {
      console.error('Error cargando palcos:', err);
      this.error = err?.message || 'Error al cargar palcos';
      this.palcos = [];
      this.total = 0;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onFiltersChange() {
    this.page = 1;
    this.loadPalcos();
  }

  getTipoNombre(palco: Palco): string {
    const join = this.unwrapTipoBoleta(palco.tipos_boleta);
    if (join?.nombre) {
      return join.nombre;
    }
    return this.tiposMap.get(palco.tipo_boleta_id)?.nombre || `Tipo #${palco.tipo_boleta_id}`;
  }

  private unwrapTipoBoleta(
    raw: Palco['tipos_boleta']
  ): { nombre?: string; activo?: boolean; es_palco?: boolean } | null {
    if (!raw) return null;
    return Array.isArray(raw) ? raw[0] ?? null : raw;
  }

  esPalcoDisponible(palco: Palco): boolean {
    const e = String(palco.estado || '').toLowerCase();
    return e === EstadoPalco.DISPONIBLE;
  }

  /** Reserva hecha desde el panel (sin compra en curso). */
  esBloqueoAdministrativo(palco: Palco): boolean {
    const e = String(palco.estado || '').toLowerCase();
    return e === EstadoPalco.RESERVADO && (palco.compra_id == null || palco.compra_id === undefined);
  }

  async reservarPalco(palco: Palco): Promise<void> {
    if (!this.esPalcoDisponible(palco)) {
      return;
    }
    const ok = await this.alertService.confirm(
      'Reservar palco',
      `¿Reservar el palco #${palco.numero} (${this.getTipoNombre(palco)})? Dejará de poder elegirse en la compra pública.`
    );
    if (!ok) return;

    this.palcoOperandoId = palco.id;
    this.cdr.detectChanges();
    try {
      await this.palcosService.reservarPalcoAdministrativo(palco.id);
      this.alertService.success('Palco reservado', 'Los clientes ya no podrán seleccionarlo para comprar.');
      await this.loadPalcos();
    } catch (err: any) {
      console.error('reservarPalco:', err);
      this.alertService.error('No se pudo reservar', err?.message || 'Error desconocido');
    } finally {
      this.palcoOperandoId = null;
      this.cdr.detectChanges();
    }
  }

  async liberarBloqueoAdministrativo(palco: Palco): Promise<void> {
    if (!this.esBloqueoAdministrativo(palco)) {
      return;
    }
    const ok = await this.alertService.confirm(
      'Liberar palco',
      `¿Volver a dejar disponible el palco #${palco.numero}? Solo aplica a reservas hechas desde el panel (sin compra).`
    );
    if (!ok) return;

    this.palcoOperandoId = palco.id;
    this.cdr.detectChanges();
    try {
      await this.palcosService.liberarBloqueoAdministrativo(palco.id);
      this.alertService.success('Palco disponible', 'Los clientes podrán volver a seleccionarlo.');
      await this.loadPalcos();
    } catch (err: any) {
      console.error('liberarBloqueoAdministrativo:', err);
      this.alertService.error('No se pudo liberar', err?.message || 'Error desconocido');
    } finally {
      this.palcoOperandoId = null;
      this.cdr.detectChanges();
    }
  }

  getEstadoLabel(estado?: string): string {
    switch (estado) {
      case EstadoPalco.DISPONIBLE:
        return 'Disponible';
      case EstadoPalco.RESERVADO:
        return 'Reservado';
      case EstadoPalco.VENDIDO:
        return 'Vendido';
      default:
        return estado || '—';
    }
  }

  getEstadoBadgeClass(estado?: string): string {
    switch (estado) {
      case EstadoPalco.DISPONIBLE:
        return 'badge-success';
      case EstadoPalco.RESERVADO:
        return 'badge-warning';
      case EstadoPalco.VENDIDO:
        return 'badge-danger';
      default:
        return 'badge-warning';
    }
  }

  getTotalPages(): number {
    if (!this.total) return 1;
    return Math.ceil(this.total / this.limit);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const pages: number[] = [];
    const maxPages = 5;

    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    let start = Math.max(1, this.page - 2);
    let end = Math.min(totalPages, start + maxPages - 1);
    if (end - start < maxPages - 1) start = Math.max(1, end - maxPages + 1);

    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  goToPage(pageNum: number) {
    const totalPages = this.getTotalPages();
    if (pageNum < 1 || pageNum > totalPages) return;
    if (pageNum === this.page) return;

    this.page = pageNum;
    this.loadPalcos();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  Math = Math;
}

