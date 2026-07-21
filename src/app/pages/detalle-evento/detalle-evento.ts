import { Component, OnInit, OnDestroy, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA, HostListener } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { CuponesService } from '../../services/cupones.service';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { LugaresService } from '../../services/lugares.service';
import { CategoriasService } from '../../services/categorias.service';
import { AlertService } from '../../services/alert.service';
import { DetalleEventoStateService } from '../../services/detalle-evento-state.service';
import { CarritoCompraService, ItemCarritoEvento } from '../../services/carrito-compra.service';
import { ProductosService } from '../../services/productos.service';
import { EventoProductosTab } from '../../components/evento-productos-tab/evento-productos-tab';
import {
  Evento,
  TipoBoleta,
  Usuario,
  Lugar,
  CategoriaEvento,
  TipoEstadoEvento,
  CuponDescuento,
  Palco,
  EstadoPalco,
  Producto
} from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { SafePipe } from '../../pipes/safe.pipe';
import { cuposEventumEnabled } from '../../core/cupos-feature';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { resolverConflictoEventoAntesDeAgregar } from '../../core/carrito-conflicto';
import { ClientConfirmDialogService } from '../../services/client-confirm-dialog.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-detalle-evento',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe, SafePipe, EventoProductosTab],
  templateUrl: './detalle-evento.html',
  styleUrl: './detalle-evento.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DetalleEvento implements OnInit, OnDestroy {
  readonly cuposEventumEnabled = cuposEventumEnabled;
  readonly cuposLabels = CUPOS_LABELS;
  /** `true` muestra disponibles/reservados/vendidas/totales en entradas a la venta. */
  readonly mostrarMetricasEntradasDisponibles = environment.mostrarMetricasEntradasDisponibles === true;
  evento: Evento | null = null;
  tiposBoleta: TipoBoleta[] = [];
  lugar: Lugar | null = null;
  categoria: CategoriaEvento | null = null;
  loading = false;
  isRefreshing = false;
  loadingBoletas = false;
  loadingProductosFlag = false;
  tieneProductos = false;
  productosCache: Producto[] = [];
  tabCompra: 'entradas' | 'productos' = 'entradas';
  loadingLugar = false;
  loadingCategoria = false;
  usuario: Usuario | null = null;

  // Cupones
  codigoCupon: string = '';
  cuponAplicado: CuponDescuento | null = null;
  validandoCupon = false;

  // Datos de compra
  /** Palcos en estado disponible por tipo (para selects en checkout). */
  palcosDisponiblesPorTipo = new Map<number, Palco[]>();

  /** Todos los palcos del tipo (disponible / reservado / vendido) para la cuadrícula visual. */
  palcosCatalogoPorTipo = new Map<number, Palco[]>();

  /** Unidad (slot) del carrito en edición por tipo de boleta. */
  private palcoFocoSlotPorTipo = new Map<number, number>();

  /** Visor a pantalla completa del plano de palcos. */
  mapaAmpliado: { url: string; titulo: string } | null = null;

  // Modal de imagen
  imagenModalAbierta = false;
  private imagenModalHistorialActivo = false;
  private mapaModalHistorialActivo = false;
  private currentEventoId: number | null = null;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private carritoSubscription?: Subscription;

  // Control de acordeones (todos cerrados por defecto)
  acordeones: {
    ubicacion: boolean;
    descripcion: boolean;
    terminos: boolean;
    politica: boolean;
    eventoFinalizado: boolean;
    etapasAgotadas: boolean;
  } = {
    ubicacion: false,
    descripcion: false,
    terminos: false,
    politica: false,
    eventoFinalizado: false,
    etapasAgotadas: false,
  };

  setTabCompra(tab: 'entradas' | 'productos'): void {
    if (this.tabCompra === tab) return;
    this.tabCompra = tab;

    const urlTree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: tab === 'productos' ? { tab: 'productos' } : { tab: null },
      queryParamsHandling: 'merge',
    });
    this.location.replaceState(this.router.serializeUrl(urlTree));
  }

  toggleAcordeon(seccion: keyof typeof this.acordeones) {
    this.acordeones[seccion] = !this.acordeones[seccion];
  }

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private location: Location,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private cuponesService: CuponesService,
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private clientConfirmDialog: ClientConfirmDialogService,
    private detalleEventoStateService: DetalleEventoStateService,
    private carritoCompraService: CarritoCompraService,
    private productosService: ProductosService,
    private lugaresService: LugaresService,
    private categoriasService: CategoriasService,
    private cdr: ChangeDetectorRef
  ) { }

  get itemsCompra(): ItemCarritoEvento[] {
    return this.carritoCompraService.getItemsSnapshot();
  }

  /** Ruta protegida de prueba de compras (solo admin). */
  get modoPruebaCompraAdmin(): boolean {
    return this.route.snapshot.data['modoPruebaCompra'] === true;
  }

  get rutaVolverEventos(): string[] {
    return this.modoPruebaCompraAdmin ? ['/probar-compras'] : ['/eventos-cliente'];
  }

  volverAEventos(): void {
    this.cerrarCapasSuperpuestas({ sincronizarHistorial: false });
    void this.router.navigate(this.rutaVolverEventos);
  }

  tieneExistencias(tipo: TipoBoleta): boolean {
    return this.maxCantidadPermitida(tipo) > 0;
  }

  get tiposBoletaDisponibles(): TipoBoleta[] {
    return this.tiposBoleta.filter((t) => this.tieneExistencias(t));
  }

  get tiposBoletaAgotados(): TipoBoleta[] {
    return this.tiposBoleta.filter((t) => !this.tieneExistencias(t));
  }

  maxCantidadPermitida(tipo: TipoBoleta): number {
    const stockPalcos = this.esLineaPalcoMultipersona(tipo)
      ? (this.palcosDisponiblesPorTipo.get(tipo.id) ?? []).length
      : null;
    return this.carritoCompraService.maxCantidadBoleta(tipo, stockPalcos);
  }

  puedeAgregarMasBoletas(tipo: TipoBoleta): boolean {
    return (
      this.tieneExistencias(tipo) &&
      this.getCantidadEnCarrito(tipo) < this.maxCantidadPermitida(tipo)
    );
  }

  ngOnInit() {
    const eventoId = this.route.snapshot.paramMap.get('id');
    if (eventoId) {
      const parsedId = Number(eventoId);
      this.currentEventoId = parsedId;
      const cachedState = this.detalleEventoStateService.getState(parsedId);
      if (cachedState) {
        this.applyCachedState(cachedState);
        this.loading = false;
      } else {
        this.loading = true;
      }

      const useBackgroundRefresh = !!cachedState;
      void this.loadEvento(parsedId, { background: useBackgroundRefresh });
    }

    const tabQuery = this.route.snapshot.queryParamMap.get('tab');
    if (tabQuery === 'productos') {
      this.tabCompra = 'productos';
    }

    this.loadUsuario();

    this.carritoSubscription = this.carritoCompraService.totalItems$.subscribe(() => {
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.carritoSubscription?.unsubscribe();
    this.cerrarCapasSuperpuestas({ sincronizarHistorial: false });
    this.persistState(Date.now());
    this.stopSilentRefreshIndicator();
  }

  @HostListener('window:popstate')
  onWindowPopState(): void {
    if (this.imagenModalAbierta) {
      this.cerrarImagenModal({ sincronizarHistorial: false });
      return;
    }
    if (this.mapaAmpliado) {
      this.cerrarMapaAmpliado({ sincronizarHistorial: false });
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.imagenModalAbierta) {
      this.cerrarImagenModal();
      return;
    }
    if (this.mapaAmpliado) {
      this.cerrarMapaAmpliado();
    }
  }

  loadUsuario() {
    const usuarioId = this.authService.getUsuarioId();
    if (usuarioId) {
      this.loadUsuarioById(usuarioId);
    } else {
      // Si no hay usuario autenticado, no cargar datos del usuario
      this.usuario = null;
    }
  }

  async loadUsuarioById(usuarioId: number) {
    try {
      const usuario = await this.usuariosService.getUsuarioById(usuarioId);
      this.usuario = usuario;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando información del usuario:', err);
    }
  }

  getDatosUsuario() {
    if (!this.usuario) return null;
    return {
      nombre: this.usuario.nombre && this.usuario.apellido
        ? `${this.usuario.nombre} ${this.usuario.apellido}`.trim()
        : this.usuario.nombre || '',
      documento: this.usuario.documento_identidad || '',
      email: this.usuario.email || '',
      telefono: this.usuario.telefono || ''
    };
  }

  usarMisDatos(item: ItemCarritoEvento) {
    const datosUsuario = this.getDatosUsuario();
    if (!datosUsuario) {
      this.alertService.warning('Perfil incompleto', 'No tienes información guardada en tu perfil. Completa tu perfil primero.');
      return;
    }
    if (!this.esLineaPalcoMultipersona(item.tipo)) {
      item.datosAsistente = { ...datosUsuario };
    }
    this.cdr.detectChanges();
  }

  cuposPorPalco(tipo: TipoBoleta): number {
    return Math.max(1, Number(tipo.personas_por_unidad ?? 1));
  }

  esLineaPalcoMultipersona(tipo: TipoBoleta): boolean {
    return this.cuposPorPalco(tipo) > 1;
  }

  /**
   * Unidades en reserva (checkout pendiente / admin): en palcos numerados cuenta `estado === reservado`;
   * en tipos sin grid, `total − vendidas − disponibles`.
   */
  cantidadPalcosReservados(tipo: TipoBoleta): number {
    if (this.esLineaPalcoMultipersona(tipo)) {
      const catalogo = this.palcosCatalogoPorTipo.get(tipo.id) ?? [];
      return catalogo.filter((p) => String(p.estado).toLowerCase() === EstadoPalco.RESERVADO).length;
    }
    const total = Number(tipo.cantidad_total ?? 0);
    const vendidas = Number(tipo.cantidad_vendidas ?? 0);
    const disponibles = Number(tipo.cantidad_disponibles ?? 0);
    return Math.max(0, total - vendidas - disponibles);
  }

  getIndicesUnidadesPalco(item: ItemCarritoEvento): number[] {
    if (this.esLineaPalcoMultipersona(item.tipo)) {
      if (!item.palco_ids || item.palco_ids.length !== item.cantidad) {
        item.palco_ids = Array.from({ length: item.cantidad }, () => null);
      }
    }
    return Array.from({ length: item.cantidad }, (_, i) => i);
  }

  opcionesPalcoEnSlot(item: ItemCarritoEvento, slotIndex: number): Palco[] {
    const lista = this.palcosDisponiblesPorTipo.get(item.tipo.id) || [];
    const tomados = new Set<number>();
    (item.palco_ids || []).forEach((id, idx) => {
      if (idx !== slotIndex && id != null) {
        tomados.add(id);
      }
    });
    const actual = item.palco_ids?.[slotIndex];
    return lista.filter((p) => !tomados.has(p.id) || p.id === actual);
  }

  /** Palcos ordenados para la cuadrícula de selección. */
  palcosGridCatalogo(item: ItemCarritoEvento): Palco[] {
    const raw = this.palcosCatalogoPorTipo.get(item.tipo.id) || [];
    return [...raw].sort((a, b) => a.numero - b.numero);
  }

  getFocoSlotPalco(item: ItemCarritoEvento): number {
    const tid = item.tipo.id;
    let f = this.palcoFocoSlotPorTipo.get(tid);
    if (f == null || f < 0 || f >= item.cantidad) {
      f = 0;
    }
    return f;
  }

  setFocoSlotPalco(item: ItemCarritoEvento, slot: number): void {
    if (slot < 0 || slot >= item.cantidad) {
      return;
    }
    this.palcoFocoSlotPorTipo.set(item.tipo.id, slot);
    this.cdr.detectChanges();
  }

  esPalcoClicableEnFoco(item: ItemCarritoEvento, palco: Palco): boolean {
    const slot = this.getFocoSlotPalco(item);
    return this.opcionesPalcoEnSlot(item, slot).some((p) => p.id === palco.id);
  }

  claseCeldaPalco(palco: Palco, item: ItemCarritoEvento): Record<string, boolean> {
    const slot = this.getFocoSlotPalco(item);
    const ids = item.palco_ids || [];
    const esDisponible =
      palco.estado === EstadoPalco.DISPONIBLE || String(palco.estado) === 'disponible';
    const clickeable = this.esPalcoClicableEnFoco(item, palco);
    const selIdx = ids.findIndex((id) => id === palco.id);
    return {
      'palco-cell': true,
      'palco-cell--nodisp': !esDisponible,
      'palco-cell--elegido': selIdx !== -1,
      'palco-cell--activo': ids[slot] === palco.id,
      'palco-cell--clic': clickeable
    };
  }

  seleccionarPalcoCelda(item: ItemCarritoEvento, palco: Palco): void {
    const slot = this.getFocoSlotPalco(item);
    if (!this.esPalcoClicableEnFoco(item, palco)) {
      return;
    }
    if (!item.palco_ids || item.palco_ids.length !== item.cantidad) {
      item.palco_ids = Array.from({ length: item.cantidad }, () => null);
    }
    item.palco_ids[slot] = palco.id;

    const nextVacío = item.palco_ids.findIndex((id, i) => i > slot && id == null);
    const cualVacío = item.palco_ids.findIndex((id) => id == null);
    if (nextVacío !== -1) {
      this.palcoFocoSlotPorTipo.set(item.tipo.id, nextVacío);
    } else if (cualVacío !== -1) {
      this.palcoFocoSlotPorTipo.set(item.tipo.id, cualVacío);
    }

    this.cdr.detectChanges();
  }

  limpiarPalcoSlot(item: ItemCarritoEvento, slotIndex: number): void {
    if (!item.palco_ids || slotIndex < 0 || slotIndex >= item.palco_ids.length) {
      return;
    }
    item.palco_ids[slotIndex] = null;
    this.palcoFocoSlotPorTipo.set(item.tipo.id, slotIndex);
    this.cdr.detectChanges();
  }

  numeroPalcoPorId(item: ItemCarritoEvento, palcoId: number | null | undefined): number | null {
    if (palcoId == null) {
      return null;
    }
    const list = this.palcosCatalogoPorTipo.get(item.tipo.id) || [];
    const found = list.find((p) => p.id === palcoId);
    return found ? found.numero : null;
  }

  abrirMapaAmpliado(url: string, titulo: string): void {
    if (this.mapaAmpliado) return;
    this.mapaAmpliado = { url, titulo };
    this.setScrollDocumentoBloqueado(true);
    if (!this.mapaModalHistorialActivo) {
      history.pushState({ detalleEventoMapa: true }, '');
      this.mapaModalHistorialActivo = true;
    }
    this.cdr.detectChanges();
  }

  cerrarMapaAmpliado(opciones?: { sincronizarHistorial?: boolean }): void {
    if (!this.mapaAmpliado) return;
    const sincronizarHistorial = opciones?.sincronizarHistorial !== false;
    this.mapaAmpliado = null;
    if (!this.imagenModalAbierta) {
      this.setScrollDocumentoBloqueado(false);
    }
    if (this.mapaModalHistorialActivo && sincronizarHistorial) {
      this.mapaModalHistorialActivo = false;
      history.back();
    } else {
      this.mapaModalHistorialActivo = false;
    }
    this.cdr.detectChanges();
  }

  trackBySlotIndex(_: number, ui: number): number {
    return ui;
  }

  trackByPalcoId(_: number, p: Palco): number {
    return p.id;
  }

  palcosSeleccionCompletos(item: ItemCarritoEvento): boolean {
    const ids = item.palco_ids || [];
    if (ids.length !== item.cantidad) {
      return false;
    }
    return ids.every((id) => id != null);
  }

  private async refrescarPalcosDisponibles(): Promise<void> {
    this.palcosDisponiblesPorTipo.clear();
    this.palcosCatalogoPorTipo.clear();
    for (const t of this.tiposBoleta) {
      if (this.esLineaPalcoMultipersona(t)) {
        try {
          const [list, catalogo] = await Promise.all([
            this.boletasService.getPalcosDisponiblesParaVenta(t.id),
            this.boletasService.getPalcosPorTipo(t.id)
          ]);
          this.palcosDisponiblesPorTipo.set(t.id, list);
          this.palcosCatalogoPorTipo.set(t.id, catalogo || []);
        } catch (e) {
          console.error('Error cargando palcos disponibles:', e);
          this.palcosDisponiblesPorTipo.set(t.id, []);
          this.palcosCatalogoPorTipo.set(t.id, []);
        }
      }
    }
  }

  async loadEvento(id: number, options?: { background?: boolean }) {
    const background = options?.background ?? false;
    const hasVisibleData = !!this.evento && this.evento.id === id;
    const silentRefreshMode = background || hasVisibleData;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const refreshStartedAt = Date.now();

    if (offline && hasVisibleData) {
      console.info('[DetalleEvento] Sin conexión, usando datos cacheados', { eventoId: id });
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.cdr.detectChanges();
      return;
    }

    this.loading = !silentRefreshMode && !hasVisibleData;
    if (silentRefreshMode) {
      console.info('[DetalleEvento] Refresco silencioso iniciado', { eventoId: id });
      this.startSilentRefreshIndicator();
    } else {
      this.stopSilentRefreshIndicator();
    }

    try {
      // Cargar evento primero
      const evento = await this.eventosService.getEventoById(id);
      
      // Verificar si el evento ha finalizado y actualizar su estado solo si es cliente o no está logueado (versión pública)
      const esCliente = this.authService.isCliente();
      const noLogueado = !this.authService.getUsuarioId();
      
      if (esCliente || noLogueado) {
        await this.eventosService.verificarEventoFinalizado(id, true);
        // Recargar el evento para obtener el estado actualizado
        const eventoActualizado = await this.eventosService.getEventoById(id);
        this.evento = eventoActualizado;
      } else {
        this.evento = evento;
      }

      // Preparar promesas para carga en paralelo
      const promesas: Promise<any>[] = [];

      // Comenzar temprano la verificación de productos para que la tab sea visible antes.
      this.loadingProductosFlag = !silentRefreshMode;
      promesas.push(
        this.productosService.eventoTieneProductos(id)
          .then(async (tieneProductos) => {
            this.tieneProductos = tieneProductos;
            if (!tieneProductos) {
              this.productosCache = [];
              return;
            }

            try {
              this.productosCache = await this.productosService.getProductosPorEvento(id);
            } catch (productosError) {
              console.warn('[DetalleEvento] No se pudo refrescar productos cacheados:', productosError);
              if (!this.productosCache.length) {
                this.productosCache = [];
              }
            }
          })
          .catch(() => {
            this.tieneProductos = false;
            if (!this.productosCache.length) {
              this.productosCache = [];
            }
          })
          .finally(() => {
            this.loadingProductosFlag = false;
            this.cdr.detectChanges();
          })
      );

      // Agregar carga de lugar si existe
      if (evento.lugar_id) {
        promesas.push(this.loadLugar(evento.lugar_id, { background: silentRefreshMode }));
      }

      // Agregar carga de categoría si existe
      if (evento.categoria_id) {
        promesas.push(this.loadCategoria(evento.categoria_id, { background: silentRefreshMode }));
      }

      // Agregar carga de tipos de boleta solo si el evento no está finalizado
      const ahora = new Date();
      const fechaFin = new Date(this.evento.fecha_fin);
      const estaFinalizado = this.evento.estado === TipoEstadoEvento.FINALIZADO || 
                            this.evento.estado === TipoEstadoEvento.CANCELADO ||
                            fechaFin < ahora;
      
      if (!estaFinalizado) {
        promesas.push(this.loadTiposBoleta(id, { background: silentRefreshMode }));
      } else {
        // Si está finalizado, asegurar que no hay boletas
        this.tiposBoleta = [];
        this.loadingBoletas = false;
      }

      // Esperar a que todas las cargas terminen en paralelo
      await Promise.all(promesas);

      // Actualizar estado y vista después de que todo esté cargado
      this.loading = false;
      this.persistState(Date.now());
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando evento:', err);
      this.loading = false;
      if (!silentRefreshMode) {
        this.router.navigate(this.rutaVolverEventos);
      }
    } finally {
      this.stopSilentRefreshIndicator();
      if (silentRefreshMode) {
        console.info('[DetalleEvento] Refresco silencioso finalizado', {
          eventoId: id,
          durationMs: Date.now() - refreshStartedAt,
          tiposBoleta: this.tiposBoleta.length,
          tieneLugar: !!this.lugar,
          tieneCategoria: !!this.categoria
        });
      }
      this.cdr.detectChanges();
    }
  }

  async loadCategoria(categoriaId: number, options?: { background?: boolean }) {
    const background = options?.background ?? false;
    this.loadingCategoria = !background;
    try {
      const categoria = await this.categoriasService.getCategoriaById(categoriaId);
      this.categoria = categoria;
      this.loadingCategoria = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando categoría:', err);
      this.categoria = null;
      this.loadingCategoria = false;
      this.cdr.detectChanges();
      // No lanzar el error para que no rompa la carga del evento
    }
  }

  async loadLugar(lugarId: number, options?: { background?: boolean }) {
    const background = options?.background ?? false;
    this.loadingLugar = !background;
    try {
      const lugar = await this.lugaresService.getLugarById(lugarId);
      this.lugar = lugar;
      this.loadingLugar = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando lugar:', err);
      this.lugar = null;
      this.loadingLugar = false;
      this.cdr.detectChanges();
      // No lanzar el error para que no rompa la carga del evento
    }
  }

  async loadTiposBoleta(eventoId: number, options?: { background?: boolean }) {
    const background = options?.background ?? false;
    this.loadingBoletas = !background;
    try {
      const tipos = await this.boletasService.getTiposBoleta(eventoId);
      // Usar cantidad_vendidas directamente de la tabla (para marketing)
      // Mostrar todos los tipos activos aunque no tengan disponibilidad,
      // para que se vean las cifras de venta incluso cuando estén agotados.
      this.tiposBoleta = tipos
        .filter(t => t.activo)
        .map((t) => {
          // Asegurar consistencia UI: si `cantidad_disponibles` viene en 0 pero por total-vendidas
          // todavía hay cupo, preferimos el cálculo para no bloquear compras disponibles.
          const vendidas = Number(t.cantidad_vendidas ?? 0);
          const total = Number(t.cantidad_total ?? 0);
          const disponiblesCalculados = Number.isFinite(total)
            ? Math.max(0, total - vendidas)
            : 0;
          const rawDisponibles = Number(t.cantidad_disponibles);
          const disponibles =
            t.cantidad_disponibles === null ||
            t.cantidad_disponibles === undefined ||
            !Number.isFinite(rawDisponibles)
              ? disponiblesCalculados
              : Math.max(0, rawDisponibles);

          return {
            ...t,
            cantidad_disponibles: disponibles
          };
        })
        .sort((a, b) => {
          const aSoldOut = Number(a.cantidad_disponibles ?? 0) <= 0;
          const bSoldOut = Number(b.cantidad_disponibles ?? 0) <= 0;
          if (aSoldOut === bSoldOut) return 0;
          return aSoldOut ? 1 : -1;
        });
      await this.refrescarPalcosDisponibles();
      this.loadingBoletas = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando tipos de boleta:', err);
      this.tiposBoleta = [];
      this.loadingBoletas = false;
      this.cdr.detectChanges();
      // No lanzar el error para que no rompa la carga del evento
    }
  }

  isEventoFinalizado(): boolean {
    if (!this.evento) return false;
    const ahora = new Date();
    const fechaFin = new Date(this.evento.fecha_fin);
    return this.evento.estado === TipoEstadoEvento.FINALIZADO || 
           this.evento.estado === TipoEstadoEvento.CANCELADO ||
           fechaFin < ahora;
  }

  async agregarAlCarrito(tipo: TipoBoleta) {
    if (!this.puedeAgregarMasBoletas(tipo)) {
      return;
    }
    const puedeContinuar = await resolverConflictoEventoAntesDeAgregar(
      this.clientConfirmDialog,
      this.carritoCompraService,
      this.evento?.titulo ?? 'este evento',
    );
    if (!puedeContinuar) {
      return;
    }
    if (this.evento) {
      this.carritoCompraService.syncEvento(this.evento);
    }
    const maxCantidad = this.maxCantidadPermitida(tipo);
    this.carritoCompraService.agregarAlCarrito(tipo, undefined, maxCantidad);
    this.cdr.detectChanges();
  }

  quitarDelCarrito(tipo: TipoBoleta) {
    this.carritoCompraService.quitarDelCarrito(tipo.id);
    this.cdr.detectChanges();
  }

  eliminarDelCarrito(tipo: TipoBoleta) {
    this.carritoCompraService.eliminarDelCarrito(tipo.id);
    this.cdr.detectChanges();
  }

  getCantidadEnCarrito(tipo: TipoBoleta): number {
    return this.carritoCompraService.getCantidadEnCarrito(tipo.id);
  }

  getCantidadTotalCarrito(): number {
    const boletas = this.itemsCompra.reduce((acc, item) => acc + item.cantidad, 0);
    const productos = this.carritoCompraService.getItemsProductosSnapshot().reduce((acc, item) => acc + item.cantidad, 0);
    return boletas + productos;
  }

  irACarrito(): void {
    this.router.navigate(['/carrito']);
  }

  getSubtotal(): number {
    return this.getSubtotalBoletas() + this.getSubtotalProductos();
  }

  getSubtotalBoletas(): number {
    return this.itemsCompra.reduce((sum, item) => sum + (item.tipo.precio * item.cantidad), 0);
  }

  getSubtotalProductos(): number {
    return this.carritoCompraService.getSubtotalProductos();
  }

  getDescuento(): number {
    if (!this.cuponAplicado) return 0;
    return (this.getSubtotalBoletas() * this.cuponAplicado.porcentaje_descuento) / 100;
  }

  getPorcentajeServicio(): number {
    const raw = Number(this.evento?.porcentaje_servicio ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  }

  getBaseNetaBoletas(): number {
    return Math.max(0, this.getSubtotalBoletas() - this.getDescuento());
  }

  getValorServicio(): number {
    const base = this.getBaseNetaBoletas() + this.getSubtotalProductos();
    const porcentaje = this.getPorcentajeServicio();
    return (base * porcentaje) / 100;
  }

  getTotal(): number {
    return this.getBaseNetaBoletas() + this.getSubtotalProductos() + this.getValorServicio();
  }

  async aplicarCupon() {
    if (!this.codigoCupon || !this.evento) return;

    this.validandoCupon = true;
    try {
      const cupon = await this.cuponesService.validarCupon(this.codigoCupon, this.evento.id);
      if (cupon) {
        this.cuponAplicado = cupon;
        this.alertService.success('¡Cupón aplicado!', `Se ha aplicado un descuento del ${cupon.porcentaje_descuento}%`);
      } else {
        this.alertService.error('Cupón inválido', 'El código ingresado no existe, ya expiró o alcanzó su límite de usos');
        this.cuponAplicado = null;
      }
    } catch (err) {
      console.error('Error aplicando cupón:', err);
      this.alertService.error('Error', 'Hubo un error al validar el cupón');
    } finally {
      this.validandoCupon = false;
      this.cdr.detectChanges();
    }
  }

  quitarCupon() {
    this.cuponAplicado = null;
    this.codigoCupon = '';
    this.cdr.detectChanges();
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getImageUrl(evento: Evento): string {
    if (evento.imagen_principal) {
      if (evento.imagen_principal.startsWith('http')) {
        return evento.imagen_principal;
      }
      return evento.imagen_principal;
    }
    return '/assets/placeholder-event.jpg';
  }

  getTags(): string[] {
    if (!this.evento?.tags) return [];
    return this.evento.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  getCategoryIcon(cat: CategoriaEvento): string {
    if (cat.icono && cat.icono.trim().length > 1) {
      return cat.icono;
    }
    return 'pricetag';
  }

  getYoutubeEmbedUrl(url?: string): string | null {
    if (!url) return null;
    
    // Patrones comunes de URLs de YouTube
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return `https://www.youtube.com/embed/${match[1]}`;
      }
    }
    
    // Si no coincide con ningún patrón, retornar null
    return null;
  }

  abrirGoogleMaps(latitud: number, longitud: number) {
    const url = `https://www.google.com/maps?q=${latitud},${longitud}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  abrirSitioWeb(url: string) {
    // Asegurar que la URL tenga protocolo
    let sitioWeb = url;
    if (!sitioWeb.startsWith('http://') && !sitioWeb.startsWith('https://')) {
      sitioWeb = 'https://' + sitioWeb;
    }
    window.open(sitioWeb, '_blank', 'noopener,noreferrer');
  }

  abrirImagenModal(): void {
    if (this.imagenModalAbierta) return;
    this.imagenModalAbierta = true;
    this.setScrollDocumentoBloqueado(true);
    if (!this.imagenModalHistorialActivo) {
      history.pushState({ detalleEventoImagen: true }, '');
      this.imagenModalHistorialActivo = true;
    }
    this.cdr.detectChanges();
  }

  cerrarImagenModal(opciones?: { sincronizarHistorial?: boolean }): void {
    if (!this.imagenModalAbierta) return;
    const sincronizarHistorial = opciones?.sincronizarHistorial !== false;
    this.imagenModalAbierta = false;
    if (!this.mapaAmpliado) {
      this.setScrollDocumentoBloqueado(false);
    }
    if (this.imagenModalHistorialActivo && sincronizarHistorial) {
      this.imagenModalHistorialActivo = false;
      history.back();
    } else {
      this.imagenModalHistorialActivo = false;
    }
    this.cdr.detectChanges();
  }

  private cerrarCapasSuperpuestas(opciones?: { sincronizarHistorial?: boolean }): void {
    if (this.imagenModalAbierta) {
      this.cerrarImagenModal(opciones);
    }
    if (this.mapaAmpliado) {
      this.cerrarMapaAmpliado(opciones);
    }
    this.setScrollDocumentoBloqueado(false);
  }

  private setScrollDocumentoBloqueado(bloquear: boolean): void {
    if (typeof document === 'undefined') return;
    const valor = bloquear ? 'hidden' : '';
    document.documentElement.style.overflow = valor;
    document.body.style.overflow = valor;
  }

  private applyCachedState(state: {
    evento: Evento;
    tiposBoleta: TipoBoleta[];
    tieneProductos: boolean;
    productos: Producto[];
    lugar: Lugar | null;
    categoria: CategoriaEvento | null;
    palcosDisponiblesPorTipo: Map<number, Palco[]>;
    palcosCatalogoPorTipo: Map<number, Palco[]>;
  }): void {
    this.evento = { ...state.evento };
    this.tiposBoleta = [...state.tiposBoleta];
    this.tieneProductos = state.tieneProductos;
    this.productosCache = [...state.productos];
    this.lugar = state.lugar ? { ...state.lugar } : null;
    this.categoria = state.categoria ? { ...state.categoria } : null;
    this.palcosDisponiblesPorTipo = new Map(
      Array.from(state.palcosDisponiblesPorTipo.entries()).map(([k, v]) => [k, [...v]])
    );
    this.palcosCatalogoPorTipo = new Map(
      Array.from(state.palcosCatalogoPorTipo.entries()).map(([k, v]) => [k, [...v]])
    );
  }

  private persistState(lastUpdated: number): void {
    if (!this.currentEventoId || !this.evento) return;
    this.detalleEventoStateService.saveState(this.currentEventoId, {
      evento: this.evento,
      tiposBoleta: this.tiposBoleta,
      tieneProductos: this.tieneProductos,
      productos: this.productosCache,
      lugar: this.lugar,
      categoria: this.categoria,
      palcosDisponiblesPorTipo: this.palcosDisponiblesPorTipo,
      palcosCatalogoPorTipo: this.palcosCatalogoPorTipo,
      lastUpdated
    });
  }

  private startSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.cdr.detectChanges();
    }, this.refreshIndicatorDelayMs);
  }

  private stopSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }
    this.isRefreshing = false;
  }

  onProductosActualizados(productos: Producto[]): void {
    this.productosCache = [...productos];
    this.tieneProductos = this.productosCache.length > 0;
    this.persistState(Date.now());
    this.cdr.detectChanges();
  }
}

