import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoDataProvider } from '../../demo/demo-data.provider';
import { AuthService } from '../../services/auth.service';
import { DateTimeUtil } from '../../utils/date-time.util';

type FiltroVenta = 'todas' | 'boletas' | 'palcos' | 'productos';
type RangoVenta = 'todas' | 'hoy' | '7d' | '30d';

interface VentaOrganizadorItem {
  key: string;
  fecha: string;
  evento: string;
  transaccion: string;
  total: number;
  boletas: number;
  palcos: number;
  palcosNumeros: Array<string | number>;
  tipoVenta: string;
}

@Component({
  selector: 'app-ventas-organizador',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  ventas: VentaOrganizadorItem[] = [];
  filtro: FiltroVenta = 'todas';
  rango: RangoVenta = 'todas';
  busqueda = '';
  pagina = 1;
  readonly ventasPorPagina = 10;

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
      const stats = await this.demoDataProvider.getOrganizerDashboardStats(organizadorId);
      this.ventas = (stats.ventas_recientes ?? []).map((venta: any, index: number) => ({
        key: String(venta?.numero_transaccion || venta?.id || index),
        fecha: String(venta?.fecha_compra || ''),
        evento: String(venta?.evento?.titulo || 'Evento sin nombre'),
        transaccion: String(venta?.numero_transaccion || 'Sin referencia'),
        total: Number(venta?.total || 0),
        boletas: Number(venta?.boletas_vendidas || 0),
        palcos: Number(venta?.palcos_vendidos || 0),
        palcosNumeros: Array.isArray(venta?.palcos_numeros) ? venta.palcos_numeros : [],
        tipoVenta: String(venta?.tipo_venta || venta?.source || 'ventas'),
      }));
    } catch (error) {
      console.error('Error cargando ventas del organizador:', error);
      this.error = 'No pudimos cargar tus ventas. Intenta actualizar la página.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  get ventasVisibles(): VentaOrganizadorItem[] {
    const query = this.busqueda.trim().toLocaleLowerCase('es');
    return this.ventas.filter((venta) => {
      if (!this.coincideFiltro(venta, this.filtro) || !this.coincideRango(venta)) return false;
      if (!query) return true;
      return `${venta.evento} ${venta.transaccion} ${venta.palcosNumeros.join(' ')}`
        .toLocaleLowerCase('es')
        .includes(query);
    });
  }

  get totalVisible(): number {
    return this.ventasVisibles.reduce((total, venta) => total + venta.total, 0);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.ventasVisibles.length / this.ventasPorPagina));
  }

  get ventasPaginadas(): VentaOrganizadorItem[] {
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

  private coincideFiltro(venta: VentaOrganizadorItem, filtro: FiltroVenta): boolean {
    if (filtro === 'todas') return true;
    if (filtro === 'productos') return venta.tipoVenta === 'productos' || venta.tipoVenta === 'mixta';
    if (filtro === 'palcos') return venta.palcos > 0 || venta.palcosNumeros.length > 0;
    return venta.boletas > 0 && venta.palcos === 0 && venta.palcosNumeros.length === 0;
  }

  private coincideRango(venta: VentaOrganizadorItem): boolean {
    if (this.rango === 'todas') return true;
    const fecha = DateTimeUtil.parseStoredDate(venta.fecha);
    if (Number.isNaN(fecha.getTime())) return false;
    const hoy = DateTimeUtil.toCalendarDateKey(new Date().toISOString());
    if (this.rango === 'hoy') return DateTimeUtil.toCalendarDateKey(venta.fecha) === hoy;
    const dias = this.rango === '7d' ? 7 : 30;
    return fecha.getTime() >= Date.now() - dias * 86_400_000;
  }

  tituloVenta(venta: VentaOrganizadorItem): string {
    if (venta.tipoVenta === 'mixta') return 'Compra mixta';
    if (venta.palcos > 0 || venta.palcosNumeros.length > 0) {
      if (venta.palcosNumeros.length > 0) return `Palco #${venta.palcosNumeros.join(', #')}`;
      return venta.palcos === 1 ? 'Palco vendido' : `${venta.palcos} palcos vendidos`;
    }
    if (venta.tipoVenta === 'productos') return 'Venta de productos';
    return venta.boletas === 1 ? '1 boleta vendida' : `${venta.boletas} boletas vendidas`;
  }

  detalleVenta(venta: VentaOrganizadorItem): string {
    if (venta.tipoVenta === 'mixta') {
      const partes: string[] = [];
      if (venta.boletas > 0) partes.push(`${venta.boletas} boleta${venta.boletas === 1 ? '' : 's'}`);
      partes.push('productos');
      return partes.join(' + ');
    }
    if (venta.tipoVenta === 'productos') return 'Pedido de productos confirmado';
    return '';
  }

  iconoVenta(venta: VentaOrganizadorItem): string {
    if (venta.tipoVenta === 'mixta') return 'shopping_bag';
    if (venta.palcos > 0 || venta.palcosNumeros.length > 0) return 'table_restaurant';
    if (venta.tipoVenta === 'productos') return 'local_mall';
    return 'confirmation_number';
  }

  claseVenta(venta: VentaOrganizadorItem): string {
    if (venta.tipoVenta === 'mixta') return 'mixta';
    if (venta.palcos > 0 || venta.palcosNumeros.length > 0) return 'palco';
    if (venta.tipoVenta === 'productos') return 'producto';
    return 'boleta';
  }

  fechaRelativa(fecha: string): string {
    const date = DateTimeUtil.parseStoredDate(fecha);
    if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
    const diff = Math.max(0, Date.now() - date.getTime());
    const minutos = Math.floor(diff / 60_000);
    if (minutos < 1) return 'Hace un momento';
    if (minutos < 60) return `Hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas} h`;
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      timeZone: DateTimeUtil.APP_TIMEZONE,
    }).format(date);
  }

  fechaCompleta(fecha: string): string {
    const date = DateTimeUtil.parseStoredDate(fecha);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: DateTimeUtil.APP_TIMEZONE,
    }).format(date);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  }

  trackVenta(_: number, venta: VentaOrganizadorItem): string {
    return venta.key;
  }
}
