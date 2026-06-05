import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { CuposEventoService } from '../../services/cupos-evento.service';
import { CategoriasService } from '../../services/categorias.service';
import { EventosClienteStateService } from '../../services/eventos-cliente-state.service';
import { ProductosService } from '../../services/productos.service';
import { Evento, CategoriaEvento, TipoEstadoEvento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { cuposEventumEnabled } from '../../core/cupos-feature';
import { CUPOS_LABELS } from '../../core/cupos-labels';

@Component({
  selector: 'app-eventos-cliente',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './eventos-cliente.html',
  styleUrl: './eventos-cliente.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class EventosCliente implements OnInit, OnDestroy {
  @ViewChild('carouselTrack') carouselTrack!: ElementRef;

  eventos: Evento[] = [];
  eventosFiltrados: Evento[] = [];
  eventosFinalizados: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  loading = false;
  isRefreshing = false;
  loadingFinalizados = false;
  /** Oculta el carrusel (incl. «Todo») hasta terminar la primera carga completa */
  initialBootstrapLoading = true;
  searchTerm = '';
  categoriaFiltro: number | null = null;
  resumenProductosPorEvento = new Map<number, { cantidad: number; precioMinimo: number }>();

  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private readonly maxProductosDestacados = 4;
  currentYear = new Date().getFullYear();
  readonly appVersion = environment.appVersion;
  readonly cuposEventumEnabled = cuposEventumEnabled;
  readonly cuposLabels = CUPOS_LABELS;
  respuestasCupos = 0;

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private eventosClienteStateService: EventosClienteStateService,
    private productosService: ProductosService,
    private authService: AuthService,
    private cuposEventoService: CuposEventoService,
    private cdr: ChangeDetectorRef
  ) { }

  get clienteLogueado(): boolean {
    return !!this.authService.getCurrentUser();
  }

  ngOnInit() {
    const cachedState = this.eventosClienteStateService.getState();
    if (cachedState) {
      this.applyCachedState(cachedState);
      this.initialBootstrapLoading = false;
      this.loading = false;
      setTimeout(() => window.scrollTo({ top: cachedState.scrollY, behavior: 'auto' }), 0);
    } else {
      this.loading = true;
    }

    const useBackgroundRefresh = !!cachedState;
    void this.loadEventos(undefined, { background: useBackgroundRefresh });

    // Configurar búsqueda con debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500), // Esperar 500ms después de que el usuario deje de escribir
      distinctUntilChanged() // Solo buscar si el término cambió
    ).subscribe(term => {
      void this.loadEventos(term, { background: this.eventosFiltrados.length > 0 });
    });

    if (this.cuposEventumEnabled && this.clienteLogueado) {
      void this.cargarResumenCupos();
    }
  }

  private async cargarResumenCupos(): Promise<void> {
    try {
      const r = await this.cuposEventoService.resumenMisCupos();
      this.respuestasCupos = r.total_respuestas;
      this.cdr.detectChanges();
    } catch {
      this.respuestasCupos = 0;
    }
  }

  ngOnDestroy() {
    this.persistState();
    this.stopSilentRefreshIndicator();

    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  async loadCategorias() {
    try {
      const response = await this.categoriasService.getCategorias({ limit: 100, activo: true });
      this.categorias = response.data || [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando categorías:', err);
      this.categorias = [];
      this.cdr.detectChanges();
    }
  }

  async loadEventos(searchTerm?: string, options?: { background?: boolean }) {
    const background = options?.background ?? false;
    const hasVisibleData = this.eventosFiltrados.length > 0 || this.eventos.length > 0;
    const silentRefreshMode = background || hasVisibleData;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const refreshStartedAt = Date.now();

    if (offline && hasVisibleData) {
      console.info('[EventosCliente] Sin conexión, usando datos cacheados');
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.aplicarFiltrosLocales();
      this.cdr.detectChanges();
      return;
    }

    this.loading = !silentRefreshMode && !hasVisibleData;
    if (silentRefreshMode) {
      console.info('[EventosCliente] Refresco silencioso iniciado', {
        searchTerm: searchTerm ?? '',
        categoriaFiltro: this.categoriaFiltro
      });
      this.startSilentRefreshIndicator();
    } else {
      this.stopSilentRefreshIndicator();
    }
    this.cdr.detectChanges();

    try {
      // Carga inicial: categorías y eventos en paralelo (solo la primera vez, searchTerm === undefined)
      if (searchTerm === undefined) {
        await Promise.all([this.loadCategorias(), this.executeLoadEventos(searchTerm)]);
      } else {
        await this.executeLoadEventos(searchTerm);
      }
      // Esperar finalizados antes de quitar el loader (misma vista inicial / sin búsqueda ni categoría)
      if (!this.searchTerm?.trim() && !this.categoriaFiltro) {
        await this.loadEventosFinalizados({ background: true });
      } else {
        this.eventosFinalizados = [];
      }
      this.persistState(Date.now());
    } finally {
      this.loading = false;
      this.stopSilentRefreshIndicator();
      if (silentRefreshMode) {
        console.info('[EventosCliente] Refresco silencioso finalizado', {
          durationMs: Date.now() - refreshStartedAt,
          eventos: this.eventos.length,
          filtrados: this.eventosFiltrados.length,
          finalizados: this.eventosFinalizados.length
        });
      }
      if (searchTerm === undefined && this.initialBootstrapLoading) {
        this.initialBootstrapLoading = false;
      }
      this.cdr.detectChanges();
    }
  }

  private async executeLoadEventos(searchTerm?: string) {
    console.log('Cargando eventos. Búsqueda:', searchTerm);

    const loadEventosWithFallback = async (filters: any) => {
      try {
        return await this.eventosService.getEventos({
          ...filters,
          limit: 100,
          sortBy: 'fecha_inicio',
          sortOrder: 'asc'
        });
      } catch (err) {
        return { data: [], total: 0, page: 1, limit: 100, totalPages: 0 };
      }
    };

    try {
      const filters: any = {
        activo: true,
        estado: TipoEstadoEvento.PUBLICADO
      };

      if (searchTerm) {
        filters.search = searchTerm;
      }

      let response = await loadEventosWithFallback(filters);
      let eventos = response.data || [];

      if (eventos.length === 0 && !searchTerm) {
        const fallbackFilters: any = { activo: true };
        response = await loadEventosWithFallback(fallbackFilters);
        eventos = response.data || [];
      }

      await this.procesarEventos(eventos);
    } catch (err) {
      console.error('Error cargando eventos:', err);
      await this.procesarEventos([]);
    }
  }

  private async procesarEventos(eventos: Evento[]): Promise<void> {
    const ahora = new Date();
    // Filtrar eventos activos y que no hayan finalizado (fecha_fin aún no ha pasado)
    this.eventos = eventos.filter(e => {
      if (e.activo !== true) return false;

      // Excluir eventos cuya fecha de finalización ya pasó
      if (e.fecha_fin) {
        const fechaFin = new Date(e.fecha_fin);
        if (fechaFin < ahora) return false;
      }

      return true;
    });

    await this.cargarResumenProductosEventos();

    // Ya no filtramos localmente por search, el servidor ya lo hizo
    this.aplicarFiltrosLocales();
    this.persistState();
    this.cdr.detectChanges();
  }

  private async cargarResumenProductosEventos(): Promise<void> {
    const ids = this.eventos.map((evento) => evento.id);
    if (ids.length === 0) {
      this.resumenProductosPorEvento = new Map();
      this.cdr.detectChanges();
      return;
    }

    try {
      this.resumenProductosPorEvento = await this.productosService.getResumenProductosPorEvento(ids);
    } catch (error) {
      console.warn('No se pudo cargar resumen de productos por evento:', error);
      this.resumenProductosPorEvento = new Map();
    } finally {
      this.cdr.detectChanges();
    }
  }

  tieneProductosEvento(eventoId: number): boolean {
    return this.resumenProductosPorEvento.has(eventoId);
  }

  getCantidadProductosEvento(eventoId: number): number {
    return this.resumenProductosPorEvento.get(eventoId)?.cantidad ?? 0;
  }

  getPrecioMinimoProductoEvento(eventoId: number): number {
    return this.resumenProductosPorEvento.get(eventoId)?.precioMinimo ?? 0;
  }

  get eventosConProductos(): Evento[] {
    const seen = new Set<number>();
    const merged = [...this.eventosDestacados, ...this.eventosRegulares];
    return merged.filter((evento) => {
      if (seen.has(evento.id)) return false;
      seen.add(evento.id);
      return this.tieneProductosEvento(evento.id);
    });
  }

  get eventosConProductosPreview(): Evento[] {
    return this.eventosConProductos.slice(0, this.maxProductosDestacados);
  }

  getProductosChipLabel(evento: Evento): string {
    const cantidad = this.getCantidadProductosEvento(evento.id);
    const sufijo = cantidad === 1 ? 'producto' : 'productos';
    const estadoLabel = this.precioEventoActivo(evento) ? 'Precio en evento activo' : 'Preventa en productos';
    const precioMinimo = this.getPrecioMinimoProductoEvento(evento.id);
    return `${estadoLabel} · ${cantidad} ${sufijo} · Desde ${this.formatCurrency(precioMinimo)}`;
  }

  getProductosBadgeShortLabel(evento: Evento): string {
    return this.precioEventoActivo(evento) ? 'Precio en evento activo' : 'Preventa en productos';
  }

  getProductosChipCardLabel(evento: Evento): string {
    return this.precioEventoActivo(evento) ? 'Productos preventa' : 'Preventa productos';
  }

  getProductosChipShortLabel(evento: Evento): string {
    return this.precioEventoActivo(evento) ? 'Productos' : 'Preventa';
  }

  getCantidadProductosLabel(eventoId: number): string {
    const cantidad = this.getCantidadProductosEvento(eventoId);
    return `${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`;
  }

  precioEventoActivo(evento: Evento): boolean {
    if (!evento.fecha_inicio) return false;
    return new Date(evento.fecha_inicio).getTime() <= Date.now();
  }

  aplicarFiltrosLocales() {
    let filtrados = [...this.eventos];

    // Fallback local para escenarios offline.
    const search = (this.searchTerm || '').trim().toLowerCase();
    if (search) {
      filtrados = filtrados.filter((e) => {
        const titulo = (e.titulo || '').toLowerCase();
        const descripcion = (e.descripcion || '').toLowerCase();
        return titulo.includes(search) || descripcion.includes(search);
      });
    }

    if (this.categoriaFiltro) {
      filtrados = filtrados.filter(e => e.categoria_id === this.categoriaFiltro);
    }

    this.eventosFiltrados = filtrados;
    this.persistState();
  }

  get eventosDestacados(): Evento[] {
    // Si hay búsqueda activa, no mostramos destacados separados
    if (this.searchTerm) return [];
    return this.eventos.filter(e => e.destacado);
  }

  get eventosRegulares(): Evento[] {
    return this.eventosFiltrados;
  }

  setCategoria(id: number | null) {
    this.categoriaFiltro = id;
    this.aplicarFiltrosLocales();
    
    // Al volver a "Todo", mantener los finalizados ya cacheados y refrescar en background.
    // Esto evita el parpadeo donde "Finalizados" aparece después de "Próximos eventos".
    if (id === null) {
      void this.loadEventosFinalizados({ background: true });
    }
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm);
    this.persistState();

    if (this.searchTerm) {
      this.eventosFinalizados = [];
      this.persistState();
    }
    // Si se limpia la búsqueda, loadEventos('') (tras debounce) recarga lista + finalizados
  }

  getCategoryIcon(cat: CategoriaEvento): string {
    if (cat.icono && cat.icono.trim().length > 1) {
      return cat.icono;
    }
    return 'pricetag';
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return 'Gratis';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getImageUrl(evento: Evento): string {
    return evento.imagen_principal || '/assets/placeholder-event.jpg';
  }

  scrollCategories(direction: -1 | 1) {
    const el = this.carouselTrack?.nativeElement as HTMLElement | undefined;
    if (!el) return;
    const step = Math.min(320, Math.max(180, el.clientWidth * 0.45));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  async loadEventosFinalizados(options?: { background?: boolean }) {
    // Solo cargar eventos finalizados si no hay búsqueda activa ni filtro de categoría
    if (this.searchTerm?.trim() || this.categoriaFiltro) {
      this.eventosFinalizados = [];
      return;
    }

    const background = options?.background ?? false;
    const previousFinalizados = [...this.eventosFinalizados];
    this.loadingFinalizados = !background;
    this.cdr.detectChanges();

    try {
      // Cargar eventos finalizados (estado finalizado)
      const response = await this.eventosService.getEventos({
        estado: TipoEstadoEvento.FINALIZADO,
        limit: 50,
        sortBy: 'fecha_fin',
        sortOrder: 'desc'
      });

      let eventos = response.data || [];
      
      // También incluir eventos cuya fecha_fin ya pasó pero aún no están marcados como finalizados
      // Solo buscar entre eventos publicados y activos
      const responseNoFinalizados = await this.eventosService.getEventos({
        activo: true,
        estado: TipoEstadoEvento.PUBLICADO,
        limit: 50,
        sortBy: 'fecha_fin',
        sortOrder: 'desc'
      });

      const ahoraDate = new Date();
      const eventosConFechaPasada = (responseNoFinalizados.data || []).filter(e => {
        if (e.fecha_fin) {
          const fechaFin = new Date(e.fecha_fin);
          return fechaFin < ahoraDate;
        }
        return false;
      });

      // Combinar y eliminar duplicados
      const todosEventos = [...eventos, ...eventosConFechaPasada];
      const eventosUnicos = todosEventos.filter((evento, index, self) =>
        index === self.findIndex(e => e.id === evento.id)
      );

      // Ordenar por fecha_fin descendente (más recientes primero)
      this.eventosFinalizados = eventosUnicos.sort((a, b) => {
        const fechaA = new Date(a.fecha_fin || 0).getTime();
        const fechaB = new Date(b.fecha_fin || 0).getTime();
        return fechaB - fechaA;
      }).slice(0, 20); // Limitar a 20 eventos

      this.loadingFinalizados = false;
      this.persistState();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando eventos finalizados:', err);
      // En refresh silencioso conservamos la última lista para evitar saltos visuales.
      this.eventosFinalizados = background ? previousFinalizados : [];
      this.loadingFinalizados = false;
      this.cdr.detectChanges();
    }
  }

  private applyCachedState(state: {
    eventos: Evento[];
    eventosFiltrados: Evento[];
    eventosFinalizados: Evento[];
    categorias: CategoriaEvento[];
    resumenProductosPorEvento: Record<string, { cantidad: number; precioMinimo: number }>;
    searchTerm: string;
    categoriaFiltro: number | null;
  }) {
    this.eventos = [...state.eventos];
    this.eventosFiltrados = [...state.eventosFiltrados];
    this.eventosFinalizados = [...state.eventosFinalizados];
    this.categorias = [...state.categorias];
    this.resumenProductosPorEvento = this.deserializeResumenProductosPorEvento(state.resumenProductosPorEvento);
    this.searchTerm = state.searchTerm;
    this.categoriaFiltro = state.categoriaFiltro;
  }

  private persistState(lastUpdated?: number) {
    const existingState = this.eventosClienteStateService.getState();
    this.eventosClienteStateService.saveState({
      eventos: this.eventos,
      eventosFiltrados: this.eventosFiltrados,
      eventosFinalizados: this.eventosFinalizados,
      categorias: this.categorias,
      resumenProductosPorEvento: this.serializeResumenProductosPorEvento(),
      searchTerm: this.searchTerm,
      categoriaFiltro: this.categoriaFiltro,
      scrollY: window.scrollY,
      lastUpdated: lastUpdated ?? existingState?.lastUpdated ?? 0
    });
  }

  private serializeResumenProductosPorEvento(): Record<string, { cantidad: number; precioMinimo: number }> {
    return Object.fromEntries(this.resumenProductosPorEvento.entries());
  }

  private deserializeResumenProductosPorEvento(
    resumen: Record<string, { cantidad: number; precioMinimo: number }> | undefined
  ): Map<number, { cantidad: number; precioMinimo: number }> {
    const source = resumen ?? {};
    const entries = Object.entries(source).map(([eventoId, data]) => [Number(eventoId), data] as const);
    return new Map(entries);
  }

  trackByEventoId(_: number, evento: Evento): number {
    return evento.id;
  }

  trackByCategoriaId(_: number, categoria: CategoriaEvento): number {
    return categoria.id;
  }

  private startSilentRefreshIndicator() {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.cdr.detectChanges();
    }, this.refreshIndicatorDelayMs);
  }

  private stopSilentRefreshIndicator() {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }
    this.isRefreshing = false;
  }
}
