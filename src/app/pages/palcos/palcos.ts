import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';

import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { BoletasService } from '../../services/boletas.service';
import { PalcosService, VentaPalcoIndividualListado } from '../../services/palcos.service';
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

  /** Ventas de palco 1 pers. (sin `palco_id`); paginación propia. */
  ventasIndividual: VentaPalcoIndividualListado[] = [];
  totalVentasIndividual = 0;
  pageVentasInd = 1;
  ventasIndividualError = '';

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
    this.ventasIndividualError = '';
    this.cdr.detectChanges();

    try {
      await Promise.all([this.loadInventarioNumerado(), this.loadVentasIndividualInterno()]);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadInventarioNumerado(): Promise<void> {
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
    }
  }

  private async loadVentasIndividualInterno(): Promise<void> {
    try {
      if (this.estadoFiltro === EstadoPalco.DISPONIBLE) {
        this.ventasIndividual = [];
        this.totalVentasIndividual = 0;
        return;
      }
      const estadoPago = this.mapEstadoPagoVentasIndividual();
      const v = await this.palcosService.getVentasPalcoIndividual({
        page: this.pageVentasInd,
        limit: this.limit,
        tipo_boleta_id: this.tipoFiltro ?? undefined,
        estado_pago: estadoPago
      });
      this.ventasIndividual = v.data || [];
      this.totalVentasIndividual = v.total || 0;
    } catch (err: any) {
      console.error('Error cargando ventas palco individual:', err);
      this.ventasIndividual = [];
      this.totalVentasIndividual = 0;
      this.ventasIndividualError = err?.message || 'Error al cargar ventas de palco (1 pers.)';
    }
  }

  /** Solo repagina inventario numerado. */
  async goToPage(pageNum: number) {
    const totalPages = this.getTotalPages();
    if (pageNum < 1 || pageNum > totalPages) return;
    if (pageNum === this.page) return;
    this.page = pageNum;
    this.loading = true;
    this.cdr.detectChanges();
    try {
      await this.loadInventarioNumerado();
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /** Solo repagina ventas de palco 1 pers. */
  async goToPageVentasInd(pageNum: number) {
    const totalPages = this.getTotalPagesVentasInd();
    if (pageNum < 1 || pageNum > totalPages) return;
    if (pageNum === this.pageVentasInd) return;
    this.pageVentasInd = pageNum;
    this.loading = true;
    this.cdr.detectChanges();
    try {
      await this.loadVentasIndividualInterno();
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /** Filtro de estado de cupo físico → estado de pago de la compra (solo tabla de ventas individuales). */
  private mapEstadoPagoVentasIndividual(): string | undefined {
    if (this.estadoFiltro === EstadoPalco.RESERVADO) {
      return 'pendiente';
    }
    if (this.estadoFiltro === EstadoPalco.VENDIDO) {
      return 'completado';
    }
    return undefined;
  }

  get ocultarVentasIndividuales(): boolean {
    return this.estadoFiltro === EstadoPalco.DISPONIBLE;
  }

  onFiltersChange() {
    this.page = 1;
    this.pageVentasInd = 1;
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

  getTipoNombreVenta(row: VentaPalcoIndividualListado): string {
    const tb = row.tipos_boleta;
    const join = Array.isArray(tb) ? tb[0] : tb;
    if (join?.nombre) return join.nombre;
    return this.tiposMap.get(row.tipo_boleta_id)?.nombre || `Tipo #${row.tipo_boleta_id}`;
  }

  getEstadoPagoVenta(row: VentaPalcoIndividualListado): string {
    const c = row.compras;
    const compra = Array.isArray(c) ? c[0] : c;
    return compra?.estado_pago || '—';
  }

  badgeEstadoPagoVenta(row: VentaPalcoIndividualListado): string {
    const p = String(this.getEstadoPagoVenta(row)).toLowerCase();
    if (p === 'completado') return 'badge-success';
    if (p === 'fallido' || p === 'cancelado' || p === 'reembolsado') return 'badge-danger';
    return 'badge-warning';
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

  getTotalPagesVentasInd(): number {
    if (!this.totalVentasIndividual) return 1;
    return Math.ceil(this.totalVentasIndividual / this.limit);
  }

  getPageNumbersVentasInd(): number[] {
    const totalPages = this.getTotalPagesVentasInd();
    const pages: number[] = [];
    const maxPages = 5;
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    let start = Math.max(1, this.pageVentasInd - 2);
    let end = Math.min(totalPages, start + maxPages - 1);
    if (end - start < maxPages - 1) start = Math.max(1, end - maxPages + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  Math = Math;
}

