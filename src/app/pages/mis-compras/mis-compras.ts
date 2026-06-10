import { Component, OnInit, OnDestroy, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, from } from 'rxjs';
import { takeUntil, debounceTime, switchMap, filter } from 'rxjs/operators';
import { ComprasService } from '../../services/compras.service';
import { BoletasService } from '../../services/boletas.service';
import { TrasladosBoletaService } from '../../services/traslados-boleta.service';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import {
  MisComprasState,
  MisComprasStateService,
  PromoProductosMisCompras,
} from '../../services/mis-compras-state.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  Compra,
  BoletaComprada,
  PaginatedResponse,
  TipoBoleta,
  Evento,
  TipoEstadoPago,
  TipoEstadoCompra,
  TrasladoBoleta,
  EstadoTrasladoBoleta,
  CompraProducto,
  CompraProductoItem,
  TipoEstadoItemProducto
} from '../../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { AccesoPuertaToastComponent } from '../../components/acceso-puerta-toast/acceso-puerta-toast';
import type { AuthStateCallback } from '../../services/auth.service';
import { ProductosService } from '../../services/productos.service';
import { CoversService } from '../../services/covers.service';
import { AccesosPuertaService } from '../../services/accesos-puerta.service';
import { coversEventumEnabled } from '../../core/covers-feature';
import { formatHoraCover, labelSesionCover } from '../../core/covers-labels';
import { hintQrCoverAcceso as hintQrCoverAccesoText } from '../../core/cover-acceso-puerta';
import {
  documentoAsistenteBoletaEscaneo,
  nombreAsistenteBoletaEscaneo,
  nombreDisplayUsuario,
} from '../../core/lector-scan-display';
import { BoletaCoverCliente, CompraCoverCliente } from '../../types/covers';
import {
  RESUMEN_CANCELAR_TRASLADO_COVER_PUNTOS,
  RESUMEN_CANCELAR_TRASLADO_COVER_SUBTITULO,
  RESUMEN_CANCELAR_TRASLADO_COVER_TITULO,
  RESUMEN_CANCELAR_TRASLADO_ENTRADA_PUNTOS,
  RESUMEN_CANCELAR_TRASLADO_ENTRADA_SUBTITULO,
  RESUMEN_CANCELAR_TRASLADO_ENTRADA_TITULO,
  RESUMEN_TRASLADO_COVER_PUNTOS,
  RESUMEN_TRASLADO_COVER_SUBTITULO,
  RESUMEN_TRASLADO_COVER_TITULO,
  RESUMEN_TRASLADO_ENTRADA_PUNTOS,
  RESUMEN_TRASLADO_ENTRADA_SUBTITULO,
  RESUMEN_TRASLADO_ENTRADA_TITULO,
  RESUMEN_YO_ASISTO_PUNTOS,
  RESUMEN_YO_ASISTO_SUBTITULO,
  RESUMEN_YO_ASISTO_TITULO,
} from '../../constants/traslados.constants';

interface BoletaConCompra {
  compra: Compra;
  boleta: BoletaComprada;
  esCedida?: boolean;
}

interface TipoBoletasGrupo {
  key: string;
  nombre: string;
  boletas: BoletaConCompra[];
  totalBoletas: number;
  totalDisponibles: number;
  totalTrasladoSaliente: number;
  totalUsadas: number;
  totalSinUsar: number;
  totalSinAsignar: number;
}

interface ProductoConCompra {
  compra: CompraProducto;
  item: CompraProductoItem;
}

interface CompraProductosDetalle {
  compra: CompraProducto;
  items: CompraProductoItem[];
}

interface EventoBoletasGrupo {
  key: string;
  titulo: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  lugar?: any;
  tipos: TipoBoletasGrupo[];
  compras: Compra[];
  comprasProductos: CompraProducto[];
  totalCedidas: number;
  totalBoletas: number;
  totalDisponibles: number;
  totalTrasladoSaliente: number;
  totalUsadas: number;
  totalSinUsar: number;
  totalSinAsignar: number;
  totalItemsProducto: number;
  totalProductosComprados: number;
  totalProductosRedimidos: number;
}

interface BoletaCoverConCompra {
  compra: CompraCoverCliente;
  boleta: BoletaCoverCliente;
  esCedida?: boolean;
}

interface LugarCoverGrupo {
  key: string;
  lugarId: number;
  lugarNombre: string;
  compras: CompraCoverCliente[];
  boletas: BoletaCoverConCompra[];
  totalBoletas: number;
  totalDisponibles: number;
  totalEnCurso: number;
  totalTrasladoSaliente: number;
  totalUsadas: number;
}

@Component({
  selector: 'app-mis-compras',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe, AccesoPuertaToastComponent],
  templateUrl: './mis-compras.html',
  styleUrl: './mis-compras.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class MisCompras implements OnInit, OnDestroy {
  readonly coversEventumEnabled = coversEventumEnabled;
  promoProductos: PromoProductosMisCompras | null = null;
  loadingPromoProductos = false;
  private promoProductosRefreshSeq = 0;
  guiaEntradasAbierta = false;
  private destroy$ = new Subject<void>();
  private loadComprasSubject = new Subject<void>();
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private refreshStartedAt: number | null = null;
  private currentLoadBackground = false;
  private notificacionesChannel: RealtimeChannel | null = null;
  private unsubscribeAuthState: (() => void) | null = null;
  private realtimeUsuarioIdActual: number | null = null;
  
  compras: Compra[] = [];
  comprasProductos: CompraProducto[] = [];
  loadingComprasProductos = false;
  comprasCover: CompraCoverCliente[] = [];
  boletasCover: BoletaCoverConCompra[] = [];
  lugaresConCovers: LugarCoverGrupo[] = [];
  lugarCoverExpandidoKey: string | null = null;
  lugarCoverDetalleKey: string | null = null;
  tabMisComprasPrincipal: 'eventos' | 'covers' = 'eventos';
  loadingCovers = false;
  coverCedidas: BoletaCoverConCompra[] = [];
  comprasConBoletas: { compra: Compra; boletas: BoletaComprada[] }[] = [];
  eventosConBoletas: EventoBoletasGrupo[] = [];
  eventoExpandidoKey: string | null = null;
  eventoDetalleKey: string | null = null;
  tabBoletasDetalle: 'sin-usar' | 'usadas' | 'sin-asignar' = 'sin-usar';
  tabCoversDetalle: 'sin-usar' | 'en-curso' | 'usadas' = 'sin-usar';
  tabEventoDetalle: 'entradas' | 'productos' = 'entradas';
  tabProductosDetalle: 'compradas' | 'redimidas' = 'compradas';
  loading = false;
  isRefreshing = false;
  loadingBoletasDetalle = true;
  total = 0;
  page = 1;
  limit = 1000;
  totalPages = 0;

  // Filtros
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;
  eventoFiltro: number | null = null;
  fechaDesde: string = '';
  fechaHasta: string = '';
  searchTerm: string = '';
  mostrarFiltros = false;

  /** Lista principal `/mis-compras`: filtros ocultos temporalmente. */
  mostrarToolbarFiltrosMisCompras = false;

  // Lista de eventos disponibles (solo eventos donde el usuario tiene compras)
  eventosDisponibles: Evento[] = [];
  loadingEventos = false;

  estadosPago: { value: TipoEstadoPago; label: string }[] = [
    { value: TipoEstadoPago.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoPago.COMPLETADO, label: 'Completado' },
    { value: TipoEstadoPago.FALLIDO, label: 'Fallido' },
    { value: TipoEstadoPago.REEMBOLSADO, label: 'Reembolsado' },
    { value: TipoEstadoPago.CANCELADO, label: 'Cancelado' }
  ];

  estadosCompra: { value: TipoEstadoCompra; label: string }[] = [
    { value: TipoEstadoCompra.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoCompra.CONFIRMADA, label: 'Confirmada' },
    { value: TipoEstadoCompra.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoCompra.REEMBOLSADA, label: 'Reembolsada' }
  ];

  // Modal de vista previa de boleta
  showBoletaModal = false;
  boletaSeleccionada: BoletaComprada | null = null;
  compraSeleccionada: Compra | null = null;
  eventoSeleccionado: Evento | null = null;
  tipoBoletaSeleccionado: TipoBoleta | null = null;
  qrCodeUrl: string = '';
  loadingQR = false;
  showProductoQrModal = false;
  productoFilaSeleccionada: ProductoConCompra | null = null;
  productoQrCodeUrl = '';
  loadingProductoQR = false;
  showCoverQrModal = false;
  coverBoletaSeleccionada: BoletaCoverConCompra | null = null;
  coverQrCodeUrl = '';
  loadingCoverQR = false;
  showMensajeIngresoModal = false;
  mensajeIngresoTitulo = '';
  mensajeIngresoDetalle = '';
  mensajeIngresoReferencia = '';
  mensajeIngresoEvento = '';
  mensajeIngresoAsistente = '';
  mensajeIngresoProductos: Array<{ nombre: string; cantidad: number }> = [];
  mensajeIngresoTipo: 'entrada' | 'producto' | 'cover' | 'cover-salida' = 'entrada';
  siguienteBoletaSugerida: BoletaConCompra | null = null;

  /** Traslados de palcos: historial y mapas para ocultar QR al remitente con envío pendiente. */
  trasladosHistorial: TrasladoBoleta[] = [];
  trasladosPendientesRecibir: Array<TrasladoBoleta & { boletaDetail?: BoletaComprada }> = [];
  trasladoSalientePorBoletaId = new Map<number, TrasladoBoleta>();
  trasladoSalientePorBoletaCoverId = new Map<number, TrasladoBoleta>();
  trasladosPendientesRecibirCover: Array<TrasladoBoleta & { coverDetail?: BoletaCoverCliente }> = [];
  entradasCedidas: BoletaComprada[] = [];
  loadingTraslados = false;

  showTrasladoModal = false;
  trasladoBoleta: BoletaComprada | null = null;
  trasladoCompra: Compra | null = null;
  trasladoCoverItem: BoletaCoverConCompra | null = null;
  emailTrasladoDestino = '';
  enviandoTraslado = false;

  showCancelarTrasladoModal = false;
  trasladoACancelar: TrasladoBoleta | null = null;
  cancelandoTraslado = false;

  showYoAsistoModal = false;
  yoAsistoBoleta: BoletaComprada | null = null;
  yoAsistoCompra: Compra | null = null;

  rellenarPerfilBoletaId: number | null = null;
  /** Error visible junto al panel de asignación (además del modal SweetAlert). */
  asignacionError: { boletaId: number; mensaje: string } | null = null;
  asignarPanelAbiertoBoletaId: number | null = null;

  /** Ruta `/mis-compras/actividad`: solo trazabilidad de traslados. */
  vistaActividad = false;

  constructor(
    private comprasService: ComprasService,
    private comprasProductoService: ComprasProductoService,
    private productosService: ProductosService,
    private coversService: CoversService,
    private boletasService: BoletasService,
    private trasladosBoletaService: TrasladosBoletaService,
    private eventosService: EventosService,
    private authService: AuthService,
    private alertService: AlertService,
    private misComprasStateService: MisComprasStateService,
    private accesosPuertaService: AccesosPuertaService,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private router: Router
  ) {}

  ngOnInit() {
    this.syncVistaActividadDesdeUrl(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((e) => this.syncVistaActividadDesdeUrl(e.urlAfterRedirects));

    const userId = this.authService.getUsuarioId();
    const cachedState = userId ? this.misComprasStateService.getState(userId) : null;
    if (cachedState) {
      this.applyCachedState(cachedState);
      this.loading = false;
      this.sincronizarRealtimeNotificaciones();
    }

    // Configurar debounce para búsqueda
    this.loadComprasSubject.pipe(
      debounceTime(300),
      switchMap(() => from(this.loadComprasInternal())),
      takeUntil(this.destroy$)
    ).subscribe({
      next: async (response: PaginatedResponse<Compra>) => {
        this.compras = (response.data || []).filter(
          (compra) => compra.estado_pago === TipoEstadoPago.COMPLETADO
        );
        this.total = response.total || 0;
        this.totalPages = response.totalPages || 0;
        this.loadingBoletasDetalle = true;

        await this.loadBoletasPorCompra({ background: this.currentLoadBackground });
        await this.loadComprasProductos();
        if (coversEventumEnabled) {
          await this.loadCoversPorTitular({ background: this.currentLoadBackground });
        } else {
          await this.refrescarTrasladosMaps();
        }

        this.syncTabMisComprasPrincipal();
        this.loading = false;
        this.endSilentRefreshCycle();
        this.persistState(Date.now());
        this.sincronizarRealtimeNotificaciones();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando compras:', err);
        this.compras = [];
        this.comprasProductos = [];
        this.comprasCover = [];
        this.boletasCover = [];
        this.lugaresConCovers = [];
        this.comprasConBoletas = [];
        this.eventosConBoletas = [];
        this.eventoExpandidoKey = null;
        this.total = 0;
        this.totalPages = 0;
        this.loading = false;
        this.loadingBoletasDetalle = false;
        this.loadingCovers = false;
        this.endSilentRefreshCycle();
        this.detenerRealtimeNotificaciones();
        this.cdr.detectChanges();
      }
    });

    this.loadEventosDisponibles(); // Cargar eventos disponibles
    this.loadCompras({ background: !!cachedState }); // Carga inicial
    this.suscribirReinicioRealtimePorAuth();
  }

  private syncVistaActividadDesdeUrl(url: string): void {
    const path = (url || '').split('?')[0];
    const prevEventoKey = this.eventoDetalleKey;
    const prevClubKey = this.lugarCoverDetalleKey;
    this.vistaActividad = path.endsWith('/mis-compras/actividad');
    const detalleMatch = path.match(/\/mis-compras\/evento\/([^/]+)$/);
    this.eventoDetalleKey = detalleMatch ? decodeURIComponent(detalleMatch[1]) : null;
    const clubDetalleMatch = path.match(/\/mis-compras\/club\/([^/]+)$/);
    this.lugarCoverDetalleKey = clubDetalleMatch ? decodeURIComponent(clubDetalleMatch[1]) : null;
    this.syncTabEventoDetalle();
    this.syncTabCoversDetalle();
    this.syncTabMisComprasPrincipal();

    const entroEnDetalle =
      (this.eventoDetalleKey != null && this.eventoDetalleKey !== prevEventoKey) ||
      (this.lugarCoverDetalleKey != null && this.lugarCoverDetalleKey !== prevClubKey);
    if (entroEnDetalle && this.authService.getUsuarioId()) {
      void this.refrescarTrasladosMaps().then(() => {
        this.reconstruirEventosConBoletas();
        if (coversEventumEnabled) {
          this.reconstruirLugaresConCovers();
        }
        this.cdr.detectChanges();
      });
    } else {
      this.cdr.detectChanges();
    }
  }

  private syncTabMisComprasPrincipal(): void {
    if (this.lugarCoverDetalleKey) {
      this.tabMisComprasPrincipal = 'covers';
      return;
    }
    if (this.eventoDetalleKey) {
      return;
    }
    if (
      coversEventumEnabled &&
      this.trasladosPendientesRecibirCover.length > 0 &&
      this.trasladosPendientesRecibir.length === 0 &&
      this.eventosConBoletas.length === 0
    ) {
      this.tabMisComprasPrincipal = 'covers';
      return;
    }
    if (
      this.eventosConBoletas.length === 0 &&
      (this.lugaresConCovers.length > 0 || this.trasladosPendientesRecibirCover.length > 0)
    ) {
      this.tabMisComprasPrincipal = 'covers';
    }
  }

  setTabMisComprasPrincipal(tab: 'eventos' | 'covers'): void {
    this.tabMisComprasPrincipal = tab;
    this.persistState(Date.now());
    this.cdr.detectChanges();
  }

  mostrarTabsMisComprasPrincipal(): boolean {
    if (!coversEventumEnabled || this.eventoDetalleKey || this.lugarCoverDetalleKey) {
      return false;
    }
    return (
      this.eventosConBoletas.length > 0 ||
      this.lugaresConCovers.length > 0 ||
      this.trasladosPendientesRecibir.length > 0 ||
      this.trasladosPendientesRecibirCover.length > 0 ||
      this.loadingCovers ||
      this.loading
    );
  }

  totalEntradasMisCompras(): number {
    return this.eventosConBoletas.reduce((sum, g) => sum + (g.totalBoletas || 0), 0);
  }

  totalCoversMisCompras(): number {
    return this.lugaresConCovers.reduce((sum, grupo) => sum + (grupo.totalDisponibles || 0), 0);
  }

  badgeCoversTab(): number {
    return this.totalCoversMisCompras();
  }

  badgeEventosTab(): number {
    return this.totalEntradasMisCompras();
  }

  badgeEventosTabPendientes(): number {
    return this.trasladosPendientesRecibir.length;
  }

  badgeCoversTabPendientes(): number {
    return this.trasladosPendientesRecibirCover.length;
  }

  totalTrasladosPendientesRecibir(): number {
    return this.trasladosPendientesRecibir.length + this.trasladosPendientesRecibirCover.length;
  }

  badgePendientesRecibirEnEvento(grupo: EventoBoletasGrupo): number {
    return this.trasladosPendientesRecibirEnEvento(grupo).length;
  }

  badgePendientesRecibirEnClub(grupo: LugarCoverGrupo): number {
    return this.trasladosPendientesRecibirCoverEnClub(grupo).length;
  }

  private syncTrasladosPendientesNavBadge(): void {
    this.misComprasStateService.setTrasladosPendientesCount(this.totalTrasladosPendientesRecibir());
  }

  loadCompras(options?: { background?: boolean; resetPage?: boolean }) {
    if (options?.resetPage !== false) {
      this.page = 1; // Resetear a primera página al filtrar
    }

    const hasVisibleData =
      this.compras.length > 0 ||
      this.comprasProductos.length > 0 ||
      this.eventosConBoletas.length > 0 ||
      this.lugaresConCovers.length > 0;
    const background = options?.background ?? hasVisibleData;
    this.currentLoadBackground = background;
    this.loading = !background && !hasVisibleData;
    this.loadingBoletasDetalle = true;
    if (coversEventumEnabled) {
      this.loadingCovers = !background && this.lugaresConCovers.length === 0 && this.boletasCover.length === 0;
    }
    if (background) {
      this.startSilentRefreshCycle();
    } else {
      this.endSilentRefreshCycle();
    }
    this.cdr.detectChanges();
    this.loadComprasSubject.next();
  }

  async loadCoversPorTitular(options?: { background?: boolean }) {
    const background = options?.background ?? false;
    this.loadingCovers = true;
    this.cdr.detectChanges();

    if (!background) {
      this.comprasCover = [];
      this.boletasCover = [];
      this.lugaresConCovers = [];
      this.coverCedidas = [];
    }

    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.coverCedidas = [];
      this.loadingCovers = false;
      return;
    }

    if (this.isOffline() && (this.boletasCover.length > 0 || this.lugaresConCovers.length > 0)) {
      console.info('[MisCompras] Sin conexión, usando covers cacheados');
      this.loadingCovers = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      const compras = await this.coversService.listarComprasCoverCliente();
      this.comprasCover = compras.filter(
        (compra) => (compra.estado_pago || '').toLowerCase() === TipoEstadoPago.COMPLETADO
      );

      let allBoletas: BoletaCoverCliente[] = [];
      try {
        allBoletas = await this.coversService.listarBoletasCoverCliente();
      } catch (err) {
        console.error('Error cargando boletas cover:', err);
      }

      const ownedItems: BoletaCoverConCompra[] = [];
      for (const compra of this.comprasCover) {
        const boletas = allBoletas.filter((boleta) => {
          if (boleta.compra_cover_id !== compra.id) return false;
          const titular = boleta.titular_cliente_id ?? compra.cliente_id;
          return titular === uid && (boleta.estado || '').toLowerCase() !== 'cancelada';
        });
        for (const boleta of boletas) {
          ownedItems.push({
            compra,
            boleta: {
              ...boleta,
              lugar_nombre: boleta.lugar_nombre || compra.lugar_nombre,
            },
            esCedida: false,
          });
        }
      }

      try {
        const cedidas = await this.coversService.getCoversCedidosTitular(uid, allBoletas);
        this.coverCedidas = cedidas
          .filter((boleta) => (boleta.estado || '').toLowerCase() !== 'cancelada')
          .map((boleta) => ({
            compra: this.compraVistaParaCoverCedido(boleta),
            boleta,
            esCedida: true,
          }));
      } catch (err) {
        console.error('Error cargando covers cedidos:', err);
        this.coverCedidas = [];
      }

      this.boletasCover = [...ownedItems, ...this.coverCedidas];
      await this.refrescarTrasladosMaps();
      this.reconstruirLugaresConCovers();
      this.syncTabCoversDetalle();
      this.syncTabMisComprasPrincipal();
      this.syncAccesosPuertaNav();
    } finally {
      this.loadingCovers = false;
      this.cdr.detectChanges();
    }
  }

  private compraVistaParaCoverCedido(boleta: BoletaCoverCliente): CompraCoverCliente {
    return {
      id: boleta.compra_cover_id,
      cliente_id: boleta.compra_cliente_id ?? 0,
      numero_transaccion: boleta.compra_numero_transaccion,
      lugar_id: boleta.lugar_id,
      lugar_nombre: boleta.lugar_nombre,
      total: 0,
      estado_pago: boleta.compra_estado_pago,
      estado_compra: boleta.compra_estado_compra,
      fecha_compra: boleta.compra_fecha_compra,
      boletas_count: 1,
    };
  }

  private reconstruirLugaresConCovers(): void {
    const porLugar = new Map<number, LugarCoverGrupo>();

    for (const compra of this.comprasCover) {
      if (!porLugar.has(compra.lugar_id)) {
        porLugar.set(compra.lugar_id, {
          key: String(compra.lugar_id),
          lugarId: compra.lugar_id,
          lugarNombre: compra.lugar_nombre,
          compras: [],
          boletas: [],
          totalBoletas: 0,
          totalDisponibles: 0,
          totalEnCurso: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
        });
      }
      porLugar.get(compra.lugar_id)!.compras.push(compra);
    }

    for (const item of this.boletasCover) {
      let grupo = porLugar.get(item.compra.lugar_id);
      if (!grupo) {
        grupo = {
          key: String(item.compra.lugar_id),
          lugarId: item.compra.lugar_id,
          lugarNombre: item.boleta.lugar_nombre || item.compra.lugar_nombre,
          compras: item.esCedida ? [] : [item.compra],
          boletas: [],
          totalBoletas: 0,
          totalDisponibles: 0,
          totalEnCurso: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
        };
        porLugar.set(item.compra.lugar_id, grupo);
      }

      const enTraslado = this.tieneTrasladoSalienteCoverActivo(item.boleta.id);
      const usada = this.esBoletaCoverUsada(item.boleta);
      grupo.boletas.push(item);
      grupo.totalBoletas += 1;
      if (usada) {
        grupo.totalUsadas += 1;
      } else if (enTraslado) {
        grupo.totalTrasladoSaliente += 1;
      } else if (this.esCoverEnCurso(item.boleta)) {
        grupo.totalEnCurso += 1;
      } else {
        grupo.totalDisponibles += 1;
      }
    }

    this.lugaresConCovers = Array.from(porLugar.values()).sort((a, b) =>
      a.lugarNombre.localeCompare(b.lugarNombre, 'es')
    );
  }

  isLugarCoverExpandido(lugarKey: string): boolean {
    return this.lugarCoverExpandidoKey === lugarKey;
  }

  toggleLugarCoverExpandido(lugarKey: string): void {
    this.lugarCoverExpandidoKey = this.lugarCoverExpandidoKey === lugarKey ? null : lugarKey;
    this.cdr.detectChanges();
  }

  /** Cover que ya pasó por puerta al menos una vez (no transferible). */
  coverAccesoUtilizadoEnPuerta(boleta: BoletaCoverCliente): boolean {
    const acceso = (boleta.estado_acceso || '').toLowerCase();
    return acceso !== '' && acceso !== 'pendiente';
  }

  /** Covers con acceso ya registrado en puerta que hoy pueden entrar o salir con QR. */
  coversAccesoRapido(): BoletaCoverConCompra[] {
    return this.boletasCover
      .filter((item) => this.esCoverAccesoRapido(item))
      .sort((a, b) => {
        const prio = (item: BoletaCoverConCompra) =>
          this.accionCoverAccesoRapido(item) === 'salida' ? 0 : 1;
        const byPrio = prio(a) - prio(b);
        if (byPrio !== 0) return byPrio;
        return (a.boleta.lugar_nombre || '').localeCompare(b.boleta.lugar_nombre || '', 'es');
      });
  }

  coversAccesoRapidoEnClub(grupo: LugarCoverGrupo): BoletaCoverConCompra[] {
    return this.coversAccesoRapido().filter(
      (item) => item.compra.lugar_id === grupo.lugarId || String(item.compra.lugar_id) === grupo.key
    );
  }

  esCoverAccesoRapido(item: BoletaCoverConCompra): boolean {
    if (!this.puedeAbrirQrCover(item)) return false;
    if (!this.esDiaSesionCover(item.boleta)) return false;
    if (!this.coverAccesoUtilizadoEnPuerta(item.boleta)) return false;
    if (this.esBoletaCoverUsada(item.boleta)) return false;
    const acceso = (item.boleta.estado_acceso || '').toLowerCase();
    return acceso === 'dentro' || (acceso === 'fuera' && !!item.boleta.permite_reingreso);
  }

  accionCoverAccesoRapido(item: BoletaCoverConCompra): 'entrada' | 'salida' {
    return (item.boleta.estado_acceso || '').toLowerCase() === 'dentro' ? 'salida' : 'entrada';
  }

  labelBotonQrCover(item: BoletaCoverConCompra): string {
    if ((item.boleta.estado_acceso || '').toLowerCase() === 'dentro') {
      return 'QR para salir';
    }
    if (this.coverAccesoUtilizadoEnPuerta(item.boleta)) {
      return 'QR para entrar';
    }
    return 'Ver QR';
  }

  iconoBotonQrCover(item: BoletaCoverConCompra): string {
    if ((item.boleta.estado_acceso || '').toLowerCase() === 'dentro') {
      return 'logout';
    }
    if (this.coverAccesoUtilizadoEnPuerta(item.boleta)) {
      return 'login';
    }
    return 'qr_code_2';
  }

  hintQrCoverAcceso(item: BoletaCoverConCompra | null): string {
    return hintQrCoverAccesoText(item);
  }

  private syncAccesosPuertaNav(): void {
    if (!coversEventumEnabled) {
      return;
    }
    this.accesosPuertaService.syncFromBoletasCover(
      this.boletasCover,
      this.trasladoSalientePorBoletaCoverId
    );
  }

  esBoletaCoverUsada(boleta: BoletaCoverCliente): boolean {
    const estado = (boleta.estado || '').toLowerCase();
    const acceso = (boleta.estado_acceso || '').toLowerCase();
    if (estado === 'consumida' || estado === 'cancelada' || acceso === 'consumida') {
      return true;
    }
    if (acceso === 'fuera' && boleta.permite_reingreso === false) {
      return true;
    }
    return false;
  }

  /** Cover activo en puerta (entró, salió con reingreso, etc.) pero aún no consumido. */
  esCoverEnCurso(boleta: BoletaCoverCliente): boolean {
    return !this.esBoletaCoverUsada(boleta) && this.coverAccesoUtilizadoEnPuerta(boleta);
  }

  esCoverSinUsar(boleta: BoletaCoverCliente): boolean {
    return !this.esBoletaCoverUsada(boleta) && !this.coverAccesoUtilizadoEnPuerta(boleta);
  }

  esDiaSesionCover(boleta: BoletaCoverCliente): boolean {
    if (!boleta.sesion_fecha) return true;
    const sesion = new Date(`${boleta.sesion_fecha}T12:00:00`);
    if (Number.isNaN(sesion.getTime())) return true;
    const hoy = this.diaCalendarioLocal(new Date());
    const diaSesion = this.diaCalendarioLocal(sesion);
    return hoy === diaSesion;
  }

  labelSesionCoverBoleta(boleta: BoletaCoverCliente): string {
    return labelSesionCover({
      fecha: boleta.sesion_fecha,
      hora_apertura: boleta.sesion_hora_apertura,
      hora_cierre: boleta.sesion_hora_cierre,
      tipo_cover_nombre: boleta.tipo_cover_nombre,
    });
  }

  fechaSesionCoverBoleta(boleta: BoletaCoverCliente): string {
    const fecha = new Date(`${boleta.sesion_fecha}T12:00:00`);
    return fecha.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  horarioSesionCoverBoleta(boleta: BoletaCoverCliente): string {
    const apertura = formatHoraCover(boleta.sesion_hora_apertura);
    const cierre = formatHoraCover(boleta.sesion_hora_cierre);
    return apertura && cierre ? `${apertura} – ${cierre}` : apertura || cierre || '—';
  }

  getEstadoCoverLabel(boleta: BoletaCoverCliente): string {
    if (this.esBoletaCoverUsada(boleta)) return 'Usada';
    if (boleta.estado_acceso === 'dentro') return 'Dentro';
    if (boleta.estado_acceso === 'fuera' && boleta.permite_reingreso) return 'Fuera · reingreso';
    if (boleta.estado_acceso === 'fuera') return 'Salió';
    return 'Sin usar';
  }

  getEstadoCoverClass(boleta: BoletaCoverCliente): string {
    if (this.esBoletaCoverUsada(boleta)) return 'badge-warning';
    if (boleta.estado_acceso === 'dentro') return 'badge-success';
    if (boleta.estado_acceso === 'fuera') return 'badge-info';
    return 'badge-info-soft';
  }

  mensajeHabilitacionQrCover(boleta: BoletaCoverCliente): string {
    if (!boleta.sesion_fecha) {
      return 'El código QR estará disponible el día de la noche reservada.';
    }
    const sesion = new Date(`${boleta.sesion_fecha}T12:00:00`);
    if (Number.isNaN(sesion.getTime())) {
      return 'El código QR estará disponible el día de la noche reservada.';
    }
    return `Disponible el ${this.formatFechaHabilitacionAmigable(sesion)}`;
  }

  esTitularCover(item: BoletaCoverConCompra): boolean {
    const uid = this.authService.getUsuarioId();
    if (!uid) return false;
    const titular = item.boleta.titular_cliente_id ?? item.compra.cliente_id ?? item.boleta.compra_cliente_id;
    return titular === uid;
  }

  tieneTrasladoSalienteCoverActivo(boletaCoverId: number): boolean {
    return this.trasladoSalientePorBoletaCoverId.has(Number(boletaCoverId));
  }

  puedeAsignarCoverPorCorreo(item: BoletaCoverConCompra): boolean {
    if (item.compra.estado_pago !== TipoEstadoPago.COMPLETADO) return false;
    if (!this.esTitularCover(item)) return false;
    if (this.tieneTrasladoSalienteCoverActivo(item.boleta.id)) return false;
    if (this.esBoletaCoverUsada(item.boleta)) return false;
    if (this.coverAccesoUtilizadoEnPuerta(item.boleta)) return false;
    return true;
  }

  puedeMostrarQrCover(item: BoletaCoverConCompra): boolean {
    return (
      this.esTitularCover(item) &&
      item.compra.estado_pago === TipoEstadoPago.COMPLETADO &&
      !!item.boleta.codigo_qr?.trim() &&
      !this.esBoletaCoverUsada(item.boleta) &&
      !this.tieneTrasladoSalienteCoverActivo(item.boleta.id) &&
      this.esDiaSesionCover(item.boleta)
    );
  }

  puedeAbrirQrCover(item: BoletaCoverConCompra): boolean {
    return (
      this.esTitularCover(item) &&
      item.compra.estado_pago === TipoEstadoPago.COMPLETADO &&
      !!item.boleta.codigo_qr?.trim() &&
      !this.esBoletaCoverUsada(item.boleta) &&
      !this.tieneTrasladoSalienteCoverActivo(item.boleta.id)
    );
  }

  abrirDetalleClubCover(lugarKey: string | number): void {
    this.tabMisComprasPrincipal = 'covers';
    this.router.navigate(['/mis-compras/club', String(lugarKey)]);
  }

  lugarCoverDetalle(): LugarCoverGrupo | null {
    if (!this.lugarCoverDetalleKey) return null;
    return this.lugaresConCovers.find((g) => g.key === this.lugarCoverDetalleKey) || null;
  }

  resumenDetalleClubCover(grupo: LugarCoverGrupo): string {
    const partes: string[] = [];
    if (grupo.totalDisponibles > 0) {
      partes.push(`${grupo.totalDisponibles} sin usar`);
    }
    if (grupo.totalEnCurso > 0) {
      partes.push(`${grupo.totalEnCurso} en curso`);
    }
    if (grupo.totalTrasladoSaliente > 0) {
      partes.push(
        `${grupo.totalTrasladoSaliente} con envío pendiente`
      );
    }
    if (grupo.totalUsadas > 0) {
      partes.push(`${grupo.totalUsadas} usada${grupo.totalUsadas === 1 ? '' : 's'}`);
    }
    const cedidas = this.coversCedidasEnClub(grupo);
    if (cedidas > 0) {
      partes.push(`${cedidas} recibida${cedidas === 1 ? '' : 's'}`);
    }
    return partes.join(' · ');
  }

  tiposCoverResumenParaBadges(grupo: LugarCoverGrupo): Array<{ nombre: string; total: number }> {
    const map = new Map<string, number>();
    for (const item of grupo.boletas) {
      const nombre = (item.boleta.tipo_cover_nombre || 'Cover').trim();
      map.set(nombre, (map.get(nombre) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  coversCedidasEnClub(grupo: LugarCoverGrupo): number {
    return grupo.boletas.filter((item) => item.esCedida).length;
  }

  mostrarTabCoversDetalle(
    grupo: LugarCoverGrupo,
    tab: 'sin-usar' | 'en-curso' | 'usadas'
  ): boolean {
    if (tab === 'sin-usar') {
      return grupo.boletas.some((item) => this.esCoverSinUsar(item.boleta));
    }
    if (tab === 'en-curso') {
      return grupo.boletas.some((item) => this.esCoverEnCurso(item.boleta));
    }
    return grupo.boletas.some((item) => this.esBoletaCoverUsada(item.boleta));
  }

  coversDetallePorTab(grupo: LugarCoverGrupo): BoletaCoverConCompra[] {
    return grupo.boletas.filter((item) => {
      if (this.tabCoversDetalle === 'sin-usar') {
        return this.esCoverSinUsar(item.boleta);
      }
      if (this.tabCoversDetalle === 'en-curso') {
        return this.esCoverEnCurso(item.boleta);
      }
      return this.esBoletaCoverUsada(item.boleta);
    });
  }

  private syncTabCoversDetalle(): void {
    const detalle = this.lugarCoverDetalle();
    if (!detalle) return;
    if (this.mostrarTabCoversDetalle(detalle, this.tabCoversDetalle)) return;
    const orden: Array<'sin-usar' | 'en-curso' | 'usadas'> = ['sin-usar', 'en-curso', 'usadas'];
    for (const tab of orden) {
      if (this.mostrarTabCoversDetalle(detalle, tab)) {
        this.tabCoversDetalle = tab;
        return;
      }
    }
  }

  abrirModalTrasladoCover(item: BoletaCoverConCompra): void {
    if (!this.puedeAsignarCoverPorCorreo(item)) return;
    this.trasladoCoverItem = item;
    this.trasladoBoleta = null;
    this.trasladoCompra = null;
    this.emailTrasladoDestino = '';
    this.showTrasladoModal = true;
    this.cdr.detectChanges();
  }

  get esTrasladoModalCover(): boolean {
    return !!this.trasladoCoverItem;
  }

  get resumenTrasladoTitulo(): string {
    return this.esTrasladoModalCover ? RESUMEN_TRASLADO_COVER_TITULO : RESUMEN_TRASLADO_ENTRADA_TITULO;
  }

  get resumenTrasladoSubtitulo(): string {
    return this.esTrasladoModalCover ? RESUMEN_TRASLADO_COVER_SUBTITULO : RESUMEN_TRASLADO_ENTRADA_SUBTITULO;
  }

  get resumenTrasladoPuntos(): string[] {
    return this.esTrasladoModalCover ? RESUMEN_TRASLADO_COVER_PUNTOS : RESUMEN_TRASLADO_ENTRADA_PUNTOS;
  }

  readonly resumenYoAsistoTitulo = RESUMEN_YO_ASISTO_TITULO;
  readonly resumenYoAsistoSubtitulo = RESUMEN_YO_ASISTO_SUBTITULO;
  readonly resumenYoAsistoPuntos = RESUMEN_YO_ASISTO_PUNTOS;

  abrirModalCancelarTraslado(t: TrasladoBoleta): void {
    this.trasladoACancelar = t;
    this.showCancelarTrasladoModal = true;
    this.cdr.detectChanges();
  }

  cerrarModalCancelarTraslado(): void {
    this.showCancelarTrasladoModal = false;
    this.trasladoACancelar = null;
    this.cancelandoTraslado = false;
    this.cdr.detectChanges();
  }

  get esCancelarTrasladoCover(): boolean {
    return !!this.trasladoACancelar && this.esTrasladoCover(this.trasladoACancelar);
  }

  get resumenCancelarTrasladoTitulo(): string {
    return this.esCancelarTrasladoCover
      ? RESUMEN_CANCELAR_TRASLADO_COVER_TITULO
      : RESUMEN_CANCELAR_TRASLADO_ENTRADA_TITULO;
  }

  get resumenCancelarTrasladoSubtitulo(): string {
    return this.esCancelarTrasladoCover
      ? RESUMEN_CANCELAR_TRASLADO_COVER_SUBTITULO
      : RESUMEN_CANCELAR_TRASLADO_ENTRADA_SUBTITULO;
  }

  get resumenCancelarTrasladoPuntos(): string[] {
    return this.esCancelarTrasladoCover
      ? RESUMEN_CANCELAR_TRASLADO_COVER_PUNTOS
      : RESUMEN_CANCELAR_TRASLADO_ENTRADA_PUNTOS;
  }

  async verQrCover(item: BoletaCoverConCompra): Promise<void> {
    if (!this.esTitularCover(item)) {
      this.alertService.warning('No disponible', 'Esta entrada no está asignada a tu usuario.');
      return;
    }
    if (this.tieneTrasladoSalienteCoverActivo(item.boleta.id)) {
      this.alertService.warning(
        'Transferencia pendiente',
        'No puedes ver el QR mientras la otra persona no acepte o rechace en Mis Compras → Covers.'
      );
      return;
    }
    if (item.compra.estado_pago !== TipoEstadoPago.COMPLETADO) {
      this.alertService.warning(
        'Pago pendiente',
        'El código QR estará disponible una vez que el pago sea completado.'
      );
      return;
    }
    if (!item.boleta.codigo_qr?.trim()) {
      this.alertService.warning(
        'QR en preparación',
        'Esta entrada aún no tiene código QR. Recarga en unos segundos o vuelve a intentarlo.'
      );
      return;
    }
    this.coverBoletaSeleccionada = item;
    this.coverQrCodeUrl = '';
    this.showCoverQrModal = true;
    this.loadingCoverQR = this.puedeMostrarQrCover(item);
    this.cdr.detectChanges();

    if (!this.loadingCoverQR) return;
    try {
      this.coverQrCodeUrl = await QRCode.toDataURL(item.boleta.codigo_qr!, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch (err) {
      console.error('Error generando QR cover:', err);
      this.coverQrCodeUrl = '';
    } finally {
      this.loadingCoverQR = false;
      this.cdr.detectChanges();
    }
  }

  cerrarCoverQrModal(): void {
    this.showCoverQrModal = false;
    this.coverBoletaSeleccionada = null;
    this.coverQrCodeUrl = '';
    this.loadingCoverQR = false;
    this.cdr.detectChanges();
  }

  private async loadComprasProductos(): Promise<void> {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      this.comprasProductos = [];
      return;
    }

    const background = this.currentLoadBackground;
    const mostrarCargaProductos = !background || this.comprasProductos.length === 0;
    if (mostrarCargaProductos) {
      this.loadingComprasProductos = true;
    }
    try {
      const compras = await this.comprasProductoService.getComprasByCliente(clienteId);
      this.comprasProductos = compras.filter(
        (compra) => (compra.estado_pago || '').toLowerCase() === TipoEstadoPago.COMPLETADO
      );
    } catch (err) {
      console.error('Error cargando compras de productos:', err);
      this.comprasProductos = [];
    } finally {
      this.loadingComprasProductos = false;
      this.fusionarProductosEnEventos();
      this.syncTabEventoDetalle();
      await this.actualizarPromoProductos();
      this.cdr.detectChanges();
    }
  }

  private async actualizarPromoProductos(): Promise<void> {
    const ids = this.eventosConBoletas
      .map((grupo) => Number(grupo.key))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (ids.length === 0) {
      this.promoProductos = null;
      this.loadingPromoProductos = false;
      return;
    }

    const promoActual = this.promoProductos;
    const mostrarSkeleton = !promoActual;
    if (mostrarSkeleton) {
      this.loadingPromoProductos = true;
      this.cdr.detectChanges();
    }

    const refreshSeq = ++this.promoProductosRefreshSeq;
    try {
      const resumen = await this.productosService.getResumenProductosPorEvento(ids);
      if (refreshSeq !== this.promoProductosRefreshSeq) {
        return;
      }
      const candidatos = this.eventosConBoletas
        .map((grupo) => {
          const eventoId = Number(grupo.key);
          const info = resumen.get(eventoId);
          if (!info?.cantidad) {
            return null;
          }
          return {
            grupo,
            eventoId,
            info,
            sinComprasProducto: (grupo.totalItemsProducto ?? 0) === 0,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => {
          if (a.sinComprasProducto !== b.sinComprasProducto) {
            return a.sinComprasProducto ? -1 : 1;
          }
          const fechaA = a.grupo.fechaInicio ? new Date(a.grupo.fechaInicio).getTime() : 0;
          const fechaB = b.grupo.fechaInicio ? new Date(b.grupo.fechaInicio).getTime() : 0;
          return fechaA - fechaB;
        });

      const mejor = candidatos[0];
      if (!mejor) {
        this.promoProductos = null;
        return;
      }

      const siguientePromo: PromoProductosMisCompras = {
        eventoId: mejor.eventoId,
        titulo: mejor.grupo.titulo,
        cantidad: mejor.info.cantidad,
        precioMinimo: mejor.info.precioMinimo,
        sinComprasProducto: mejor.sinComprasProducto,
        totalEventosConProductos: candidatos.length,
      };
      if (!this.esMismaPromoProductos(promoActual, siguientePromo)) {
        this.promoProductos = siguientePromo;
      }
    } catch (err) {
      console.error('Error cargando promo de productos:', err);
      if (!promoActual) {
        this.promoProductos = null;
      }
    } finally {
      if (refreshSeq === this.promoProductosRefreshSeq) {
        this.loadingPromoProductos = false;
        this.cdr.detectChanges();
      }
    }
  }

  private esMismaPromoProductos(
    actual: PromoProductosMisCompras | null,
    siguiente: PromoProductosMisCompras
  ): boolean {
    if (!actual) return false;
    return (
      actual.eventoId === siguiente.eventoId &&
      actual.titulo === siguiente.titulo &&
      actual.cantidad === siguiente.cantidad &&
      actual.precioMinimo === siguiente.precioMinimo &&
      actual.sinComprasProducto === siguiente.sinComprasProducto &&
      actual.totalEventosConProductos === siguiente.totalEventosConProductos
    );
  }

  eventoTieneEntradas(grupo: EventoBoletasGrupo | null | undefined): boolean {
    return (grupo?.totalBoletas ?? 0) > 0;
  }

  eventoTieneProductos(grupo: EventoBoletasGrupo | null | undefined): boolean {
    return (grupo?.totalItemsProducto ?? 0) > 0;
  }

  mostrarTabBoletas(
    grupo: EventoBoletasGrupo | null | undefined,
    tab: 'sin-usar' | 'sin-asignar' | 'usadas'
  ): boolean {
    if (!grupo) return false;
    if (tab === 'sin-usar') return (grupo.totalSinUsar ?? 0) > 0;
    if (tab === 'sin-asignar') return (grupo.totalSinAsignar ?? 0) > 0;
    return (grupo.totalUsadas ?? 0) > 0;
  }

  mostrarTabProductos(
    grupo: EventoBoletasGrupo | null | undefined,
    tab: 'compradas' | 'redimidas'
  ): boolean {
    if (!grupo) return false;
    if (tab === 'compradas') return (grupo.totalProductosComprados ?? 0) > 0;
    return (grupo.totalProductosRedimidos ?? 0) > 0;
  }

  private syncTabEventoDetalle(): void {
    const detalle = this.eventoDetalleBoletas();
    if (!detalle) {
      return;
    }
    if (!this.eventoTieneEntradas(detalle) && this.eventoTieneProductos(detalle)) {
      this.tabEventoDetalle = 'productos';
    } else if (!this.eventoTieneProductos(detalle)) {
      this.tabEventoDetalle = 'entradas';
    }
    this.normalizarTabBoletasDetalle(detalle);
    this.syncTabProductosDetalle();
  }

  private syncTabProductosDetalle(): void {
    const detalle = this.eventoDetalleBoletas();
    if (!detalle) {
      return;
    }
    this.normalizarTabProductosDetalle(detalle);
  }

  private normalizarTabBoletasDetalle(detalle: EventoBoletasGrupo): void {
    if (this.mostrarTabBoletas(detalle, this.tabBoletasDetalle)) return;
    if (this.mostrarTabBoletas(detalle, 'sin-usar')) {
      this.tabBoletasDetalle = 'sin-usar';
      return;
    }
    if (this.mostrarTabBoletas(detalle, 'sin-asignar')) {
      this.tabBoletasDetalle = 'sin-asignar';
      return;
    }
    this.tabBoletasDetalle = 'usadas';
  }

  private normalizarTabProductosDetalle(detalle: EventoBoletasGrupo): void {
    if (this.mostrarTabProductos(detalle, this.tabProductosDetalle)) return;
    if (this.mostrarTabProductos(detalle, 'compradas')) {
      this.tabProductosDetalle = 'compradas';
      return;
    }
    this.tabProductosDetalle = 'redimidas';
  }

  esProductoComprado(item: CompraProductoItem): boolean {
    const estado = (item.estado || TipoEstadoItemProducto.PENDIENTE).toLowerCase();
    return (
      estado === TipoEstadoItemProducto.CONFIRMADO ||
      estado === TipoEstadoItemProducto.PENDIENTE
    );
  }

  esProductoRedimido(item: CompraProductoItem): boolean {
    return (item.estado || '').toLowerCase() === TipoEstadoItemProducto.ENTREGADO;
  }

  productosDetallePorTab(grupo: EventoBoletasGrupo): ProductoConCompra[] {
    const filas: ProductoConCompra[] = [];
    for (const compra of grupo.comprasProductos || []) {
      for (const item of compra.compras_productos_items || []) {
        const incluir =
          (this.tabProductosDetalle === 'compradas' && this.esProductoComprado(item)) ||
          (this.tabProductosDetalle === 'redimidas' && this.esProductoRedimido(item));
        if (incluir) {
          filas.push({ compra, item });
        }
      }
    }
    return filas;
  }

  itemsCompraPorTab(compra: CompraProducto, grupo: EventoBoletasGrupo): CompraProductoItem[] {
    const filas = this.productosDetallePorTab(grupo).filter((f) => f.compra.id === compra.id);
    return filas.map((f) => f.item);
  }

  comprasProductosDetallePorTab(grupo: EventoBoletasGrupo): CompraProductosDetalle[] {
    const filas = this.productosDetallePorTab(grupo);
    const map = new Map<number, CompraProductosDetalle>();

    for (const fila of filas) {
      let entry = map.get(fila.compra.id);
      if (!entry) {
        entry = { compra: fila.compra, items: [] };
        map.set(fila.compra.id, entry);
      }
      entry.items.push(fila.item);
    }

    return Array.from(map.values());
  }

  totalItemsCompraProductos(items: CompraProductoItem[]): number {
    return (items || []).reduce(
      (sum, item) => sum + Number(item.subtotal_linea ?? (item.cantidad || 0) * (item.precio_unitario || 0)),
      0
    );
  }

  totalUnidadesCompraProductos(items: CompraProductoItem[]): number {
    return (items || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  }

  detalleProductosCompra(compra: CompraProducto | null | undefined): Array<{ nombre: string; cantidad: number }> {
    if (!compra) return [];
    const items = compra.compras_productos_items || [];
    const map = new Map<string, { nombre: string; cantidad: number }>();

    for (const item of items) {
      const nombre = (item.productos?.nombre || 'Producto').trim();
      const key = String(item.producto_id ?? nombre).trim();
      const actual = map.get(key);
      if (actual) {
        actual.cantidad += Number(item.cantidad || 0);
      } else {
        map.set(key, { nombre, cantidad: Number(item.cantidad || 0) });
      }
    }

    return Array.from(map.values());
  }

  referenciaPedidoCorta(numeroPedido?: string): string {
    const numero = (numeroPedido || '').trim();
    if (!numero) {
      return '—';
    }
    if (numero.length <= 18) {
      return numero;
    }
    return `…${numero.slice(-10)}`;
  }

  getEstadoProductoLabel(item: CompraProductoItem): string {
    if (this.esProductoRedimido(item)) {
      return 'Redimido';
    }
    if (this.esProductoComprado(item)) {
      return 'Por retirar';
    }
    const estados: Record<string, string> = {
      [TipoEstadoItemProducto.CANCELADO]: 'Cancelado',
      [TipoEstadoItemProducto.PENDIENTE]: 'Pendiente',
      [TipoEstadoItemProducto.CONFIRMADO]: 'Por retirar',
      [TipoEstadoItemProducto.ENTREGADO]: 'Redimido'
    };
    return estados[(item.estado || '').toLowerCase()] || item.estado || 'Pendiente';
  }

  getEstadoProductoClass(item: CompraProductoItem): string {
    if (this.esProductoRedimido(item)) {
      return 'badge-warning';
    }
    if (this.esProductoComprado(item)) {
      return 'badge-success';
    }
    if ((item.estado || '').toLowerCase() === TipoEstadoItemProducto.CANCELADO) {
      return 'badge-danger';
    }
    return 'badge-info';
  }

  esDiaEventoGrupo(grupo: EventoBoletasGrupo | null | undefined): boolean {
    if (!grupo?.fechaInicio) return true;
    const inicio = new Date(grupo.fechaInicio);
    if (Number.isNaN(inicio.getTime())) return true;
    const fin = grupo.fechaFin ? new Date(grupo.fechaFin) : inicio;
    if (Number.isNaN(fin.getTime())) return true;
    const hoy = this.diaCalendarioLocal(new Date());
    const desde = Math.min(this.diaCalendarioLocal(inicio), this.diaCalendarioLocal(fin));
    const hasta = Math.max(this.diaCalendarioLocal(inicio), this.diaCalendarioLocal(fin));
    return hoy >= desde && hoy <= hasta;
  }

  private formatFechaHabilitacionAmigable(fecha: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
    }).format(fecha);
  }

  mensajeHabilitacionQrProducto(grupo: EventoBoletasGrupo | null | undefined): string {
    if (!grupo?.fechaInicio) {
      return 'El QR de este producto estará disponible el día del evento.';
    }
    const inicio = new Date(grupo.fechaInicio);
    if (Number.isNaN(inicio.getTime())) {
      return 'El QR de este producto estará disponible el día del evento.';
    }
    return `El código QR se habilita el ${this.formatFechaHabilitacionAmigable(inicio)}.`;
  }

  mensajeEstadoQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo | null | undefined): string {
    if (!this.productoTieneCodigoQR(fila)) {
      return 'Estamos preparando el QR del pedido. Vuelve a intentar en unos segundos.';
    }
    if ((fila.compra.estado_pago || '').toLowerCase() !== TipoEstadoPago.COMPLETADO) {
      return 'El código QR estará disponible cuando se confirme el pago.';
    }
    if (!this.esProductoComprado(fila.item)) {
      return 'Este item ya fue redimido.';
    }
    if (this.esDiaEventoGrupo(grupo)) {
      return 'QR disponible para retiro.';
    }
    return this.mensajeHabilitacionQrProducto(grupo);
  }

  etiquetaQrProducto(grupo: EventoBoletasGrupo | null | undefined): string {
    if (this.esDiaEventoGrupo(grupo)) {
      return 'QR disponible para retiro';
    }
    if (!grupo?.fechaInicio) {
      return 'QR disponible el día del evento';
    }
    const inicio = new Date(grupo.fechaInicio);
    if (Number.isNaN(inicio.getTime())) {
      return 'QR disponible el día del evento';
    }
    return `Disponible desde ${this.formatFechaHabilitacionAmigable(inicio)}`;
  }

  puedeAbrirQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo): boolean {
    return (
      this.productoTieneCodigoQR(fila) &&
      fila.compra.estado_pago === TipoEstadoPago.COMPLETADO &&
      this.esProductoComprado(fila.item)
    );
  }

  puedeMostrarQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo): boolean {
    return this.puedeAbrirQrProducto(fila, grupo) && this.esDiaEventoGrupo(grupo);
  }

  async verQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo): Promise<void> {
    if (!this.esProductoComprado(fila.item) || fila.compra.estado_pago !== TipoEstadoPago.COMPLETADO) return;
    if (!this.productoTieneCodigoQR(fila)) {
      this.alertService.warning(
        'QR en preparación',
        'Este pedido aún no tiene código QR asignado. Recarga en unos segundos o vuelve a intentarlo.'
      );
      return;
    }
    this.productoFilaSeleccionada = fila;
    this.productoQrCodeUrl = '';
    this.showProductoQrModal = true;
    this.loadingProductoQR = this.puedeMostrarQrProducto(fila, grupo);
    this.cdr.detectChanges();

    const codigoPedido = this.getCodigoQrCompraProducto(fila.compra);
    if (!this.loadingProductoQR || !codigoPedido) return;
    try {
      this.productoQrCodeUrl = await QRCode.toDataURL(codigoPedido, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
    } catch (err) {
      console.error('Error generando QR de producto:', err);
      this.productoQrCodeUrl = '';
    } finally {
      this.loadingProductoQR = false;
      this.cdr.detectChanges();
    }
  }

  cerrarProductoQrModal(): void {
    this.showProductoQrModal = false;
    this.productoFilaSeleccionada = null;
    this.productoQrCodeUrl = '';
    this.loadingProductoQR = false;
    this.cdr.detectChanges();
  }

  private abrirMensajeIngreso(
    tipo: 'entrada' | 'producto' | 'cover' | 'cover-salida',
    titulo: string,
    detalle: string,
    siguienteBoleta?: BoletaConCompra | null,
    referencia?: string,
    evento?: string,
    productos?: Array<{ nombre: string; cantidad: number }>,
    asistente?: string
  ): void {
    this.mensajeIngresoTipo = tipo;
    this.mensajeIngresoTitulo = titulo;
    this.mensajeIngresoDetalle = detalle;
    this.mensajeIngresoReferencia = (referencia || '').trim();
    this.mensajeIngresoEvento = (evento || '').trim();
    this.mensajeIngresoAsistente = (asistente || '').trim();
    this.mensajeIngresoProductos = productos || [];
    this.siguienteBoletaSugerida = siguienteBoleta || null;
    this.showMensajeIngresoModal = true;
    this.cdr.detectChanges();
  }

  private productosRedimidosParaModal(
    metadata: Record<string, unknown>,
    compraCapturada?: CompraProducto | null
  ): Array<{ nombre: string; cantidad: number }> {
    if (compraCapturada) {
      return this.detalleProductosCompra(compraCapturada);
    }

    const compraProductoId = Number(metadata['compra_producto_id'] ?? 0);
    if (!Number.isFinite(compraProductoId) || compraProductoId <= 0) {
      return [];
    }

    const compra = this.comprasProductos.find((c) => c.id === compraProductoId);
    return this.detalleProductosCompra(compra);
  }

  private tituloEventoDesdeMetadata(metadata: Record<string, unknown>): string {
    const eventoId = Number(metadata['evento_id'] ?? 0);
    if (!Number.isFinite(eventoId) || eventoId <= 0) {
      return '';
    }

    const grupo = this.eventosConBoletas.find((g) => g.key === String(eventoId));
    if (grupo?.titulo) {
      return grupo.titulo.trim();
    }

    const compraProducto = this.comprasProductos.find((c) => c.evento_id === eventoId);
    if (compraProducto?.eventos?.titulo) {
      return String(compraProducto.eventos.titulo).trim();
    }

    const compra = this.compras.find((c) => c.evento_id === eventoId);
    if (compra?.evento?.titulo) {
      return String(compra.evento.titulo).trim();
    }

    return '';
  }

  private buscarBoletaLocalPorId(boletaId: number): BoletaComprada | null {
    if (!Number.isFinite(boletaId) || boletaId <= 0) {
      return null;
    }
    for (const grupo of this.eventosConBoletas) {
      for (const tipo of grupo.tipos) {
        for (const item of tipo.boletas || []) {
          if (item.boleta?.id === boletaId) {
            return item.boleta;
          }
        }
      }
    }
    for (const row of this.comprasConBoletas) {
      const found = row.boletas.find((b) => b.id === boletaId);
      if (found) {
        return found;
      }
    }
    const cedida = this.entradasCedidas.find((b) => b.id === boletaId);
    if (cedida) {
      return cedida;
    }
    return null;
  }

  private asistenteDesdeBoleta(boleta: BoletaComprada | null | undefined): string {
    const nombre = nombreAsistenteBoletaEscaneo(boleta);
    return nombre === '—' ? '' : nombre;
  }

  readonly nombreAsistenteBoleta = nombreAsistenteBoletaEscaneo;
  readonly documentoAsistenteBoleta = documentoAsistenteBoletaEscaneo;

  private abrirMensajeIngresoDesdeNotificacion(
    tipo: 'entrada' | 'producto' | 'cover' | 'cover-salida',
    metadata: Record<string, unknown> | null | undefined,
    siguienteBoleta?: BoletaConCompra | null,
    compraProductoCapturada?: CompraProducto | null
  ): void {
    const meta = metadata ?? {};

    if (tipo === 'cover' || tipo === 'cover-salida') {
      const lugar = String(meta['lugar_nombre'] || '').trim();
      const tipoCover = String(meta['tipo_cover_nombre'] || '').trim();
      const qr = String(meta['codigo_qr'] || '').trim();
      const estadoAcceso = String(meta['estado_acceso'] || '').toLowerCase();
      const permiteReingreso = meta['permite_reingreso'] !== false;
      const esSalida = tipo === 'cover-salida';
      const detalleSalida =
        estadoAcceso === 'consumida' || !permiteReingreso
          ? 'Tu salida fue registrada. Esta entrada ya fue consumida.'
          : 'Tu salida fue registrada. Puedes reingresar con el mismo QR cuando quieras.';
      this.abrirMensajeIngreso(
        esSalida ? 'cover-salida' : 'cover',
        esSalida ? 'Hasta pronto' : 'Bienvenido al club',
        esSalida ? detalleSalida : 'Tu entrada de cover fue registrada en puerta.',
        null,
        qr || tipoCover || undefined,
        lugar || undefined,
        undefined,
        this.nombreAsistenteUsuarioActual()
      );
      return;
    }

    if (tipo === 'producto') {
      const productos = this.productosRedimidosParaModal(meta, compraProductoCapturada);
      this.abrirMensajeIngreso(
        'producto',
        'Gracias por tu compra',
        'Tu pedido fue entregado en el punto de retiro.',
        null,
        undefined,
        undefined,
        productos,
        this.nombreAsistenteUsuarioActual()
      );
      return;
    }

    const evento = this.tituloEventoDesdeMetadata(meta);
    const qr = String(meta['codigo_qr'] || '').trim();
    const boletaId = Number(meta['boleta_id'] ?? 0);
    const boletaRef = siguienteBoleta?.boleta ?? this.buscarBoletaLocalPorId(boletaId);
    this.abrirMensajeIngreso(
      'entrada',
      'Bienvenido al evento',
      'Tu entrada fue validada en puerta.',
      siguienteBoleta ?? null,
      qr || undefined,
      evento || undefined,
      undefined,
      this.asistenteDesdeBoleta(boletaRef)
    );
  }

  private nombreAsistenteUsuarioActual(): string {
    return nombreDisplayUsuario(this.authService.getUsuario());
  }

  cerrarMensajeIngresoModal(): void {
    this.showMensajeIngresoModal = false;
    this.mensajeIngresoTitulo = '';
    this.mensajeIngresoDetalle = '';
    this.mensajeIngresoReferencia = '';
    this.mensajeIngresoEvento = '';
    this.mensajeIngresoAsistente = '';
    this.mensajeIngresoProductos = [];
    this.siguienteBoletaSugerida = null;
    this.cdr.detectChanges();
  }

  accionMensajeIngresoModal(): void {
    const siguiente = this.siguienteBoletaSugerida;
    if (this.mensajeIngresoTipo === 'entrada' && siguiente) {
      this.cerrarMensajeIngresoModal();
      void this.verBoleta(siguiente.boleta, siguiente.compra);
      return;
    }
    this.cerrarMensajeIngresoModal();
  }

  textoBotonMensajeIngresoModal(): string {
    if (this.mensajeIngresoTipo === 'entrada' && this.siguienteBoletaSugerida) {
      return 'Escanear siguiente';
    }
    return '';
  }

  private buscarSiguienteBoleta(boletaActual: BoletaComprada, compraActual: Compra | null): BoletaConCompra | null {
    const eventoActual = this.eventoVistaBoleta(boletaActual, compraActual);
    const eventoKey = String(eventoActual?.id || compraActual?.evento_id || '');
    const grupo = this.eventosConBoletas.find((g) => g.key === eventoKey);
    if (!grupo) return null;

    const ordenBoletas = grupo.tipos.flatMap((tipo) => tipo.boletas || []);
    if (ordenBoletas.length <= 1) return null;

    const indexActual = ordenBoletas.findIndex((item) => item.boleta?.id === boletaActual.id);
    const esElegible = (item: BoletaConCompra): boolean => {
      if (!item?.boleta || !item?.compra) return false;
      if (item.boleta.id === boletaActual.id) return false;
      return this.puedeMostrarQrBoleta(item.boleta, item.compra);
    };

    if (indexActual >= 0) {
      for (let i = indexActual + 1; i < ordenBoletas.length; i += 1) {
        if (esElegible(ordenBoletas[i])) return ordenBoletas[i];
      }
      for (let i = 0; i < indexActual; i += 1) {
        if (esElegible(ordenBoletas[i])) return ordenBoletas[i];
      }
      return null;
    }

    return ordenBoletas.find(esElegible) || null;
  }

  productoTieneCodigoQR(fila: ProductoConCompra): boolean {
    return this.getCodigoQrCompraProducto(fila.compra) !== null;
  }

  getCodigoQrCompraProducto(compra: CompraProducto | null | undefined): string | null {
    const numeroPedido = String(compra?.numero_pedido || '').trim();
    if (!numeroPedido) return null;
    return `PROD-ORD-${numeroPedido}`;
  }

  esPrimerItemPedidoEnTab(fila: ProductoConCompra, grupo: EventoBoletasGrupo): boolean {
    const filas = this.productosDetallePorTab(grupo);
    const primeraFila = filas.find((x) => x.compra.id === fila.compra.id);
    return !!primeraFila && primeraFila.item.id === fila.item.id;
  }

  private filaRepresentativaCompra(compra: CompraProducto, grupo: EventoBoletasGrupo): ProductoConCompra | null {
    const fila = this.productosDetallePorTab(grupo).find((x) => x.compra.id === compra.id);
    if (!fila) return null;
    return fila;
  }

  compraTieneCodigoQR(compra: CompraProducto): boolean {
    return this.getCodigoQrCompraProducto(compra) !== null;
  }

  puedeMostrarQrCompraProducto(compra: CompraProducto, grupo: EventoBoletasGrupo): boolean {
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return false;
    return this.puedeMostrarQrProducto(fila, grupo);
  }

  mensajeEstadoQrCompraProducto(compra: CompraProducto, grupo: EventoBoletasGrupo): string {
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return 'No hay items de este pedido en el estado actual.';
    return this.mensajeEstadoQrProducto(fila, grupo);
  }

  async verQrCompraProducto(compra: CompraProducto, grupo: EventoBoletasGrupo): Promise<void> {
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return;
    await this.verQrProducto(fila, grupo);
  }

  boletaTarjetaAbreModal(boleta: BoletaComprada, compra: Compra): boolean {
    if (this.esBoletaUsada(boleta) || this.esBoletaCancelada(boleta)) return false;
    if (!this.tieneAsistenteRegistrado(boleta)) return false;
    return this.puedeAbrirVistaBoleta(boleta, compra);
  }

  productoCompraTarjetaAbreModal(compra: CompraProducto, grupo: EventoBoletasGrupo): boolean {
    if (this.tabProductosDetalle !== 'compradas') return false;
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return false;
    return this.puedeAbrirQrProducto(fila, grupo);
  }

  private esTargetInteractivoTarjeta(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest(
      'button, a, input, select, textarea, label, .boleta-asignar-palco, .boleta-actions, .boleta-traslado-saliente'
    );
  }

  isAsignarPanelAbierto(boletaId: number): boolean {
    return this.asignarPanelAbiertoBoletaId === boletaId;
  }

  toggleAsignarPanel(boletaId: number, event: Event): void {
    event.stopPropagation();
    this.asignarPanelAbiertoBoletaId =
      this.asignarPanelAbiertoBoletaId === boletaId ? null : boletaId;
    this.cdr.detectChanges();
  }

  onClickTarjetaBoleta(boleta: BoletaComprada, compra: Compra, event: Event): void {
    if (this.esTargetInteractivoTarjeta(event.target)) return;
    if (!this.boletaTarjetaAbreModal(boleta, compra)) return;
    void this.verBoleta(boleta, compra);
  }

  onClickTarjetaProducto(compra: CompraProducto, grupo: EventoBoletasGrupo, event: Event): void {
    if (!this.productoCompraTarjetaAbreModal(compra, grupo)) return;
    if (this.esTargetInteractivoTarjeta(event.target)) return;
    void this.verQrCompraProducto(compra, grupo);
  }

  getPrecioPreventaProductoDetalle(fila: ProductoConCompra): number {
    const precioCatalogo = Number(fila.item.productos?.precio);
    if (Number.isFinite(precioCatalogo) && precioCatalogo >= 0) {
      return precioCatalogo;
    }
    return Number(fila.item.precio_unitario || 0);
  }

  getPrecioEventoProductoDetalle(fila: ProductoConCompra): number {
    const precioEventoCatalogo = Number(fila.item.productos?.precio_evento);
    if (Number.isFinite(precioEventoCatalogo) && precioEventoCatalogo >= 0) {
      return precioEventoCatalogo;
    }
    return this.getPrecioPreventaProductoDetalle(fila);
  }

  tienePrecioDiferenciadoProductoDetalle(fila: ProductoConCompra): boolean {
    return this.getPrecioEventoProductoDetalle(fila) !== this.getPrecioPreventaProductoDetalle(fila);
  }

  getPrecioReferenciaProductoDetalle(fila: ProductoConCompra): number {
    const pagado = Number(fila.item.precio_unitario || 0);
    const preventa = this.getPrecioPreventaProductoDetalle(fila);
    const evento = this.getPrecioEventoProductoDetalle(fila);

    if (!this.tienePrecioDiferenciadoProductoDetalle(fila)) return pagado;
    if (Math.abs(pagado - preventa) < 0.01) return evento;
    if (Math.abs(pagado - evento) < 0.01) return preventa;
    return Math.max(preventa, evento);
  }

  getAhorroProductoDetalle(fila: ProductoConCompra): number {
    const pagado = Number(fila.item.precio_unitario || 0);
    const referencia = this.getPrecioReferenciaProductoDetalle(fila);
    const ahorro = referencia - pagado;
    return ahorro > 0 ? ahorro : 0;
  }

  getEstadoPrecioProductoDetalleLabel(fila: ProductoConCompra): string {
    const pagado = Number(fila.item.precio_unitario || 0);
    const preventa = this.getPrecioPreventaProductoDetalle(fila);
    const evento = this.getPrecioEventoProductoDetalle(fila);

    if (Math.abs(pagado - preventa) < 0.01) return 'Compraste en preventa';
    if (Math.abs(pagado - evento) < 0.01) return 'Compraste en evento';
    return 'Precio aplicado';
  }

  private recalcularContadoresProducto(grupo: EventoBoletasGrupo): void {
    let comprados = 0;
    let redimidos = 0;

    for (const compra of grupo.comprasProductos || []) {
      for (const item of compra.compras_productos_items || []) {
        const cantidad = item.cantidad || 0;
        if (this.esProductoRedimido(item)) {
          redimidos += cantidad;
        } else if (this.esProductoComprado(item)) {
          comprados += cantidad;
        }
      }
    }

    grupo.totalProductosComprados = comprados;
    grupo.totalProductosRedimidos = redimidos;
    grupo.totalItemsProducto = comprados + redimidos;
  }

  private fusionarProductosEnEventos(): void {
    if (this.comprasProductos.length === 0) {
      return;
    }

    for (const grupo of this.eventosConBoletas) {
      grupo.comprasProductos = [];
      grupo.totalItemsProducto = 0;
      grupo.totalProductosComprados = 0;
      grupo.totalProductosRedimidos = 0;
    }

    for (const compra of this.comprasProductos) {
      const eventoKey = String(compra.evento_id);
      let grupo = this.eventosConBoletas.find((g) => g.key === eventoKey);

      if (!grupo) {
        grupo = {
          key: eventoKey,
          titulo: compra.eventos?.titulo || 'Evento',
          fechaInicio: compra.eventos?.fecha_inicio,
          fechaFin: compra.eventos?.fecha_fin,
          lugar: compra.eventos?.lugar,
          tipos: [],
          compras: [],
          comprasProductos: [],
          totalCedidas: 0,
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0,
          totalItemsProducto: 0,
          totalProductosComprados: 0,
          totalProductosRedimidos: 0
        };
        this.eventosConBoletas.push(grupo);
      }

      grupo.comprasProductos.push(compra);
    }

    for (const grupo of this.eventosConBoletas) {
      this.recalcularContadoresProducto(grupo);
    }

    this.eventosConBoletas = this.eventosConBoletas
      .filter(
        (grupo) =>
          grupo.totalBoletas > 0 ||
          grupo.totalItemsProducto > 0 ||
          grupo.totalCedidas > 0
      )
      .sort((a, b) => {
        const fechaA = a.fechaInicio ? new Date(a.fechaInicio).getTime() : 0;
        const fechaB = b.fechaInicio ? new Date(b.fechaInicio).getTime() : 0;
        if (fechaA !== fechaB) return fechaB - fechaA;
        return a.titulo.localeCompare(b.titulo);
      });
  }

  totalItemsProducto(compra: CompraProducto): number {
    return (compra.compras_productos_items || []).reduce(
      (sum, item) => sum + (item.cantidad || 0),
      0
    );
  }

  private async loadComprasInternal(): Promise<PaginatedResponse<Compra>> {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      console.error('No se pudo identificar el cliente');
      return { data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 };
    }

    if (this.isOffline() && this.compras.length > 0) {
      console.info('[MisCompras] Sin conexión, usando compras cacheadas');
      return {
        data: this.compras.filter((compra) => compra.estado_pago === TipoEstadoPago.COMPLETADO),
        total: this.total || this.compras.length,
        page: this.page,
        limit: this.limit,
        totalPages: this.totalPages || Math.max(1, Math.ceil((this.total || this.compras.length) / this.limit))
      };
    }

    const filters: any = {
      cliente_id: clienteId,
      page: this.page,
      limit: this.limit,
      estado_pago: TipoEstadoPago.COMPLETADO,
    };

    // Aplicar filtros adicionales
    if (this.estadoCompraFiltro) {
      filters.estado_compra = this.estadoCompraFiltro;
    }
    if (this.fechaDesde) {
      filters.fecha_desde = this.fechaDesde;
    }
    if (this.fechaHasta) {
      filters.fecha_hasta = this.fechaHasta;
    }
    if (this.searchTerm) {
      // Buscar por número de transacción
      filters.search = this.searchTerm;
    }
    if (this.eventoFiltro) {
      filters.evento_id = this.eventoFiltro;
    }

    try {
      return await this.comprasService.getCompras(filters);
    } catch (err) {
      console.error('Error en loadComprasInternal:', err);
      return { data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 };
    }
  }

  limpiarFiltros() {
    this.estadoPagoFiltro = null;
    this.estadoCompraFiltro = null;
    this.eventoFiltro = null;
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.searchTerm = '';
    this.loadCompras();
  }

  aplicarFiltros() {
    this.loadCompras();
    this.mostrarFiltros = false;
  }

  toggleFiltros() {
    this.mostrarFiltros = !this.mostrarFiltros;
    this.cdr.detectChanges();
  }

  /**
   * Carga los eventos únicos donde el usuario tiene compras
   */
  loadEventosDisponibles() {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      return;
    }

    this.loadingEventos = true;
    
    // Obtener todas las compras del usuario (sin paginación para obtener todos los eventos)
    this.loadEventosDisponiblesInternal(clienteId);
  }

  private async loadEventosDisponiblesInternal(clienteId: number) {
    try {
      const response: PaginatedResponse<Compra> = await this.comprasService.getCompras({
        cliente_id: clienteId,
        estado_pago: TipoEstadoPago.COMPLETADO,
        limit: 1000 // Límite alto para obtener todas las compras
      });
      
      // Extraer evento_id únicos
      const eventoIds = new Set<number>();
      response.data.forEach(compra => {
        if (compra.evento_id) {
          eventoIds.add(compra.evento_id);
        }
      });

      // Cargar información de los eventos
      if (eventoIds.size > 0) {
        const eventoIdsArray = Array.from(eventoIds);
        const eventosPromises = eventoIdsArray.map(async (eventoId) => {
          try {
            return await this.eventosService.getEventoById(eventoId);
          } catch {
            return null;
          }
        });

        // Usar Promise.all para cargar todos los eventos en paralelo
        const eventos = await Promise.all(eventosPromises);
        this.eventosDisponibles = eventos.filter((e): e is Evento => e !== null)
          .sort((a, b) => {
            // Ordenar por título
            return a.titulo.localeCompare(b.titulo);
          });
        this.loadingEventos = false;
        this.cdr.detectChanges();
      } else {
        this.eventosDisponibles = [];
        this.loadingEventos = false;
        this.cdr.detectChanges();
      }
    } catch (err) {
      console.error('Error cargando compras para eventos:', err);
      this.loadingEventos = false;
      this.cdr.detectChanges();
    }
  }

  goToPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      this.page = pageNum;
      this.loadCompras({ resetPage: false, background: true });
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5; // Mostrar máximo 5 números de página
    let startPage = Math.max(1, this.page - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  private esEstadoTrasladoSalienteActivo(estado: string | undefined): boolean {
    const e = String(estado ?? '');
    return e === EstadoTrasladoBoleta.ENVIADO || e === EstadoTrasladoBoleta.RECIBIDO;
  }

  private poblarMapasTrasladoSaliente(traslados: TrasladoBoleta[]): void {
    this.trasladoSalientePorBoletaId.clear();
    this.trasladoSalientePorBoletaCoverId.clear();
    for (const t of traslados) {
      if (!this.esEstadoTrasladoSalienteActivo(t.estado)) continue;
      const coverId = Number(t.boleta_cover_id ?? 0);
      const boletaId = Number(t.boleta_id ?? 0);
      if (coverId > 0) {
        this.trasladoSalientePorBoletaCoverId.set(coverId, t);
      } else if (boletaId > 0) {
        this.trasladoSalientePorBoletaId.set(boletaId, t);
      }
    }
  }

  private aplicarTrasladosDesdeHistorial(): void {
    const uid = this.authService.getUsuarioId();
    if (!uid) return;
    const salientes = this.trasladosHistorial.filter(
      (t) =>
        Number(t.usuario_origen_id) === uid && this.esEstadoTrasladoSalienteActivo(t.estado)
    );
    this.poblarMapasTrasladoSaliente(salientes);
  }

  private async enriquecerTrasladosHistorial(): Promise<void> {
    const historial = this.trasladosHistorial;
    if (historial.length === 0) {
      return;
    }

    const boletaMap = new Map<number, BoletaComprada>();
    for (const grupo of this.comprasConBoletas) {
      for (const boleta of grupo.boletas) {
        boletaMap.set(boleta.id, boleta);
      }
    }
    for (const item of this.entradasCedidas) {
      boletaMap.set(item.id, item);
    }

    const coverMap = new Map<number, BoletaCoverCliente>();
    for (const item of this.boletasCover) {
      coverMap.set(item.boleta.id, item.boleta);
    }
    for (const item of this.coverCedidas) {
      coverMap.set(item.boleta.id, item.boleta);
    }

    const missingBoletaIds = [
      ...new Set(
        historial
          .map((t) => Number(t.boleta_id ?? 0))
          .filter((id) => id > 0 && !boletaMap.has(id))
      ),
    ];
    if (missingBoletaIds.length > 0) {
      try {
        const fetched = await this.boletasService.getBoletasByIds(missingBoletaIds);
        fetched.forEach((b) => boletaMap.set(b.id, b));
      } catch {
        /* ignorar */
      }
    }

    const missingCoverIds = [
      ...new Set(
        historial
          .map((t) => Number(t.boleta_cover_id ?? 0))
          .filter((id) => id > 0 && !coverMap.has(id))
      ),
    ];
    if (missingCoverIds.length > 0 && coversEventumEnabled) {
      try {
        const fetched = await this.coversService.listarBoletasCoverCliente();
        fetched.forEach((b) => coverMap.set(b.id, b));
      } catch {
        /* ignorar */
      }
    }

    this.trasladosHistorial = historial.map((t) => {
      const enriched: TrasladoBoleta = { ...t };
      const boletaId = Number(t.boleta_id ?? 0);
      const coverId = Number(t.boleta_cover_id ?? 0);

      if (boletaId > 0 && boletaMap.has(boletaId)) {
        const b = boletaMap.get(boletaId)!;
        const compra = this.compras.find((c) => c.id === b.compra_id);
        enriched.boleta = {
          id: b.id,
          codigo_qr: b.codigo_qr,
          tipo_boleta_id: b.tipo_boleta_id,
          numero_palco: b.numero_palco,
          tipos_boleta: {
            nombre: b.tipo_boleta_meta?.nombre || t.tipo_boleta_nombre || undefined,
            eventos: {
              titulo: compra?.evento?.titulo || t.evento_titulo || undefined,
            },
          },
        };
        if (!enriched.evento_titulo && compra?.evento?.titulo) {
          enriched.evento_titulo = compra.evento.titulo;
        }
        if (!enriched.tipo_boleta_nombre && b.tipo_boleta_meta?.nombre) {
          enriched.tipo_boleta_nombre = b.tipo_boleta_meta.nombre;
        }
      }

      if (coverId > 0 && coverMap.has(coverId)) {
        const bc = coverMap.get(coverId)!;
        enriched.coverDetail = {
          id: bc.id,
          tipo_cover_nombre: bc.tipo_cover_nombre,
          lugar_nombre: bc.lugar_nombre,
        };
        if (!enriched.lugar_nombre) {
          enriched.lugar_nombre = bc.lugar_nombre;
        }
        if (!enriched.tipo_cover_nombre) {
          enriched.tipo_cover_nombre = bc.tipo_cover_nombre;
        }
        if (!enriched.sesion_fecha) {
          enriched.sesion_fecha = bc.sesion_fecha;
        }
      }

      return enriched;
    });
  }

  private async poblarTrasladosSalientesDesdeApi(uid: number): Promise<void> {
    try {
      const salientes = await this.trasladosBoletaService.listarTrasladosSalientes(uid);
      this.poblarMapasTrasladoSaliente(salientes);
    } catch (e) {
      console.error('Error cargando traslados salientes:', e);
    }
  }

  private async refrescarTrasladosMaps(): Promise<void> {
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.trasladosHistorial = [];
      this.trasladosPendientesRecibir = [];
      this.trasladoSalientePorBoletaId.clear();
      return;
    }
    this.loadingTraslados = true;
    try {
      this.trasladosHistorial = await this.trasladosBoletaService.listarMiTrazabilidad(
        uid,
        this.authService.getUsuario()
      );
      await this.enriquecerTrasladosHistorial();
      await this.poblarTrasladosSalientesDesdeApi(uid);
      const pend = await this.trasladosBoletaService.listarPendientesRecibir(uid);
      const pendEvento = pend.filter((t) => Number(t.boleta_id ?? 0) > 0 && Number(t.boleta_cover_id ?? 0) === 0);
      const pendCover = pend.filter((t) => Number(t.boleta_cover_id ?? 0) > 0);
      const ids = pendEvento.map((p) => p.boleta_id!).filter((id) => id > 0);
      const detMap = new Map<number, BoletaComprada>();
      if (ids.length) {
        const det = await this.boletasService.getBoletasByIds(ids);
        det.forEach((b) => detMap.set(b.id, b));
      }
      this.trasladosPendientesRecibir = pendEvento.map((t) => ({
        ...t,
        boletaDetail: t.boleta_id ? detMap.get(t.boleta_id) : undefined,
      }));
      const coverIds = pendCover.map((p) => p.boleta_cover_id!).filter((id) => id > 0);
      const coverDetMap = new Map<number, BoletaCoverCliente>();
      for (const item of this.boletasCover) {
        coverDetMap.set(item.boleta.id, item.boleta);
      }
      if (coverIds.length && coverDetMap.size === 0 && coversEventumEnabled) {
        try {
          const boletas = await this.coversService.listarBoletasCoverCliente();
          boletas.forEach((b) => coverDetMap.set(b.id, b));
        } catch {
          // ignorar
        }
      }
      this.trasladosPendientesRecibirCover = pendCover.map((t) => ({
        ...t,
        coverDetail: t.boleta_cover_id ? coverDetMap.get(t.boleta_cover_id) : undefined,
      }));
      this.syncTabMisComprasPrincipal();
      this.syncTrasladosPendientesNavBadge();
      if (coversEventumEnabled && this.boletasCover.length > 0) {
        this.reconstruirLugaresConCovers();
      }
      this.aplicarTrasladosDesdeHistorial();
    } catch (e) {
      console.error('Error cargando traslados:', e);
    } finally {
      this.loadingTraslados = false;
    }
  }

  async loadBoletasPorCompra(options?: { background?: boolean }) {
    const background = options?.background ?? false;
    this.loadingBoletasDetalle = true;
    this.cdr.detectChanges();

    if (!background) {
      this.comprasConBoletas = [];
      this.eventosConBoletas = [];
      this.eventoExpandidoKey = null;
    }
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.entradasCedidas = [];
      this.loadingBoletasDetalle = false;
      return;
    }

    if (this.isOffline() && (this.comprasConBoletas.length > 0 || this.eventosConBoletas.length > 0)) {
      console.info('[MisCompras] Sin conexión, usando boletas cacheadas');
      this.loadingBoletasDetalle = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      await this.refrescarTrasladosMaps();
      const nextComprasConBoletas: { compra: Compra; boletas: BoletaComprada[] }[] = [];

      for (const compra of this.compras) {
        if (compra.estado_pago !== TipoEstadoPago.COMPLETADO) {
          continue;
        }
        try {
          const response = await this.boletasService.getBoletasCompradas({
            compra_id: compra.id,
            limit: 1000
          });
          const boletas = response.data || [];
          const visibles = boletas.filter(
            (b) => this.esTitularBoleta(b, compra) && !this.esBoletaCancelada(b)
          );
          if (visibles.length === 0) {
            continue;
          }
          nextComprasConBoletas.push({
            compra,
            boletas: visibles
          });
        } catch (err) {
          console.error('Error cargando boletas para compra:', compra.id, err);
        }
      }
      this.comprasConBoletas = nextComprasConBoletas;

      try {
        this.entradasCedidas = (await this.boletasService.getBoletasCedidasTitular(uid))
          .filter(
            (b) =>
              !this.esBoletaCancelada(b) &&
              b.compra?.estado_pago === TipoEstadoPago.COMPLETADO
          );
      } catch (e) {
        console.error('Error cargando entradas cedidas:', e);
        this.entradasCedidas = [];
      }

      this.reconstruirEventosConBoletas();
    } finally {
      this.loadingBoletasDetalle = false;
      this.sincronizarRealtimeNotificaciones();
      this.cdr.detectChanges();
    }
  }

  private reconstruirEventosConBoletas(): void {
    const productosSnapshot = this.capturarProductosPorEvento();

    const eventosMap = new Map<string, EventoBoletasGrupo>();

    const agregarBoleta = (compra: Compra, boleta: BoletaComprada, esCedida = false): void => {
      const evento = this.eventoVistaBoleta(boleta, compra);
      const eventoId = evento?.id ?? compra.evento_id ?? `compra-${compra.id}`;
      const eventoKey = String(eventoId);
      let grupoEvento = eventosMap.get(eventoKey);

      if (!grupoEvento) {
        grupoEvento = {
          key: eventoKey,
          titulo: evento?.titulo || compra.evento?.titulo || 'Evento',
          fechaInicio: evento?.fecha_inicio || compra.evento?.fecha_inicio,
          fechaFin: this.fechaFinEvento(evento),
          lugar: evento?.lugar || compra.evento?.lugar,
          tipos: [],
          compras: [],
          comprasProductos: [],
          totalCedidas: 0,
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0,
          totalItemsProducto: 0,
          totalProductosComprados: 0,
          totalProductosRedimidos: 0
        };
        eventosMap.set(eventoKey, grupoEvento);
      }

      if (!esCedida && !grupoEvento.compras.some((c) => c.id === compra.id)) {
        grupoEvento.compras.push(compra);
      }

      if (esCedida) {
        grupoEvento.totalCedidas += 1;
      }

      const tipoNombre = boleta.tipo_boleta_meta?.nombre || 'Boleta';
      const tipoKey = `${boleta.tipo_boleta_id || 'sin-tipo'}-${tipoNombre}`;
      let grupoTipo = grupoEvento.tipos.find((tipo) => tipo.key === tipoKey);

      if (!grupoTipo) {
        grupoTipo = {
          key: tipoKey,
          nombre: tipoNombre,
          boletas: [],
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0
        };
        grupoEvento.tipos.push(grupoTipo);
      }

      const estaEnTraslado = this.tieneTrasladoSalienteActivo(boleta.id);
      const estaUsada = this.esBoletaUsada(boleta);
      const estaAsignada = this.tieneAsistenteRegistrado(boleta);
      grupoTipo.boletas.push({ compra, boleta, esCedida });
      grupoTipo.totalBoletas += 1;
      grupoEvento.totalBoletas += 1;
      if (estaUsada) {
        grupoTipo.totalUsadas += 1;
        grupoEvento.totalUsadas += 1;
      } else if (!estaAsignada) {
        grupoTipo.totalSinAsignar += 1;
        grupoEvento.totalSinAsignar += 1;
      } else {
        grupoTipo.totalSinUsar += 1;
        grupoEvento.totalSinUsar += 1;
      }

      if (estaEnTraslado) {
        grupoTipo.totalTrasladoSaliente += 1;
        grupoEvento.totalTrasladoSaliente += 1;
      } else {
        grupoTipo.totalDisponibles += 1;
        grupoEvento.totalDisponibles += 1;
      }
    };

    for (const item of this.comprasConBoletas) {
      for (const boleta of item.boletas) {
        if (this.esBoletaCancelada(boleta)) {
          continue;
        }
        agregarBoleta(item.compra, boleta);
      }
    }

    for (const boleta of this.entradasCedidas) {
      if (this.esBoletaCancelada(boleta)) {
        continue;
      }
      agregarBoleta(this.compraVistaParaBoletaCedida(boleta), boleta, true);
    }

    this.eventosConBoletas = Array.from(eventosMap.values())
      .map((grupo) => ({
        ...grupo,
        comprasProductos: grupo.comprasProductos ?? [],
        totalItemsProducto: grupo.totalItemsProducto ?? 0,
        totalProductosComprados: grupo.totalProductosComprados ?? 0,
        totalProductosRedimidos: grupo.totalProductosRedimidos ?? 0,
        tipos: grupo.tipos.sort((a, b) => a.nombre.localeCompare(b.nombre))
      }))
      .sort((a, b) => {
        const fechaA = a.fechaInicio ? new Date(a.fechaInicio).getTime() : 0;
        const fechaB = b.fechaInicio ? new Date(b.fechaInicio).getTime() : 0;
        if (fechaA !== fechaB) return fechaB - fechaA;
        return a.titulo.localeCompare(b.titulo);
      });

    this.restaurarProductosDesdeSnapshot(productosSnapshot);
    this.fusionarProductosEnEventos();
    this.guiaEntradasAbierta = this.eventosConBoletas.length === 0;
  }

  private capturarProductosPorEvento(): Map<string, EventoBoletasGrupo> {
    const snapshot = new Map<string, EventoBoletasGrupo>();
    for (const grupo of this.eventosConBoletas) {
      if ((grupo.totalItemsProducto ?? 0) <= 0 && (grupo.comprasProductos?.length ?? 0) === 0) {
        continue;
      }
      snapshot.set(grupo.key, {
        ...grupo,
        comprasProductos: [...(grupo.comprasProductos || [])],
        tipos: [...(grupo.tipos || [])],
        compras: [...(grupo.compras || [])],
      });
    }
    return snapshot;
  }

  private restaurarProductosDesdeSnapshot(snapshot: Map<string, EventoBoletasGrupo>): void {
    if (this.comprasProductos.length > 0 || snapshot.size === 0) {
      return;
    }

    for (const grupo of this.eventosConBoletas) {
      const prev = snapshot.get(grupo.key);
      if (!prev) continue;
      grupo.comprasProductos = [...(prev.comprasProductos || [])];
      grupo.totalItemsProducto = prev.totalItemsProducto ?? 0;
      grupo.totalProductosComprados = prev.totalProductosComprados ?? 0;
      grupo.totalProductosRedimidos = prev.totalProductosRedimidos ?? 0;
    }

    for (const [key, prev] of snapshot) {
      if (this.eventosConBoletas.some((grupo) => grupo.key === key)) {
        continue;
      }
      this.eventosConBoletas.push({
        ...prev,
        comprasProductos: [...(prev.comprasProductos || [])],
        tipos: [...(prev.tipos || [])],
        compras: [...(prev.compras || [])],
      });
    }

    this.eventosConBoletas.sort((a, b) => {
      const fechaA = a.fechaInicio ? new Date(a.fechaInicio).getTime() : 0;
      const fechaB = b.fechaInicio ? new Date(b.fechaInicio).getTime() : 0;
      if (fechaA !== fechaB) return fechaB - fechaA;
      return a.titulo.localeCompare(b.titulo);
    });
  }

  esTitularBoleta(b: BoletaComprada, compra: Compra): boolean {
    const uid = this.authService.getUsuarioId();
    if (!uid) return false;
    const titular = b.titular_cliente_id ?? compra.cliente_id;
    return titular === uid;
  }

  tieneTrasladoSalienteActivo(boletaId: number): boolean {
    return this.trasladoSalientePorBoletaId.has(Number(boletaId));
  }

  trasladoSalienteParaBoleta(boletaId: number): TrasladoBoleta | undefined {
    return this.trasladoSalientePorBoletaId.get(Number(boletaId));
  }

  trasladoSalienteParaCover(boletaCoverId: number): TrasladoBoleta | undefined {
    return this.trasladoSalientePorBoletaCoverId.get(Number(boletaCoverId));
  }

  trasladosPendientesRecibirEnEvento(detalle: EventoBoletasGrupo): Array<
    TrasladoBoleta & { boletaDetail?: BoletaComprada }
  > {
    const eventoId = Number(detalle.key);
    if (!Number.isFinite(eventoId)) return [];
    return this.trasladosPendientesRecibir.filter((t) => {
      const eid = t.boletaDetail?.evento?.id ?? t.evento_id;
      return Number(eid) === eventoId;
    });
  }

  trasladosPendientesRecibirCoverEnClub(club: LugarCoverGrupo): Array<
    TrasladoBoleta & { coverDetail?: BoletaCoverCliente }
  > {
    const lugarId = Number(club.key);
    if (!Number.isFinite(lugarId)) return [];
    return this.trasladosPendientesRecibirCover.filter((t) => {
      const lid = t.coverDetail?.lugar_id ?? t.lugar_id;
      return Number(lid) === lugarId;
    });
  }

  /**
   * Boletas que siguen contándose como “tuyas” en el listado: excluye las que enviaste
   * por correo con traslado pendiente (aún eres titular pero no disponibles como el resto).
   */
  conteoBoletasDisponiblesEnFeed(boletas: BoletaComprada[]): number {
    return boletas.filter((b) => !this.tieneTrasladoSalienteActivo(b.id)).length;
  }

  conteoBoletasConTrasladoSaliente(boletas: BoletaComprada[]): number {
    return boletas.filter((b) => this.tieneTrasladoSalienteActivo(b.id)).length;
  }

  esBoletaTipoPalco(boleta: BoletaComprada): boolean {
    if (boleta.numero_palco != null) return true;
    return Boolean(boleta.tipo_boleta_meta?.es_palco);
  }

  tituloColeccionBoletas(boletas: BoletaComprada[]): string {
    return boletas.some((b) => this.esBoletaTipoPalco(b)) ? 'Boletas y palcos' : 'Boletas';
  }

  toggleEventoBoletas(eventoKey: string): void {
    this.eventoExpandidoKey = this.eventoExpandidoKey === eventoKey ? null : eventoKey;
    this.cdr.detectChanges();
  }

  isEventoBoletasExpandido(eventoKey: string): boolean {
    return this.eventoExpandidoKey === eventoKey;
  }

  abrirDetalleEventoBoletas(eventoKey: string): void {
    const grupo = this.eventosConBoletas.find((g) => g.key === eventoKey);
    if (grupo && !this.eventoTieneEntradas(grupo) && this.eventoTieneProductos(grupo)) {
      this.tabEventoDetalle = 'productos';
    } else {
      this.tabEventoDetalle = 'entradas';
    }
    this.syncTabProductosDetalle();
    this.router.navigate(['/mis-compras/evento', eventoKey]);
  }

  volverAMisCompras(): void {
    if (this.lugarCoverDetalleKey) {
      this.tabMisComprasPrincipal = 'covers';
    }
    this.router.navigate(['/mis-compras']);
  }

  eventoDetalleBoletas(): EventoBoletasGrupo | null {
    if (!this.eventoDetalleKey) return null;
    return this.eventosConBoletas.find((grupo) => grupo.key === this.eventoDetalleKey) || null;
  }

  resumenDetalleEvento(grupo: EventoBoletasGrupo): string {
    const partes: string[] = [];
    if (grupo.totalBoletas > 0) {
      partes.push(`${grupo.totalBoletas} entrada${grupo.totalBoletas === 1 ? '' : 's'}`);
    }
    if (grupo.totalItemsProducto > 0) {
      partes.push(`${grupo.totalItemsProducto} producto${grupo.totalItemsProducto === 1 ? '' : 's'}`);
    }
    if (grupo.totalCedidas > 0) {
      partes.push(`${grupo.totalCedidas} recibida${grupo.totalCedidas === 1 ? '' : 's'}`);
    }
    return partes.join(' · ');
  }

  /** Tipos con nombre y cantidad > 0 para badges de resumen (sin fila genérica «N tipos»). */
  tiposResumenParaBadges(grupo: EventoBoletasGrupo | null | undefined): TipoBoletasGrupo[] {
    if (!grupo?.tipos?.length) return [];
    return grupo.tipos.filter((t) => {
      if ((t.totalBoletas ?? 0) <= 0) return false;
      if (!(t.nombre || '').trim()) return false;
      // Sin tipo en backend: agrupamos bajo prefijo sin id de tipo.
      if (t.key.startsWith('sin-tipo-')) return false;
      return true;
    });
  }

  tiposDetallePorTab(grupo: EventoBoletasGrupo | null): TipoBoletasGrupo[] {
    if (!grupo) return [];
    return grupo.tipos
      .map((tipo) => ({
        ...tipo,
        boletas: tipo.boletas.filter((item) => {
          const usada = this.esBoletaUsada(item.boleta);
          const asignada = this.tieneAsistenteRegistrado(item.boleta);
          if (this.tabBoletasDetalle === 'usadas') return usada;
          if (this.tabBoletasDetalle === 'sin-asignar') return !usada && !asignada;
          return !usada && asignada;
        })
      }))
      .filter((tipo) => tipo.boletas.length > 0);
  }

  // Algunos objetos evento enriquecidos pueden traer `fecha_fin` aunque el tipo no lo declare.
  fechaFinEvento(evento: any): any {
    return evento?.fecha_fin;
  }

  eventoVistaBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): any {
    return (boleta as any)?.evento || compra?.evento || null;
  }

  lugarVistaBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): any {
    return this.eventoVistaBoleta(boleta, compra)?.lugar || null;
  }

  private tipoBoletaVistaBoleta(boleta: BoletaComprada): TipoBoleta | null {
    const meta = boleta.tipo_boleta_meta;
    if (!meta?.nombre) return null;
    return {
      id: boleta.tipo_boleta_id,
      evento_id: this.eventoVistaBoleta(boleta)?.id || 0,
      nombre: meta.nombre,
      precio: boleta.precio_unitario || 0,
      cantidad_total: 0,
      cantidad_disponibles: 0,
      personas_por_unidad: meta.personas_por_unidad,
      es_palco: meta.es_palco,
    };
  }

  /** Fecha de creación más reciente entre boletas recibidas (subtítulo tipo “compra”). */
  fechaMasRecienteEntradasCedidas(): string | Date | null {
    let best = 0;
    let value: string | Date | null = null;
    for (const b of this.entradasCedidas) {
      if (!b.fecha_creacion) continue;
      const t = new Date(b.fecha_creacion).getTime();
      if (!Number.isFinite(t)) continue;
      if (t > best) {
        best = t;
        value = b.fecha_creacion;
      }
    }
    return value;
  }

  /**
   * Palco multipersonal: asignar cada acceso solo con el email de un usuario registrado (acepta en Mis Boletas).
   */
  puedeAsignarEntradaPorCorreoPalco(boleta: BoletaComprada, compra: Compra): boolean {
    if (compra.estado_pago !== 'completado') return false;
    if (!this.esTitularBoleta(boleta, compra)) return false;
    if (!this.requiereRegistroAsistentePalcoPosterior(boleta)) return false;
    if (this.tieneAsistenteRegistrado(boleta)) return false;
    if (this.tieneTrasladoSalienteActivo(boleta.id)) return false;
    return true;
  }

  private eventoIdDeBoleta(boleta: BoletaComprada, compra: Compra): number | null {
    const cid = compra.evento_id;
    if (cid != null && cid > 0) return cid;
    const eid = boleta.evento?.id;
    if (eid != null && eid > 0) return eid;
    return null;
  }

  otraBoletaMismoEventoTitularYaConAsistente(boleta: BoletaComprada, compra: Compra): boolean {
    const eid = this.eventoIdDeBoleta(boleta, compra);
    if (eid == null) return false;

    const esOtraConAsistente = (other: BoletaComprada, otherCompra: Compra): boolean => {
      if (other.id === boleta.id) return false;
      if (this.eventoIdDeBoleta(other, otherCompra) !== eid) return false;
      if (!this.esTitularBoleta(other, otherCompra)) return false;
      return this.tieneAsistenteRegistrado(other);
    };

    for (const row of this.comprasConBoletas) {
      for (const o of row.boletas) {
        if (esOtraConAsistente(o, row.compra)) return true;
      }
    }
    for (const o of this.entradasCedidas) {
      if (esOtraConAsistente(o, this.compraVistaParaBoletaCedida(o))) return true;
    }
    return false;
  }

  puedeMostrarBotonYoAsistoPalco(boleta: BoletaComprada, compra: Compra): boolean {
    // «Yo asisto» se permite en múltiples boletas para el mismo comprador
    // (por ejemplo, si va físicamente con más acompañantes).
    return this.puedeAsignarEntradaPorCorreoPalco(boleta, compra);
  }

  abrirModalYoAsisto(boleta: BoletaComprada, compra: Compra): void {
    if (!this.puedeMostrarBotonYoAsistoPalco(boleta, compra)) {
      return;
    }
    this.limpiarErrorAsignacion(boleta.id);
    this.yoAsistoBoleta = boleta;
    this.yoAsistoCompra = compra;
    this.showYoAsistoModal = true;
    this.cdr.detectChanges();
  }

  cerrarModalYoAsisto(): void {
    if (this.rellenarPerfilBoletaId != null) {
      return;
    }
    this.resetYoAsistoModal();
  }

  private resetYoAsistoModal(): void {
    this.showYoAsistoModal = false;
    this.yoAsistoBoleta = null;
    this.yoAsistoCompra = null;
    this.cdr.detectChanges();
  }

  get resumenYoAsistoContexto(): string {
    const boleta = this.yoAsistoBoleta;
    if (!boleta) {
      return '';
    }
    const tipoNombre = boleta.tipo_boleta_meta?.nombre || 'Entrada';
    if (boleta.numero_palco != null) {
      return `${tipoNombre} · Palco ${boleta.numero_palco}`;
    }
    return tipoNombre;
  }

  async confirmarYoAsisto(): Promise<void> {
    const boleta = this.yoAsistoBoleta;
    const compra = this.yoAsistoCompra;
    if (!boleta || !compra) {
      return;
    }
    if (!this.puedeMostrarBotonYoAsistoPalco(boleta, compra)) {
      this.cerrarModalYoAsisto();
      return;
    }
    this.limpiarErrorAsignacion(boleta.id);

    this.rellenarPerfilBoletaId = boleta.id;
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosBoletaService.rellenarAsistentePalcoDesdePerfil(boleta.id);
      if (!res.ok) {
        const msg = res.error || 'Error desconocido';
        this.asignacionError = { boletaId: boleta.id, mensaje: msg };
        this.cdr.detectChanges();
        return;
      }

      this.limpiarErrorAsignacion(boleta.id);
      this.resetYoAsistoModal();
      try {
        await this.recargarBoletasYTraslados();
      } catch (e) {
        console.error(e);
        await this.alertService.warning(
          'Aviso',
          'Se aplicaron los datos, pero no se pudo recargar la pantalla automáticamente.'
        );
        return;
      }
      void this.alertService.snackbar(
        'Listo. Se aplicaron los datos de tu perfil. El QR aparecerá el día del evento.'
      );
    } finally {
      this.rellenarPerfilBoletaId = null;
      this.ngZone.run(() => {
        this.cdr.detectChanges();
      });
    }
  }

  private limpiarErrorAsignacion(boletaId?: number): void {
    if (!boletaId || this.asignacionError?.boletaId === boletaId) {
      this.asignacionError = null;
    }
  }

  private async mostrarErrorAsignacion(
    boletaId: number,
    mensaje: string,
    titulo = 'No se pudo completar'
  ): Promise<void> {
    this.asignacionError = { boletaId, mensaje };
    this.cdr.detectChanges();

    if (this.esErrorAsignacionDocumento(mensaje)) {
      await this.alertService.error(titulo, undefined, {
        html: this.htmlErrorAsignacionConEnlacePerfil(mensaje),
      });
      return;
    }

    await this.alertService.error(titulo, mensaje);
  }

  esErrorAsignacionDocumento(mensaje: string): boolean {
    return /documento/i.test(mensaje) && /perfil/i.test(mensaje);
  }

  private htmlErrorAsignacionConEnlacePerfil(mensaje: string): string {
    const safe = mensaje
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return (
      `<p class="swal-error-text">${safe}</p>` +
      `<p class="swal-perfil-link-wrap"><a href="/perfil" class="swal-perfil-link">Ir a Mi perfil</a></p>`
    );
  }

  abrirModalTraslado(boleta: BoletaComprada, compra: Compra): void {
    if (!this.puedeAsignarEntradaPorCorreoPalco(boleta, compra)) {
      return;
    }
    this.limpiarErrorAsignacion(boleta.id);
    this.trasladoBoleta = boleta;
    this.trasladoCompra = compra;
    this.trasladoCoverItem = null;
    this.emailTrasladoDestino = '';
    this.showTrasladoModal = true;
    this.cdr.detectChanges();
  }

  cerrarModalTraslado(): void {
    this.showTrasladoModal = false;
    this.trasladoBoleta = null;
    this.trasladoCompra = null;
    this.trasladoCoverItem = null;
    this.emailTrasladoDestino = '';
    this.cdr.detectChanges();
  }

  async confirmarEnvioTraslado(): Promise<void> {
    if (this.trasladoCoverItem) {
      await this.confirmarEnvioTrasladoCover();
      return;
    }
    if (!this.trasladoBoleta) return;
    const email = this.emailTrasladoDestino.trim();
    if (!email) {
      this.alertService.warning('Cuenta destino', 'Indica el email de la cuenta Eventum del destinatario.');
      return;
    }

    this.enviandoTraslado = true;
    this.limpiarErrorAsignacion(this.trasladoBoleta.id);
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosBoletaService.iniciarTrasladoPalco(this.trasladoBoleta.id, email);
      if (!res.ok) {
        const msg = res.error || 'Error desconocido';
        if (/traslado pendiente/i.test(msg)) {
          try {
            await this.refrescarTrasladosMaps();
            this.reconstruirEventosConBoletas();
          } catch (e) {
            console.error('Error refrescando traslado pendiente:', e);
          }
        }
        await this.mostrarErrorAsignacion(this.trasladoBoleta.id, msg, 'No se pudo enviar');
        return;
      }
      this.cerrarModalTraslado();
      try {
        await this.recargarBoletasYTraslados();
      } catch (e) {
        console.error(e);
        await this.alertService.warning(
          'Aviso',
          'Se envió la solicitud, pero no se pudo recargar la pantalla automáticamente.'
        );
        return;
      }
      void this.alertService.snackbar(
        'Traslado enviado. Aparece en trámite en tu entrada hasta que acepten o canceles.'
      );
    } finally {
      this.enviandoTraslado = false;
      this.ngZone.run(() => {
        this.cdr.detectChanges();
      });
    }
  }

  async confirmarEnvioTrasladoCover(): Promise<void> {
    if (!this.trasladoCoverItem) return;
    const email = this.emailTrasladoDestino.trim();
    if (!email) {
      this.alertService.warning('Cuenta destino', 'Indica el email de la cuenta Eventum de quien recibirá el cover.');
      return;
    }
    const item = this.trasladoCoverItem;

    this.enviandoTraslado = true;
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosBoletaService.iniciarTrasladoCover(item.boleta.id, email);
      if (!res.ok) {
        await this.alertService.error('No se pudo enviar', res.error || 'Error desconocido');
        return;
      }
      this.cerrarModalTraslado();
      await this.recargarBoletasYTraslados();
      void this.alertService.snackbar('Transferencia iniciada. La otra persona debe aceptar en Mis Compras → Covers.');
    } finally {
      this.enviandoTraslado = false;
      this.ngZone.run(() => this.cdr.detectChanges());
    }
  }

  getEstadoTrasladoLabel(estado: string | undefined): string {
    const m: Record<string, string> = {
      enviado: 'Enviado',
      recibido: 'Recibido',
      aceptado: 'Aceptado',
      rechazado: 'Rechazado',
      cancelado: 'Cancelado'
    };
    return m[estado || ''] || estado || '';
  }

  rolUsuarioEnTraslado(t: TrasladoBoleta): 'origen' | 'destino' {
    const uid = this.authService.getUsuarioId()!;
    return t.usuario_origen_id === uid ? 'origen' : 'destino';
  }

  nombreTipoBoletaTraslado(t: TrasladoBoleta): string {
    if (t.tipo_boleta_nombre?.trim()) {
      return t.tipo_boleta_nombre.trim();
    }
    const tb = Array.isArray(t.boleta?.tipos_boleta) ? t.boleta?.tipos_boleta[0] : t.boleta?.tipos_boleta;
    return tb?.nombre || 'Entrada';
  }

  nombreTipoTraslado(t: TrasladoBoleta): string {
    return this.esTrasladoCover(t) ? this.nombreTipoCoverTraslado(t) : this.nombreTipoBoletaTraslado(t);
  }

  referenciaTraslado(t: TrasladoBoleta): string {
    const coverId = Number(t.boleta_cover_id ?? 0);
    if (coverId > 0) {
      return `Cover #${coverId}`;
    }
    const boletaId = Number(t.boleta_id ?? 0);
    if (boletaId > 0) {
      return `Boleta #${boletaId}`;
    }
    return 'Sin referencia';
  }

  emailOrigenTraslado(t: TrasladoBoleta): string {
    const directo =
      t.usuario_origen?.email?.trim() ||
      t.usuario_origen_email?.trim();
    if (directo) {
      return directo;
    }
    const uid = this.authService.getUsuarioId();
    if (uid && Number(t.usuario_origen_id) === uid) {
      return this.authService.getUsuario()?.email?.trim() || '—';
    }
    return '—';
  }

  emailDestinoTraslado(t: TrasladoBoleta): string {
    return (
      t.email_destino?.trim() ||
      t.usuario_destino?.email?.trim() ||
      t.usuario_destino_email?.trim() ||
      '—'
    );
  }

  tituloEventoTraslado(t: TrasladoBoleta): string {
    if (t.boleta_cover_id) {
      if (t.lugar_nombre?.trim()) {
        return t.lugar_nombre.trim();
      }
      if (t.coverDetail?.lugar_nombre?.trim()) {
        return t.coverDetail.lugar_nombre.trim();
      }
      const sesion = Array.isArray(t.boleta_cover?.sesiones_cover)
        ? t.boleta_cover?.sesiones_cover[0]
        : t.boleta_cover?.sesiones_cover;
      const lugar = Array.isArray(sesion?.lugares) ? sesion?.lugares[0] : sesion?.lugares;
      if (lugar?.nombre?.trim()) {
        return lugar.nombre.trim();
      }
      if (t.lugar_id) {
        const club = this.lugaresConCovers.find((g) => g.lugarId === t.lugar_id);
        if (club?.lugarNombre) {
          return club.lugarNombre;
        }
      }
      return 'Cover';
    }

    if (t.evento_titulo?.trim()) {
      return t.evento_titulo.trim();
    }
    const tb = Array.isArray(t.boleta?.tipos_boleta) ? t.boleta?.tipos_boleta[0] : t.boleta?.tipos_boleta;
    const ev = tb?.eventos;
    if (Array.isArray(ev)) {
      if (ev[0]?.titulo?.trim()) {
        return ev[0].titulo.trim();
      }
    } else if (ev?.titulo?.trim()) {
      return ev.titulo.trim();
    }
    if (t.evento_id) {
      const grupo = this.eventosConBoletas.find((g) => g.key === String(t.evento_id));
      if (grupo?.titulo?.trim()) {
        return grupo.titulo.trim();
      }
    }
    return 'Evento';
  }

  nombreTipoCoverTraslado(t: TrasladoBoleta): string {
    if (t.tipo_cover_nombre?.trim()) {
      return t.tipo_cover_nombre.trim();
    }
    const tc = Array.isArray(t.boleta_cover?.tipos_cover)
      ? t.boleta_cover?.tipos_cover[0]
      : t.boleta_cover?.tipos_cover;
    return tc?.nombre || t.coverDetail?.tipo_cover_nombre || 'Cover general';
  }

  esTrasladoCover(t: TrasladoBoleta): boolean {
    return !!t.boleta_cover_id;
  }

  async marcarRecibidoTraslado(t: TrasladoBoleta): Promise<void> {
    const res = this.esTrasladoCover(t)
      ? await this.trasladosBoletaService.marcarRecibidoCover(t.id)
      : await this.trasladosBoletaService.marcarRecibido(t.id);
    if (!res.ok) {
      await this.alertService.error('Error', res.error || '');
      return;
    }
    await this.recargarBoletasYTraslados();
    void this.alertService.snackbar('Marcado como recibido. Puedes aceptar o rechazar.');
  }

  async aceptarTraslado(t: TrasladoBoleta): Promise<void> {
    const esCover = this.esTrasladoCover(t);
    const res = esCover
      ? await this.trasladosBoletaService.aceptarCover(t.id)
      : await this.trasladosBoletaService.aceptar(t.id);
    if (!res.ok) {
      await this.alertService.error('Error', res.error || '');
      return;
    }
    await this.recargarBoletasYTraslados();
    if (esCover) {
      this.tabMisComprasPrincipal = 'covers';
      this.persistState(Date.now());
    }
    void this.alertService.snackbar(
      esCover
        ? 'Cover aceptado. Ya está en Mis Compras → Covers. El QR se habilita el día de la noche.'
        : 'Entrada aceptada. Ya está en Mis Compras. El QR se habilita el día del evento.'
    );
    this.cdr.detectChanges();
  }

  async rechazarTraslado(t: TrasladoBoleta): Promise<void> {
    const esCover = this.esTrasladoCover(t);
    const res = esCover
      ? await this.trasladosBoletaService.rechazarCover(t.id)
      : await this.trasladosBoletaService.rechazar(t.id);
    if (!res.ok) {
      await this.alertService.error('Error', res.error || '');
      return;
    }
    await this.recargarBoletasYTraslados();
    void this.alertService.snackbar(
      esCover
        ? 'Transferencia rechazada. El remitente recupera el cover.'
        : 'Entrada rechazada. El remitente recupera el uso.'
    );
  }

  async confirmarCancelarTraslado(): Promise<void> {
    const t = this.trasladoACancelar;
    if (!t || this.cancelandoTraslado) return;

    this.cancelandoTraslado = true;
    this.cdr.detectChanges();
    try {
      const res = this.esTrasladoCover(t)
        ? await this.trasladosBoletaService.cancelarCover(t.id)
        : await this.trasladosBoletaService.cancelar(t.id);
      if (!res.ok) {
        await this.alertService.error('Error', res.error || '');
        return;
      }
      this.cerrarModalCancelarTraslado();
      await this.recargarBoletasYTraslados();
      void this.alertService.snackbar(
        this.esTrasladoCover(t) ? 'Transferencia cancelada.' : 'Envío cancelado.'
      );
    } finally {
      this.cancelandoTraslado = false;
      this.ngZone.run(() => this.cdr.detectChanges());
    }
  }

  private async recargarBoletasYTraslados(): Promise<void> {
    this.asignarPanelAbiertoBoletaId = null;
    await this.loadBoletasPorCompra({ background: true });
    if (coversEventumEnabled) {
      await this.loadCoversPorTitular({ background: true });
    }
    await this.refrescarTrasladosMaps();
    this.reconstruirEventosConBoletas();
    if (coversEventumEnabled) {
      this.reconstruirLugaresConCovers();
    }
    this.syncTabEventoDetalle();
    this.syncTabMisComprasPrincipal();
    this.persistState(Date.now());
    this.ngZone.run(() => {
      this.cdr.detectChanges();
    });
  }

  /** Compra mínima para lógica de QR en entradas recibidas por traslado. */
  compraVistaParaBoletaCedida(b: BoletaComprada): Compra {
    const c = b.compra;
    return {
      id: b.compra_id,
      cliente_id: c?.cliente_id ?? 0,
      evento_id: (c as { evento_id?: number })?.evento_id ?? b.evento?.id ?? 0,
      numero_transaccion: c?.id ? `#${c.id}` : '-',
      total: 0,
      estado_pago: (c?.estado_pago as TipoEstadoPago | undefined) ?? TipoEstadoPago.COMPLETADO,
      estado_compra: c?.estado_compra
    } as Compra;
  }

  tieneContenidoMisBoletas(): boolean {
    return (
      this.eventosConBoletas.length > 0 ||
      this.entradasCedidas.length > 0 ||
      this.trasladosPendientesRecibir.length > 0 ||
      (coversEventumEnabled && this.lugaresConCovers.length > 0) ||
      this.coverCedidas.length > 0 ||
      this.trasladosPendientesRecibirCover.length > 0
    );
  }

  ngOnDestroy() {
    this.persistState(Date.now());
    this.endSilentRefreshCycle();
    this.detenerRealtimeNotificaciones();
    if (this.unsubscribeAuthState) {
      this.unsubscribeAuthState();
      this.unsubscribeAuthState = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private tieneItemsPendientesRedencion(): boolean {
    for (const item of this.comprasConBoletas) {
      for (const boleta of item.boletas) {
        if (this.esBoletaCancelada(boleta)) continue;
        if (this.puedeAbrirVistaBoleta(boleta, item.compra) && !this.esBoletaUsada(boleta)) {
          return true;
        }
      }
    }

    for (const boleta of this.entradasCedidas) {
      if (this.esBoletaCancelada(boleta)) continue;
      const compra = this.compraVistaParaBoletaCedida(boleta);
      if (this.puedeAbrirVistaBoleta(boleta, compra) && !this.esBoletaUsada(boleta)) {
        return true;
      }
    }

    for (const compra of this.comprasProductos) {
      if ((compra.estado_pago || '').toLowerCase() !== TipoEstadoPago.COMPLETADO) continue;
      for (const item of compra.compras_productos_items || []) {
        if (this.esProductoComprado(item)) {
          return true;
        }
      }
    }

    if (coversEventumEnabled) {
      for (const item of this.boletasCover) {
        if (!this.puedeAbrirQrCover(item)) continue;
        if (this.esBoletaCoverUsada(item.boleta)) continue;
        const acceso = String(item.boleta.estado_acceso || '').toLowerCase();
        if (acceso === 'pendiente' || acceso === 'fuera' || acceso === 'dentro') {
          return true;
        }
      }
    }

    return false;
  }

  private patchBoletaEnEstadoLocal(
    boletaId: number,
    patch: Pick<BoletaComprada, 'estado' | 'fecha_uso'>
  ): boolean {
    let found = false;

    for (const item of this.comprasConBoletas) {
      for (const boleta of item.boletas) {
        if (boleta.id === boletaId) {
          Object.assign(boleta, patch);
          found = true;
        }
      }
    }

    for (const boleta of this.entradasCedidas) {
      if (boleta.id === boletaId) {
        Object.assign(boleta, patch);
        found = true;
      }
    }

    if (this.boletaSeleccionada?.id === boletaId) {
      Object.assign(this.boletaSeleccionada, patch);
    }

    return found;
  }

  private patchCompraProductoRedimidaEnEstadoLocal(
    compraProductoId: number,
    estado: string,
    fechaRedencion?: Date | string
  ): boolean {
    const compra = this.comprasProductos.find((c) => c.id === compraProductoId);
    if (!compra) {
      return false;
    }

    for (const item of compra.compras_productos_items || []) {
      item.estado = estado;
      if (fechaRedencion) {
        item.fecha_redencion = fechaRedencion;
      }
    }

    if (
      this.productoFilaSeleccionada?.compra.id === compraProductoId &&
      this.productoFilaSeleccionada.item
    ) {
      this.productoFilaSeleccionada.item.estado = estado;
      if (fechaRedencion) {
        this.productoFilaSeleccionada.item.fecha_redencion = fechaRedencion;
      }
    }

    return true;
  }

  private patchCoverEnEstadoLocal(
    boletaCoverId: number,
    patch: Pick<BoletaCoverCliente, 'estado_acceso'>
  ): boolean {
    let found = false;

    for (const item of this.boletasCover) {
      if (item.boleta.id === boletaCoverId) {
        Object.assign(item.boleta, patch);
        found = true;
      }
    }

    if (this.coverBoletaSeleccionada?.boleta.id === boletaCoverId) {
      Object.assign(this.coverBoletaSeleccionada.boleta, patch);
    }

    return found;
  }

  private coverQrAbiertoCoincideConNotificacion(
    metadata: Record<string, unknown> | null | undefined
  ): boolean {
    if (!this.showCoverQrModal || !this.coverBoletaSeleccionada) {
      return false;
    }
    const meta = metadata ?? {};
    const idNotif = Number(meta['boleta_cover_id'] ?? 0);
    const qrNotif = String(meta['codigo_qr'] || '').trim();
    const seleccion = this.coverBoletaSeleccionada.boleta;
    if (Number.isFinite(idNotif) && idNotif > 0 && seleccion.id === idNotif) {
      return true;
    }
    const qrSeleccion = String(seleccion.codigo_qr || '').trim();
    return !!qrNotif && !!qrSeleccion && qrNotif === qrSeleccion;
  }

  private aplicarCoverAccesoEnCaliente(metadata: Record<string, unknown>): boolean {
    const boletaCoverId = Number(metadata['boleta_cover_id'] ?? 0);
    if (!Number.isFinite(boletaCoverId) || boletaCoverId <= 0) {
      return false;
    }

    const estadoRaw = String(metadata['estado_acceso'] || '').toLowerCase();
    if (!estadoRaw) {
      return false;
    }

    const patch: Pick<BoletaCoverCliente, 'estado_acceso'> = {
      estado_acceso: estadoRaw as BoletaCoverCliente['estado_acceso'],
    };

    const patched = this.patchCoverEnEstadoLocal(boletaCoverId, patch);
    if (coversEventumEnabled) {
      this.reconstruirLugaresConCovers();
      this.syncAccesosPuertaNav();
    }
    return patched;
  }

  private async aplicarCoverAccesoDesdeNotificacion(
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (this.aplicarCoverAccesoEnCaliente(metadata)) {
      return;
    }

    if (!coversEventumEnabled) {
      return;
    }

    try {
      await this.loadCoversPorTitular({ background: true });
    } catch (err) {
      console.error('[MisCompras] Error refrescando cover desde notificacion:', err);
    }
  }

  private async aplicarEntradaValidadaDesdeNotificacion(
    metadata: Record<string, unknown>
  ): Promise<void> {
    const boletaId = Number(metadata['boleta_id'] ?? 0);
    if (!Number.isFinite(boletaId) || boletaId <= 0) {
      return;
    }

    const patch: Pick<BoletaComprada, 'estado' | 'fecha_uso'> = {
      estado: String(metadata['estado'] || 'usada').toLowerCase() as BoletaComprada['estado'],
      fecha_uso: metadata['fecha_uso'] as Date | string | undefined,
    };

    if (this.patchBoletaEnEstadoLocal(boletaId, patch)) {
      return;
    }

    try {
      const [fresh] = await this.boletasService.getBoletasByIds([boletaId]);
      if (!fresh) {
        return;
      }

      Object.assign(fresh, patch);
      const compraId = Number(metadata['compra_id'] ?? fresh.compra_id ?? 0);
      const compra = this.compras.find((c) => c.id === compraId);

      if (compra) {
        let entry = this.comprasConBoletas.find((x) => x.compra.id === compraId);
        if (!entry) {
          entry = { compra, boletas: [] };
          this.comprasConBoletas.push(entry);
        }
        const index = entry.boletas.findIndex((b) => b.id === fresh.id);
        if (index >= 0) {
          entry.boletas[index] = { ...entry.boletas[index], ...patch };
        } else {
          entry.boletas.push(fresh);
        }
        return;
      }

      const uid = this.authService.getUsuarioId();
      if (uid && fresh.titular_cliente_id === uid) {
        const cedidaIndex = this.entradasCedidas.findIndex((b) => b.id === fresh.id);
        if (cedidaIndex >= 0) {
          this.entradasCedidas[cedidaIndex] = { ...this.entradasCedidas[cedidaIndex], ...patch };
        } else {
          this.entradasCedidas.push(fresh);
        }
      }
    } catch (err) {
      console.error('[MisCompras] Error refrescando boleta desde notificacion:', err);
    }
  }

  private async aplicarProductosRedimidosDesdeNotificacion(
    metadata: Record<string, unknown>
  ): Promise<void> {
    const compraProductoId = Number(metadata['compra_producto_id'] ?? 0);
    if (!Number.isFinite(compraProductoId) || compraProductoId <= 0) {
      return;
    }

    const estado = String(metadata['estado'] || TipoEstadoItemProducto.ENTREGADO).toLowerCase();
    const fechaRedencion = metadata['fecha_redencion'] as Date | string | undefined;

    if (this.patchCompraProductoRedimidaEnEstadoLocal(compraProductoId, estado, fechaRedencion)) {
      return;
    }

    try {
      const fresh = await this.comprasProductoService.getCompraById(compraProductoId);
      if ((fresh.estado_pago || '').toLowerCase() !== TipoEstadoPago.COMPLETADO) {
        return;
      }

      for (const item of fresh.compras_productos_items || []) {
        item.estado = estado;
        if (fechaRedencion) {
          item.fecha_redencion = fechaRedencion;
        }
      }

      const index = this.comprasProductos.findIndex((c) => c.id === compraProductoId);
      if (index >= 0) {
        this.comprasProductos[index] = fresh;
      } else {
        this.comprasProductos.push(fresh);
      }
    } catch (err) {
      console.error('[MisCompras] Error refrescando compra de productos desde notificacion:', err);
    }
  }

  private reconstruirVistaTrasNotificacion(): void {
    this.reconstruirEventosConBoletas();
    this.fusionarProductosEnEventos();
    if (coversEventumEnabled) {
      this.reconstruirLugaresConCovers();
    }
    this.syncTabEventoDetalle();
    void this.actualizarPromoProductos();
    this.persistState(Date.now());
    this.sincronizarRealtimeNotificaciones();
  }

  private async refrescarDesdeNotificacion(
    tipo: string,
    metadata: Record<string, unknown> | null | undefined
  ): Promise<void> {
    const meta = metadata ?? {};

    if (tipo === 'entrada_validada') {
      await this.aplicarEntradaValidadaDesdeNotificacion(meta);
      this.reconstruirVistaTrasNotificacion();
      return;
    }

    if (tipo === 'productos_redimidos') {
      await this.aplicarProductosRedimidosDesdeNotificacion(meta);
      this.reconstruirVistaTrasNotificacion();
      return;
    }

    if (tipo === 'cover_entrada_registrada' || tipo === 'cover_salida_registrada') {
      await this.aplicarCoverAccesoDesdeNotificacion(meta);
      this.reconstruirVistaTrasNotificacion();
      return;
    }

    this.loadCompras({ background: true, resetPage: false });
  }

  private sincronizarRealtimeNotificaciones(): void {
    const usuarioId = this.authService.getUsuario()?.id || null;
    if (!usuarioId) {
      this.detenerRealtimeNotificaciones();
      return;
    }

    if (!this.tieneItemsPendientesRedencion()) {
      if (this.notificacionesChannel) {
        this.detenerRealtimeNotificaciones();
      }
      return;
    }

    if (!this.notificacionesChannel || this.realtimeUsuarioIdActual !== usuarioId) {
      this.iniciarRealtimeNotificaciones();
    }
  }

  private iniciarRealtimeNotificaciones(): void {
    const usuarioId = this.authService.getUsuario()?.id || null;
    if (!usuarioId || !this.tieneItemsPendientesRedencion()) return;

    this.detenerRealtimeNotificaciones();
    this.realtimeUsuarioIdActual = usuarioId;

    this.notificacionesChannel = this.supabaseService
      .getClient()
      .channel(`mis-compras-notificaciones-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones_usuario',
        },
        (payload) => {
          this.ngZone.run(() => {
            const row = payload.new as {
              usuario_id?: number | string | null;
              titulo?: string | null;
              mensaje?: string | null;
              tipo?: string | null;
              metadata?: Record<string, unknown> | null;
            };
            const rowUsuarioId = Number(row?.usuario_id ?? 0);
            if (!Number.isFinite(rowUsuarioId) || rowUsuarioId !== usuarioId) {
              return;
            }
            const titulo = String(row?.titulo || 'Actualizacion');
            const mensaje = String(row?.mensaje || 'Tu estado de compra cambio.');
            const tipo = String(row?.tipo || '').toLowerCase();
            const esEntradaValidada = tipo === 'entrada_validada';
            const esProductoRedimido = tipo === 'productos_redimidos';
            const esCoverEntrada = tipo === 'cover_entrada_registrada';
            const esCoverSalida = tipo === 'cover_salida_registrada';
            const esCoverAcceso = esCoverEntrada || esCoverSalida;
            const metadataBoletaId = Number(row?.metadata?.['boleta_id'] ?? 0);
            const metadataCompraProductoId = Number(row?.metadata?.['compra_producto_id'] ?? 0);
            const qrBoletaCoincide =
              esEntradaValidada &&
              this.showBoletaModal &&
              Number.isFinite(metadataBoletaId) &&
              metadataBoletaId > 0 &&
              this.boletaSeleccionada?.id === metadataBoletaId;
            const qrProductoCoincide =
              esProductoRedimido &&
              this.showProductoQrModal &&
              Number.isFinite(metadataCompraProductoId) &&
              metadataCompraProductoId > 0 &&
              this.productoFilaSeleccionada?.compra.id === metadataCompraProductoId;
            const qrCoverAbiertoCoincide =
              this.showCoverQrModal && this.coverQrAbiertoCoincideConNotificacion(row.metadata);

            if (esCoverAcceso && row.metadata) {
              this.aplicarCoverAccesoEnCaliente(row.metadata);
            }

            const qrCoverCoincide = esCoverAcceso && qrCoverAbiertoCoincide;
            const teniaQrAbierto = qrBoletaCoincide || qrProductoCoincide || qrCoverCoincide;

            const boletaActual = this.boletaSeleccionada;
            const compraActual = this.compraSeleccionada;
            const siguienteBoleta =
              qrBoletaCoincide && boletaActual
                ? this.buscarSiguienteBoleta(boletaActual, compraActual)
                : null;

            const compraProductoRedimida =
              esProductoRedimido && this.productoFilaSeleccionada?.compra
                ? this.productoFilaSeleccionada.compra
                : null;

            if (qrBoletaCoincide) {
              this.cerrarBoletaModal();
            }
            if (qrProductoCoincide) {
              this.cerrarProductoQrModal();
            }
            if (qrCoverAbiertoCoincide) {
              this.cerrarCoverQrModal();
            }
            if (teniaQrAbierto) {
              if (esEntradaValidada) {
                this.abrirMensajeIngresoDesdeNotificacion('entrada', row.metadata, siguienteBoleta);
              } else if (esProductoRedimido) {
                this.abrirMensajeIngresoDesdeNotificacion(
                  'producto',
                  row.metadata,
                  null,
                  compraProductoRedimida
                );
              } else if (esCoverEntrada) {
                this.abrirMensajeIngresoDesdeNotificacion('cover', row.metadata);
              } else if (esCoverSalida) {
                this.abrirMensajeIngresoDesdeNotificacion('cover-salida', row.metadata);
              }
            }

            const omitirToast =
              esEntradaValidada || esProductoRedimido || esCoverEntrada || esCoverSalida;
            if (!omitirToast) {
              void this.alertService.snackbar(`${titulo}. ${mensaje}`);
            }

            void this.refrescarDesdeNotificacion(tipo, row.metadata).finally(() => {
              this.cdr.detectChanges();
            });
          });
        }
      )
      .subscribe();
  }

  private suscribirReinicioRealtimePorAuth(): void {
    const callback: AuthStateCallback = (_user, usuario) => {
      const usuarioId = usuario?.id || null;

      if (!usuarioId) {
        this.detenerRealtimeNotificaciones();
        this.realtimeUsuarioIdActual = null;
        return;
      }

      this.sincronizarRealtimeNotificaciones();
    };
    this.unsubscribeAuthState = this.authService.onAuthStateChange(callback);
  }

  private detenerRealtimeNotificaciones(): void {
    if (this.notificacionesChannel) {
      void this.supabaseService.getClient().removeChannel(this.notificacionesChannel);
      this.notificacionesChannel = null;
    }
    this.realtimeUsuarioIdActual = null;
  }

  private startSilentRefreshCycle(): void {
    this.refreshStartedAt = Date.now();
    console.info('[MisCompras] Refresco silencioso iniciado', {
      vistaActividad: this.vistaActividad,
      page: this.page
    });

    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.cdr.detectChanges();
    }, this.refreshIndicatorDelayMs);
  }

  private endSilentRefreshCycle(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }

    if (this.refreshStartedAt) {
      console.info('[MisCompras] Refresco silencioso finalizado', {
        durationMs: Date.now() - this.refreshStartedAt,
        compras: this.compras.length,
        eventos: this.eventosConBoletas.length,
        covers: this.boletasCover.length,
        trasladosPendientes: this.trasladosPendientesRecibir.length,
        trasladosPendientesCover: this.trasladosPendientesRecibirCover.length,
      });
      this.refreshStartedAt = null;
    }

    this.isRefreshing = false;
  }

  private applyCachedState(state: MisComprasState): void {
    this.compras = (state.compras || []).filter(
      (compra: Compra) => compra.estado_pago === TipoEstadoPago.COMPLETADO
    );
    this.comprasProductos = (state.comprasProductos || []).filter(
      (compra: CompraProducto) => (compra.estado_pago || '').toLowerCase() === TipoEstadoPago.COMPLETADO
    );
    this.comprasConBoletas = (state.comprasConBoletas || []).filter(
      (item: { compra: Compra }) => item.compra?.estado_pago === TipoEstadoPago.COMPLETADO
    );
    this.eventosConBoletas = state.eventosConBoletas || [];
    this.eventosDisponibles = state.eventosDisponibles || [];
    this.trasladosHistorial = state.trasladosHistorial || [];
    this.trasladosPendientesRecibir = state.trasladosPendientesRecibir || [];
    this.entradasCedidas = (state.entradasCedidas || []).filter(
      (b: BoletaComprada) => b.compra?.estado_pago === TipoEstadoPago.COMPLETADO
    );
    this.comprasCover = (state.comprasCover || []).filter(
      (compra) => (compra.estado_pago || '').toLowerCase() === TipoEstadoPago.COMPLETADO
    );
    this.boletasCover = state.boletasCover || [];
    this.coverCedidas = state.coverCedidas || [];
    this.trasladosPendientesRecibirCover = state.trasladosPendientesRecibirCover || [];
    const rawTab = state.tabMisComprasPrincipal || 'eventos';
    this.tabMisComprasPrincipal =
      rawTab === 'covers' || rawTab === 'acceso' ? 'covers' : 'eventos';
    this.aplicarTrasladosDesdeHistorial();
    if (this.comprasCover.length > 0 || this.boletasCover.length > 0) {
      this.reconstruirLugaresConCovers();
    } else {
      this.lugaresConCovers = [];
    }
    this.estadoPagoFiltro = state.estadoPagoFiltro ?? null;
    this.estadoCompraFiltro = state.estadoCompraFiltro ?? null;
    this.eventoFiltro = state.eventoFiltro ?? null;
    this.fechaDesde = state.fechaDesde ?? '';
    this.fechaHasta = state.fechaHasta ?? '';
    this.searchTerm = state.searchTerm ?? '';
    this.page = state.page || 1;
    this.total = state.total || 0;
    this.totalPages = state.totalPages || 0;
    this.tabBoletasDetalle = state.tabBoletasDetalle || 'sin-usar';
    this.eventoExpandidoKey = state.eventoExpandidoKey ?? null;
    this.loadingBoletasDetalle = this.eventosConBoletas.length > 0;
    this.loadingCovers = coversEventumEnabled && this.boletasCover.length === 0;
    this.guiaEntradasAbierta = this.eventosConBoletas.length === 0;
    this.promoProductos = state.promoProductos ?? null;
    this.loadingPromoProductos = false;
    this.syncTabMisComprasPrincipal();
    this.syncTrasladosPendientesNavBadge();
  }

  private persistState(lastUpdated: number): void {
    const userId = this.authService.getUsuarioId();
    if (!userId) return;
    this.misComprasStateService.saveState(userId, {
      compras: this.compras,
      comprasProductos: this.comprasProductos,
      comprasConBoletas: this.comprasConBoletas,
      eventosConBoletas: this.eventosConBoletas,
      eventosDisponibles: this.eventosDisponibles,
      trasladosHistorial: this.trasladosHistorial,
      trasladosPendientesRecibir: this.trasladosPendientesRecibir,
      entradasCedidas: this.entradasCedidas,
      estadoPagoFiltro: this.estadoPagoFiltro,
      estadoCompraFiltro: this.estadoCompraFiltro,
      eventoFiltro: this.eventoFiltro,
      fechaDesde: this.fechaDesde,
      fechaHasta: this.fechaHasta,
      searchTerm: this.searchTerm,
      page: this.page,
      total: this.total,
      totalPages: this.totalPages,
      tabBoletasDetalle: this.tabBoletasDetalle,
      eventoExpandidoKey: this.eventoExpandidoKey,
      eventoDetalleKey: this.eventoDetalleKey,
      promoProductos: this.promoProductos,
      comprasCover: this.comprasCover,
      boletasCover: this.boletasCover,
      coverCedidas: this.coverCedidas,
      trasladosPendientesRecibirCover: this.trasladosPendientesRecibirCover,
      tabMisComprasPrincipal: this.tabMisComprasPrincipal,
      lastUpdated
    });
  }

  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getEstadoPagoLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'completado': 'Completado',
      'fallido': 'Fallido',
      'reembolsado': 'Reembolsado',
      'cancelado': 'Cancelado'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoCompraLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'confirmada': 'Confirmada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoBoletaLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Sin usar',
      'usada': 'Usada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoClass(estado?: string): string {
    if (estado === 'completado' || estado === 'confirmada') return 'badge-success';
    if (estado === 'pendiente') return 'badge-warning';
    if (estado === 'cancelada' || estado === 'fallido') return 'badge-danger';
    return 'badge-info';
  }

  getEstadoTrasladoClass(estado?: string): string {
    const e = estado || '';
    if (e === 'aceptado') return 'badge-success';
    if (e === 'rechazado' || e === 'cancelado') return 'badge-danger';
    if (e === 'recibido' || e === 'enviado') return 'badge-warning';
    return 'badge-info';
  }

  Math = Math;

  /**
   * En esta versión, toda boleta se asigna después del pago en Mis Boletas.
   */
  requiereRegistroAsistentePalcoPosterior(b: BoletaComprada): boolean {
    return true;
  }

  tieneAsistenteRegistrado(b: BoletaComprada): boolean {
    return !!(b.nombre_asistente?.trim() && b.documento_asistente?.trim());
  }

  private fechaInicioEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): Date | null {
    const raw = this.eventoVistaBoleta(boleta, compra)?.fecha_inicio;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  private fechaFinEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): Date | null {
    const raw = this.fechaFinEvento(this.eventoVistaBoleta(boleta, compra));
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  /** Día local YYYYMMDD para comparar rangos de calendario sin depender de la hora. */
  private diaCalendarioLocal(d: Date): number {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  /**
   * True si hoy (fecha local) está entre fecha_inicio y fecha_fin del evento (inclusive).
   * Sin fecha_fin se usa solo el día de fecha_inicio (evento de un día).
   */
  esDiaEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): boolean {
    const inicio = this.fechaInicioEventoBoleta(boleta, compra);
    if (!inicio) return true;
    const fin = this.fechaFinEventoBoleta(boleta, compra);
    const hoy = new Date();
    const h = this.diaCalendarioLocal(hoy);
    const a = this.diaCalendarioLocal(inicio);
    const b = fin ? this.diaCalendarioLocal(fin) : a;
    const desde = Math.min(a, b);
    const hasta = Math.max(a, b);
    return h >= desde && h <= hasta;
  }

  fechaModalBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const fechaEvento = this.fechaInicioEventoBoleta(boleta, compra);
    if (!fechaEvento) return '';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(fechaEvento);
  }

  horaModalBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const fechaEvento = this.fechaInicioEventoBoleta(boleta, compra);
    if (!fechaEvento) return '';
    return new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(fechaEvento);
  }

  mensajeHabilitacionQrBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const inicio = this.fechaInicioEventoBoleta(boleta, compra);
    if (!inicio) {
      return 'El código QR solo será visible el día del evento. Hoy aún no está disponible en la app.';
    }
    return `El código QR se habilita el ${this.formatFechaHabilitacionAmigable(inicio)}.`;
  }

  esBoletaUsada(boleta: BoletaComprada | null | undefined): boolean {
    return (boleta?.estado || '').toLowerCase() === 'usada';
  }

  esBoletaCancelada(boleta: BoletaComprada | null | undefined): boolean {
    return (boleta?.estado || '').toLowerCase() === 'cancelada';
  }

  puedeAbrirVistaBoleta(boleta: BoletaComprada, compra: Compra): boolean {
    if (compra.estado_pago !== 'completado') return false;
    if (!this.esTitularBoleta(boleta, compra)) return false;
    if (this.tieneTrasladoSalienteActivo(boleta.id)) return false;
    if (this.requiereRegistroAsistentePalcoPosterior(boleta) && !this.tieneAsistenteRegistrado(boleta)) {
      return false;
    }
    return true;
  }

  puedeMostrarQrBoleta(boleta: BoletaComprada, compra: Compra): boolean {
    return this.puedeAbrirVistaBoleta(boleta, compra) && !this.esBoletaUsada(boleta) && this.esDiaEventoBoleta(boleta, compra);
  }

  /**
   * Muestra la vista previa de la boleta con QR
   */
  async verBoleta(boleta: BoletaComprada, compra: Compra) {
    // Solo permitir ver boleta si el pago está completado
    if (compra.estado_pago !== 'completado') {
      this.alertService.warning('Pago pendiente', 'El código QR estará disponible una vez que el pago sea completado');
      return;
    }

    if (!this.esTitularBoleta(boleta, compra)) {
      this.alertService.warning('No disponible', 'Esta entrada no está asignada a tu usuario.');
      return;
    }

    if (this.tieneTrasladoSalienteActivo(boleta.id)) {
      this.alertService.warning(
        'Traslado enviado',
        'No puedes ver el QR mientras el destinatario no acepte o rechace. Puedes cancelar el envío si sigue en estado enviado.'
      );
      return;
    }

    if (!this.puedeAbrirVistaBoleta(boleta, compra)) {
      this.alertService.warning(
        'Asigna la entrada',
        'Asigna por correo a quien usará el acceso (debe aceptar en Mis Boletas) o usa «Yo asisto» si tú la usarás con los datos de tu perfil.'
      );
      return;
    }

    this.boletaSeleccionada = boleta;
    this.compraSeleccionada = compra;
    this.eventoSeleccionado = this.eventoVistaBoleta(boleta, compra);
    this.tipoBoletaSeleccionado = this.tipoBoletaVistaBoleta(boleta);
    const debeGenerarQr = compra.estado_pago === 'completado' && !this.esBoletaUsada(boleta) && this.esDiaEventoBoleta(boleta, compra);
    this.loadingQR = debeGenerarQr;
    this.showBoletaModal = true;
    this.cdr.detectChanges();

    // Generar QR solo entre fecha_inicio y fecha_fin del evento (días locales) y mientras la boleta no haya sido usada.
    if (debeGenerarQr) {
      try {
        this.qrCodeUrl = await QRCode.toDataURL(boleta.codigo_qr, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } catch (err) {
        console.error('Error generando QR:', err);
        this.qrCodeUrl = '';
      } finally {
        this.loadingQR = false;
        this.cdr.detectChanges();
      }
    } else {
      this.qrCodeUrl = '';
      this.loadingQR = false;
    }

    // Completar información del evento y tipo de boleta si la consulta inicial no trajo todo.
    try {
      const tipoBoleta = await this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id);
      if (!tipoBoleta) {
        this.cdr.detectChanges();
        return;
      }

      this.tipoBoletaSeleccionado = tipoBoleta;

      try {
        if (!this.eventoSeleccionado?.lugar && tipoBoleta.evento_id) {
          const evento = await this.eventosService.getEventoById(tipoBoleta.evento_id);
          this.eventoSeleccionado = evento || this.eventoSeleccionado;
        }
        this.cdr.detectChanges();
      } catch (err) {
        console.error('Error obteniendo evento:', err);
        this.cdr.detectChanges();
      }
    } catch (err) {
      console.error('Error obteniendo tipo de boleta:', err);
      this.cdr.detectChanges();
    }
  }

  /**
   * Cierra el modal de vista previa
   */
  cerrarBoletaModal() {
    this.showBoletaModal = false;
    this.boletaSeleccionada = null;
    this.compraSeleccionada = null;
    this.eventoSeleccionado = null;
    this.tipoBoletaSeleccionado = null;
    this.qrCodeUrl = '';
    this.cdr.detectChanges();
  }

  /**
   * Genera e imprime el PDF de una boleta
   */
  async imprimirBoletaPDF(boleta: BoletaComprada, compra: Compra) {
    try {
      if (!this.esTitularBoleta(boleta, compra)) {
        this.alertService.warning('No disponible', 'No tienes acceso a esta entrada.');
        return;
      }
      if (this.tieneTrasladoSalienteActivo(boleta.id)) {
        this.alertService.warning('Traslado en curso', 'No puedes imprimir el QR mientras el envío esté pendiente.');
        return;
      }
      if (!this.puedeAbrirVistaBoleta(boleta, compra)) {
        this.alertService.warning(
          'Registra al asistente',
          'Primero completa la asignación del asistente para poder generar el PDF con QR.'
        );
        return;
      }
      if (this.esBoletaUsada(boleta)) {
        this.alertService.warning('Boleta usada', 'Esta boleta ya fue usada y no permite generar QR ni PDF.');
        return;
      }
      if (!this.esDiaEventoBoleta(boleta, compra)) {
        this.alertService.warning('QR bloqueado por seguridad', this.mensajeHabilitacionQrBoleta(boleta, compra));
        return;
      }
      // Obtener información del tipo de boleta y evento
      const tipoBoleta = await this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id);
      
      if (!tipoBoleta) {
        this.alertService.error('Error', 'No se pudo obtener la información del tipo de boleta');
        return;
      }

      // Obtener información del evento
      const evento = await this.eventosService.getEventoById(tipoBoleta.evento_id);
      
      if (!evento) {
        this.alertService.error('Error', 'No se pudo obtener la información del evento');
        return;
      }

      // Generar el PDF
      await this.generarPDF(boleta, compra, tipoBoleta, evento);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      this.alertService.error('Error', 'Error al generar el PDF de la boleta');
    }
  }

  /**
   * Genera el PDF usando el diseño HTML
   */
  private async generarPDF(boleta: BoletaComprada, compra: Compra, tipoBoleta: TipoBoleta, evento: Evento) {
    // Asegurarnos de que el template esté actualizado con los datos actuales
    // (Angular ya se encarga de esto mediante el binding en el HTML)
    
    // Esperar un ciclo para que el DOM se actualice
    await new Promise(resolve => setTimeout(resolve, 100));

    const element = document.getElementById('ticket-template');
    if (!element) {
      console.error('No se encontró el elemento ticket-template');
      return;
    }

    try {
      // Convertir HTML a Canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Mejor calidad
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      
      const doc = new jsPDF({
        orientation: 'landscape', // Diseño horizontal para el ticket
        unit: 'mm',
        format: [80, 180] // Tamaño personalizado del ticket
      });

      // Añadir la imagen al PDF
      doc.addImage(imgData, 'PNG', 0, 0, 180, 80);

      // Guardar el PDF
      const fileName = `Ticket_${boleta.codigo_qr}_${evento.titulo.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Error convirtiendo HTML a PDF:', err);
      throw err;
    }
  }
}

