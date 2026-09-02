import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  mapVentaToOrgSalesRow,
  OrgSalesRow,
  OrgSalesRowModel,
  orgSalesFormatCurrency,
} from '../../components/org-sales-row';
import { DemoDataProvider } from '../../demo/demo-data.provider';
import { AuthService } from '../../services/auth.service';
import { DateTimeUtil } from '../../utils/date-time.util';

type FiltroVenta = 'todas' | 'boletas' | 'palcos' | 'productos';
type RangoVenta = 'todas' | 'hoy' | '7d' | '30d';

@Component({
  selector: 'app-ventas-organizador',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OrgSalesRow],
  templateUrl: './ventas-organizador.html',
  styleUrls: [
    '../evento-inteligencia/evento-inteligencia.css',
    '../dashboard-organizador/dashboard-organizador.css',
    './ventas-organizador.css',
  ],
})
export class VentasOrganizador implements OnInit {
  loading = true;
  refreshing = false;
  error: string | null = null;
  ventas: OrgSalesRowModel[] = [];
  filtro: FiltroVenta = 'todas';
  rango: RangoVenta = 'todas';
  busqueda = '';
  pagina = 1;
  readonly ventasPorPagina = 10;
  private ventasFiltradasCache: {
    ventas: OrgSalesRowModel[];
    filtro: FiltroVenta;
    rango: RangoVenta;
    busqueda: string;
    resultado: OrgSalesRowModel[];
  } | null = null;

  readonly filtros: Array<{ id: FiltroVenta; label: string; icon: string }> = [
    { id: 'todas', label: 'Todas', icon: 'receipt_long' },
    { id: 'boletas', label: 'Boletas', icon: 'confirmation_number' },
    { id: 'palcos', label: 'Palcos', icon: 'table_restaurant' },
    { id: 'productos', label: 'Productos', icon: 'local_mall' },
  ];

  constructor(
    private authService: AuthService,
    private demoDataProvider: DemoDataProvider,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    let unsubscribe: (() => void) | undefined;
    unsubscribe = this.authService.onAuthStateChange((_user, usuario) => {
      if (usuario?.tipo_usuario_id === 2) {
        void this.cargar(Number(usuario.id)).finally(() => unsubscribe?.());
      } else if (usuario !== null) {
        this.error = 'Esta página está disponible únicamente para organizadores.';
        this.loading = false;
        unsubscribe?.();
        this.cdr.detectChanges();
      }
    });
  }

  async actualizar(): Promise<void> {
    const id = this.authService.getUsuarioId();
    if (!id || this.refreshing) return;
    this.refreshing = true;
    this.cdr.detectChanges();
    await this.cargar(id, true);
    this.refreshing = false;
    this.cdr.detectChanges();
  }

  private async cargar(organizadorId: number, background = false): Promise<void> {
    if (!background) this.loading = true;
    this.error = null;
    try {
      const ventas = await this.demoDataProvider.getOrganizerSales(organizadorId);
      this.ventas = ventas.map((venta: any, index: number) => mapVentaToOrgSalesRow(venta, index));
    } catch (error) {
      console.error('Error cargando ventas del organizador:', error);
      this.error = 'No pudimos cargar tus ventas. Intenta actualizar la página.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  get ventasVisibles(): OrgSalesRowModel[] {
    const query = this.busqueda.trim().toLocaleLowerCase('es');
    const cached = this.ventasFiltradasCache;
    if (
      cached?.ventas === this.ventas &&
      cached.filtro === this.filtro &&
      cached.rango === this.rango &&
      cached.busqueda === query
    ) {
      return cached.resultado;
    }
    const resultado = this.ventas.filter((venta) => {
      if (!this.coincideFiltro(venta, this.filtro) || !this.coincideRango(venta)) return false;
      if (!query) return true;
      return `${venta.compradorEmail} ${venta.compradorNombre} ${venta.evento} ${venta.tiposEntrada} ${venta.palcosNumeros.join(' ')}`
        .toLocaleLowerCase('es')
        .includes(query);
    });
    this.ventasFiltradasCache = {
      ventas: this.ventas,
      filtro: this.filtro,
      rango: this.rango,
      busqueda: query,
      resultado,
    };
    return resultado;
  }

  get totalVisible(): number {
    return this.ventasVisibles.reduce((total, venta) => total + venta.total, 0);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.ventasVisibles.length / this.ventasPorPagina));
  }

  get ventasPaginadas(): OrgSalesRowModel[] {
    const paginaValida = Math.min(this.pagina, this.totalPaginas);
    const inicio = (paginaValida - 1) * this.ventasPorPagina;
    return this.ventasVisibles.slice(inicio, inicio + this.ventasPorPagina);
  }

  get rangoPagina(): string {
    const total = this.ventasVisibles.length;
    if (total === 0) return '0 ventas';
    const inicio = (this.pagina - 1) * this.ventasPorPagina + 1;
    const fin = Math.min(this.pagina * this.ventasPorPagina, total);
    return `${inicio}–${fin} de ${total}`;
  }

  cantidadFiltro(filtro: FiltroVenta): number {
    return this.ventas.filter((venta) => this.coincideFiltro(venta, filtro)).length;
  }

  seleccionarFiltro(filtro: FiltroVenta): void {
    this.filtro = filtro;
    this.reiniciarPaginacion();
  }

  reiniciarPaginacion(): void {
    this.pagina = 1;
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.pagina -= 1;
  }

  paginaSiguiente(): void {
    if (this.pagina < this.totalPaginas) this.pagina += 1;
  }

  private coincideFiltro(venta: OrgSalesRowModel, filtro: FiltroVenta): boolean {
    if (filtro === 'todas') return true;
    if (filtro === 'productos') return venta.tipoVenta === 'productos' || venta.tipoVenta === 'mixta';
    if (filtro === 'palcos') return venta.palcos > 0 || venta.palcosNumeros.length > 0;
    return venta.boletas > 0 && venta.palcos === 0 && venta.palcosNumeros.length === 0;
  }

  private coincideRango(venta: OrgSalesRowModel): boolean {
    if (this.rango === 'todas') return true;
    const fecha = DateTimeUtil.parseStoredDate(venta.fecha);
    if (Number.isNaN(fecha.getTime())) return false;
    const hoy = DateTimeUtil.toCalendarDateKey(new Date().toISOString());
    if (this.rango === 'hoy') return DateTimeUtil.toCalendarDateKey(venta.fecha) === hoy;
    const dias = this.rango === '7d' ? 7 : 30;
    return fecha.getTime() >= Date.now() - dias * 86_400_000;
  }

  formatCurrency(value: number): string {
    return orgSalesFormatCurrency(value);
  }

  trackVenta(_: number, venta: OrgSalesRowModel): string {
    return venta.key;
  }
}
