import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { EventosService } from '../../services/eventos.service';
import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';
import { CategoriasService } from '../../services/categorias.service';
import { LugaresService } from '../../services/lugares.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { WompiCuentasService } from '../../services/wompi-cuentas.service';
import { BoletasService } from '../../services/boletas.service';
import { DrawerService } from '../../core/drawer';
import { openEventoCuponesDrawer } from '../../panels/evento-cupones';
import { openEventoBoletasDrawer } from '../../panels/evento-boletas';
import { enforceBorradorCatalogoRules } from '../../core/evento-publicacion';
import { getEventoLegalDefaults } from '../../core/evento-legal-defaults';
import {
  getEventoEstadoAdminLabel,
  getEventoEstadoCardLabel,
  getEventoEstadoCardStatusClass,
} from '../../core/evento-estado-labels';
import { formatFinanzasMonedaExacta } from '../../utils/dashboard-finanzas.view';
import { Evento, CategoriaEvento, Lugar, Usuario, PaginatedResponse, TipoEstadoEvento, WompiCuenta } from '../../types';
import { EvFormModal } from '../../components/ev-form-modal/ev-form-modal';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvFormWizard, EvWizardStep } from '../../components/ev-form-wizard/ev-form-wizard';
import { EvEventoPreview } from '../../components/ev-evento-preview/ev-evento-preview';
import { EvEventoCard } from '../../components/ev-evento-card/ev-evento-card';
import { EvSelect, EvSelectOption, mapToEvSelectOptions } from '../../components/ev-select/ev-select';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvDatetimePeriod } from '../../components/ev-datetime-period/ev-datetime-period';
import { getRangeValidationMessage, compareDatetimeLocal } from '../../core/datetime-picker';
import { EvNotice } from '../../components/ev-notice';

@Component({
  selector: 'app-eventos',
  imports: [CommonModule, FormsModule, RouterLink, EvFormModal, EvFormSection, EvFormWizard, EvEventoPreview, EvEventoCard, EvSelect, EvNumberInput, EvDatetimePeriod, EvNotice],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css',
})
export class Eventos implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  eventos: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  lugares: Lugar[] = [];
  organizadores: Usuario[] = [];
  wompiCuentas: WompiCuenta[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  searchTerm = '';
  categoriaFiltro: number | null = null;
  estadoFiltro: string | null = null;
  sortOrden: 'fecha_desc' | 'fecha_asc' | 'nombre_asc' | 'nombre_desc' = 'fecha_desc';
  showFiltersMobile = false;
  openMenuEventoId: number | null = null;
  boletasPorEvento = new Map<number, number>();
  resumenTotalEventos: number | null = null;
  resumenEventosActivos: number | null = null;
  resumenBoletasVendidas: number | null = null;
  resumenProductosVendidos: number | null = null;
  private searchSubject = new Subject<string>();

  showModal = false;
  editingEvento: Evento | null = null;
  formData: Partial<Evento> = { activo: false, estado: TipoEstadoEvento.BORRADOR };
  wizardStep = 0;
  wizardPhase: 'form' | 'success' = 'form';
  wizardSelectToken = 0;
  savedEvento: Evento | null = null;

  private pendingEditId: number | null = null;
  private pendingWizardStep = 0;
  private pendingOpen: string | null = null;

  readonly createWizardSteps: EvWizardStep[] = [
    { id: 'que-es', label: 'Qué es' },
    { id: 'cuando-donde', label: 'Cuándo y dónde' },
  ];

  readonly editWizardSteps: EvWizardStep[] = [
    { id: 'basico', label: 'Información básica' },
    { id: 'lugar-fecha', label: 'Fechas' },
    { id: 'descripcion', label: 'Descripción' },
    { id: 'configuracion', label: 'Configuración' },
    { id: 'imagen', label: 'Imagen' },
    { id: 'revision', label: 'Revisión' },
  ];

  get activeWizardSteps(): EvWizardStep[] {
    return this.editingEvento ? this.editWizardSteps : this.createWizardSteps;
  }

  // Manejo de tipos de boleta por evento (drawer)

  // Propiedades para manejo de imágenes
  previewUrl: string | null = null;
  selectedFile: File | null = null;
  uploadingImage = false;

  estados: { value: TipoEstadoEvento; label: string }[] = [
    { value: TipoEstadoEvento.BORRADOR, label: 'Borrador' },
    { value: TipoEstadoEvento.PUBLICADO, label: 'Publicado' },
    { value: TipoEstadoEvento.EN_CURSO, label: 'En Curso' },
    { value: TipoEstadoEvento.FINALIZADO, label: 'Finalizado' },
    { value: TipoEstadoEvento.CANCELADO, label: 'Cancelado' }
  ];

  get isShowcaseMode(): boolean {
    return this.authService.isShowcaseOrganizador();
  }

  readonly onboardingPreviewEstado = TipoEstadoEvento.PUBLICADO;
  readonly onboardingPreviewTitulo = 'Festival Aurora 2026';
  readonly onboardingPreviewMeta = '15 mar 2026 · Bogotá · Desde $45.000';
  readonly onboardingPreviewCoverUrl =
    'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=960&q=80';

  get estadosFormulario(): { value: TipoEstadoEvento; label: string }[] {
    if (this.isShowcaseMode) {
      return this.estados.filter((estado) => estado.value !== TipoEstadoEvento.PUBLICADO);
    }
    return this.estados;
  }

  readonly sortOptions: EvSelectOption<string>[] = [
    { value: 'fecha_desc', label: 'Más recientes' },
    { value: 'fecha_asc', label: 'Más antiguos' },
    { value: 'nombre_asc', label: 'Nombre A–Z' },
    { value: 'nombre_desc', label: 'Nombre Z–A' },
  ];

  categoriaOptions: EvSelectOption<number>[] = [];
  categoriaFiltroOptions: EvSelectOption<number>[] = [];
  estadoFiltroOptions: EvSelectOption<string>[] = [];
  organizadorOptions: EvSelectOption<number>[] = [];
  lugarOptions: EvSelectOption<number>[] = [];
  estadoEventoOptions: EvSelectOption<TipoEstadoEvento>[] = [];
  wompiCuentaOptions: EvSelectOption<number>[] = [];

  private rebuildSelectOptions(): void {
    this.categoriaOptions = mapToEvSelectOptions(this.categorias, (c) => c.nombre, (c) => c.id);
    this.categoriaFiltroOptions = this.categoriaOptions;
    this.estadoFiltroOptions = this.estados.map((estado) => ({
      value: estado.value,
      label: estado.label,
    }));
    this.organizadorOptions = mapToEvSelectOptions(
      this.organizadores,
      (o) => `${o.nombre || ''} ${o.apellido || ''} (${o.email})`.replace(/\s+/g, ' ').trim(),
      (o) => o.id,
    );
    this.lugarOptions = mapToEvSelectOptions(
      this.lugares,
      (l) => `${l.nombre} — ${l.ciudad}`,
      (l) => l.id,
    );
    this.estadoEventoOptions = this.estadosFormulario.map((estado) => ({
      value: estado.value,
      label: estado.label,
    }));
    this.wompiCuentaOptions = mapToEvSelectOptions(
      this.wompiCuentas,
      (c) => `${c.nombre} (ID ${c.id})`,
      (c) => c.id,
    );
  }

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private lugaresService: LugaresService,
    private usuariosService: UsuariosService,
    public authService: AuthService,
    private timezoneService: TimezoneService,
    private storageService: StorageService,
    private imageOptimizationService: ImageOptimizationService,
    private wompiCuentasService: WompiCuentasService,
    private boletasService: BoletasService,
    private drawerService: DrawerService,
    private alertService: AlertService,
    private dashboardOrganizadorService: DashboardOrganizadorService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.page = 1;
        this.loadEventos();
      });

    this.loadCategorias();
    this.loadLugares();
    this.loadOrganizadores();
    this.loadWompiCuentas();
    this.rebuildSelectOptions();
    void this.loadEventos();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const editId = Number(params.get('edit'));
      if (editId > 0) {
        this.pendingEditId = editId;
        this.pendingWizardStep = Number(params.get('step')) || 0;
        this.pendingOpen = params.get('open');
        void this.tryOpenPendingEdit();
      }
    });
  }

  private async tryOpenPendingEdit(): Promise<void> {
    if (!this.pendingEditId) {
      return;
    }
    let evento = this.eventos.find((e) => e.id === this.pendingEditId);
    if (!evento) {
      try {
        evento = await this.eventosService.getEventoById(this.pendingEditId);
      } catch {
        return;
      }
    }
    const editId = this.pendingEditId;
    const open = this.pendingOpen;
    const step = Math.min(
      Math.max(this.pendingWizardStep, 0),
      this.editWizardSteps.length - 1,
    );
    this.pendingEditId = null;
    this.pendingOpen = null;
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });

    if (open === 'boletas') {
      this.openBoletasDrawer(evento);
      return;
    }
    if (open === 'cupones') {
      this.openCuponesDrawer(evento);
      return;
    }
    this.openModal(evento);
    this.wizardStep = step;
    this.cdr.detectChanges();
  }

  get pageTitle(): string {
    return this.authService.isOrganizador() ? 'Mis Eventos' : 'Eventos';
  }

  get pageSubtitle(): string {
    return this.authService.isOrganizador()
      ? 'Administra todos tus eventos desde un solo lugar.'
      : 'Gestiona todos los eventos del sistema desde un solo lugar.';
  }

  get heroEyebrow(): string {
    return this.authService.isOrganizador() ? 'Centro de operaciones' : 'Panel administrativo';
  }

  get showHeroStats(): boolean {
    return !this.loading && !this.isFirstTimeEmpty;
  }

  get heroStats(): Array<{ value: number; label: string }> {
    if (this.authService.isOrganizador()) {
      return [
        {
          value: this.resumenEventosActivos ?? this.resumenTotalEventos ?? this.total,
          label: 'eventos activos',
        },
        {
          value: this.resumenProductosVendidos ?? 0,
          label: 'productos',
        },
        {
          value: this.resumenBoletasVendidas ?? 0,
          label: 'boletas',
        },
      ];
    }
    return [{ value: this.total, label: this.total === 1 ? 'evento' : 'eventos' }];
  }

  get dashboardRoute(): string {
    return this.authService.isOrganizador() ? '/dashboard-organizador' : '/dashboard';
  }

  get hasActiveFilters(): boolean {
    return Boolean(
      this.searchTerm.trim()
      || this.categoriaFiltro != null
      || this.estadoFiltro
      || this.sortOrden !== 'fecha_desc'
    );
  }

  get activeFiltersCount(): number {
    let count = 0;
    if (this.searchTerm.trim()) count++;
    if (this.categoriaFiltro != null) count++;
    if (this.estadoFiltro) count++;
    if (this.sortOrden !== 'fecha_desc') count++;
    return count;
  }

  get eventosOrdenados(): Evento[] {
    const list = [...this.eventos];
    switch (this.sortOrden) {
      case 'fecha_asc':
        return list.sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)));
      case 'nombre_asc':
        return list.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      case 'nombre_desc':
        return list.sort((a, b) => b.titulo.localeCompare(a.titulo, 'es'));
      case 'fecha_desc':
      default:
        return list.sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
    }
  }

  get isFilteredEmpty(): boolean {
    return !this.loading && this.eventos.length === 0 && this.hasActiveFilters;
  }

  get isFirstTimeEmpty(): boolean {
    return !this.loading && this.eventos.length === 0 && !this.hasActiveFilters;
  }

  get eventoModalTitle(): string {
    if (this.wizardPhase === 'success') {
      return this.editingEvento ? '¡Evento actualizado!' : '¡Evento creado!';
    }
    return this.editingEvento ? 'Editar evento' : 'Crear evento';
  }

  get eventoModalDescription(): string {
    if (this.wizardPhase === 'success') {
      return 'Tu evento está listo. Elige el siguiente paso para continuar.';
    }
    return this.editingEvento
      ? 'Actualiza la información paso a paso.'
      : 'Título y fecha para empezar; completa el resto en Operaciones.';
  }

  get eventoModalPrimaryLabel(): string {
    return this.editingEvento ? 'Guardar cambios' : 'Crear evento';
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.searchSubject.next(value);
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadEventos();
  }

  onSortChange(): void {
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.categoriaFiltro = null;
    this.estadoFiltro = null;
    this.sortOrden = 'fecha_desc';
    this.page = 1;
    this.showFiltersMobile = false;
    this.loadEventos();
  }

  toggleFiltersMobile(): void {
    this.showFiltersMobile = !this.showFiltersMobile;
  }

  toggleEventoMenu(event: Event, eventoId: number): void {
    event.stopPropagation();
    this.openMenuEventoId = this.openMenuEventoId === eventoId ? null : eventoId;
  }

  verEvento(evento: Evento): void {
    void this.router.navigate(['/detalle-evento', evento.id], {
      state: { returnUrl: this.router.url },
    });
  }

  getEventoInteligenciaRoute(eventoId: number): string {
    return `/eventos/${eventoId}/inteligencia`;
  }

  getEventoOperacionesRoute(eventoId: number): string {
    return `/eventos/${eventoId}/operaciones`;
  }

  getBoletasVendidas(eventoId: number): number | null {
    if (!this.authService.isOrganizador()) return null;
    return this.boletasPorEvento.get(eventoId) ?? 0;
  }

  getLugarLabel(evento: Evento): string {
    const lugar = evento.lugar;
    if (!lugar?.nombre) return 'Sin lugar asignado';
    return lugar.ciudad ? `${lugar.nombre}, ${lugar.ciudad}` : lugar.nombre;
  }

  getEstadoPillClass(estado?: string): string {
    switch (estado) {
      case TipoEstadoEvento.PUBLICADO:
        return 'ev-pill--published';
      case TipoEstadoEvento.EN_CURSO:
        return 'ev-pill--live';
      case TipoEstadoEvento.FINALIZADO:
        return 'ev-pill--done';
      case TipoEstadoEvento.CANCELADO:
        return 'ev-pill--cancelled';
      default:
        return 'ev-pill--draft';
    }
  }

  showInactivoPill(evento: Evento): boolean {
    return evento.activo === false;
  }

  getPrecioMeta(evento: Evento): string {
    if (evento.es_gratis) return 'Entrada gratis';
    if (evento.precio_minimo != null) {
      return `Precio desde ${this.formatCurrency(evento.precio_minimo)}`;
    }
    return '';
  }

  /** Línea discreta bajo el título: fecha · ciudad · precio · vendidas */
  getCoverMetaLine(evento: Evento): string {
    const parts: string[] = [];
    if (evento.fecha_inicio) {
      parts.push(this.formatCoverDate(evento.fecha_inicio));
    }
    const ciudad = evento.lugar?.ciudad?.trim();
    const lugar = evento.lugar?.nombre?.trim();
    if (ciudad) {
      parts.push(ciudad);
    } else if (lugar) {
      parts.push(lugar);
    }
    if (evento.es_gratis) {
      parts.push('Gratis');
    } else if (evento.precio_minimo != null) {
      parts.push(`Desde ${this.formatCurrency(evento.precio_minimo)}`);
    }
    if (this.authService.isOrganizador()) {
      const n = this.getBoletasVendidas(evento.id) ?? 0;
      parts.push(n === 1 ? '1 vendida' : `${n} vendidas`);
    }
    return parts.join(' · ');
  }

  getCoverStatusClass(estado?: string): string {
    return getEventoEstadoCardStatusClass(estado);
  }

  private formatCoverDate(value: string | Date): string {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }

  getEventoIniciales(titulo: string): string {
    const words = titulo.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'EV';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  formatCurrency(value: number | undefined | null): string {
    return formatFinanzasMonedaExacta(value);
  }

  async loadCategorias() {
    try {
      const response = await this.categoriasService.getCategorias({ limit: 1000 });
      this.categorias = response.data;
      this.rebuildSelectOptions();
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  }

  async loadLugares() {
    try {
      const response = await this.lugaresService.getLugares({ limit: 1000 });
      this.lugares = response.data;
      this.rebuildSelectOptions();
    } catch (err) {
      console.error('Error cargando lugares:', err);
    }
  }

  async loadOrganizadores() {
    console.log('loadOrganizadores llamado');
    try {
      const organizadores = await this.usuariosService.getOrganizadores();
      console.log('Organizadores recibidos en componente:', organizadores);
      console.log('Cantidad de organizadores:', organizadores.length);
      this.organizadores = organizadores || [];
      this.rebuildSelectOptions();
      this.cdr.detectChanges();
      console.log('Organizadores asignados:', this.organizadores.length);
    } catch (err) {
      console.error('Error cargando organizadores:', err);
      this.organizadores = [];
      this.rebuildSelectOptions();
      this.cdr.detectChanges();
      this.cdr.detectChanges();
    }
  }

  async loadWompiCuentas() {
    try {
      this.wompiCuentas = await this.wompiCuentasService.getCuentasActivas();
      this.rebuildSelectOptions();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando cuentas Wompi:', err);
      this.wompiCuentas = [];
      this.rebuildSelectOptions();
      this.cdr.detectChanges();
    }
  }

  loadEventos() {
    console.log('loadEventos llamado');
    this.loading = true;
    
    // Si es organizador, filtrar por su ID
    const filters: any = {
      page: this.page,
      limit: this.limit,
      search: this.searchTerm || undefined,
      categoria_id: this.categoriaFiltro || undefined,
      estado: this.estadoFiltro || undefined
    };
    
    // Si es organizador, agregar filtro de organizador_id
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        filters.organizador_id = organizadorId;
      }
    }
    this.cdr.detectChanges();
    
    this.loadEventosInternal(filters);
  }

  private async loadEventosInternal(filters: any) {
    try {
      const response: PaginatedResponse<Evento> = await this.eventosService.getEventos(filters);
      this.eventos = response.data || [];
      this.total = response.total || 0;
      await this.loadMetricasOrganizador();
      this.loading = false;
      this.cdr.detectChanges();
      if (this.pendingEditId) {
        void this.tryOpenPendingEdit();
      }
    } catch (err) {
      console.error('Error cargando eventos:', err);
      this.loading = false;
      this.eventos = [];
      this.total = 0;
      this.cdr.detectChanges();
    }
  }

  private async loadMetricasOrganizador(): Promise<void> {
    if (!this.authService.isOrganizador()) {
      this.boletasPorEvento = new Map();
      this.resumenTotalEventos = null;
      this.resumenEventosActivos = null;
      this.resumenBoletasVendidas = null;
      this.resumenProductosVendidos = null;
      return;
    }
    const organizadorId = this.authService.getUsuarioId();
    if (!organizadorId) return;

    try {
      const stats = await this.dashboardOrganizadorService.getStats(organizadorId);
      const map = new Map<number, number>();
      for (const item of stats.top_eventos ?? []) {
        if (item?.id != null) {
          map.set(Number(item.id), Number(item.boletas_vendidas ?? 0));
        }
      }
      this.boletasPorEvento = map;
      this.resumenTotalEventos = stats.eventos_totales ?? this.total;
      this.resumenEventosActivos = stats.eventos_activos ?? null;
      this.resumenBoletasVendidas = stats.boletas_vendidas ?? null;
      this.resumenProductosVendidos = stats.productos_vendidos ?? 0;
    } catch (err) {
      console.warn('No se pudieron cargar métricas de eventos:', err);
      this.boletasPorEvento = new Map();
      this.resumenTotalEventos = this.total;
      this.resumenEventosActivos = null;
      this.resumenBoletasVendidas = null;
      this.resumenProductosVendidos = null;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openModal(evento?: Evento) {
    this.rebuildSelectOptions();
    this.wizardStep = 0;
    this.wizardPhase = 'form';
    this.savedEvento = null;
    this.editingEvento = evento || null;
    const usuario = this.authService.getUsuario();
    
    // Resetear imagen
    this.previewUrl = null;
    this.selectedFile = null;
    
    // Si es organizador, siempre usar su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      }
    }
    
    if (evento) {
      const { lugares: _lugares, lugar: _lugar, ...eventoBase } = evento as Evento & {
        lugares?: unknown;
        lugar?: unknown;
      };
      // Convertir fechas a formato datetime-local y normalizar IDs para los selects
      this.formData = {
        ...eventoBase,
        categoria_id: evento.categoria_id != null ? Number(evento.categoria_id) : undefined,
        lugar_id: evento.lugar_id != null ? Number(evento.lugar_id) : undefined,
        organizador_id: evento.organizador_id != null ? Number(evento.organizador_id) : undefined,
        wompi_cuenta_id: evento.wompi_cuenta_id != null ? Number(evento.wompi_cuenta_id) : null,
        fecha_inicio: this.formatDateForInput(evento.fecha_inicio),
        fecha_fin: this.formatDateForInput(evento.fecha_fin),
        fecha_venta_inicio: this.formatDateForInput(evento.fecha_venta_inicio),
        fecha_venta_fin: this.formatDateForInput(evento.fecha_venta_fin),
      };
      // Si hay imagen existente, mostrar preview
      if (evento.imagen_principal) {
        this.previewUrl = evento.imagen_principal;
      }
    } else {
      // Nuevo evento - establecer valores por defecto
      this.formData = {
        activo: false,
        estado: TipoEstadoEvento.BORRADOR,
        organizador_id: usuario?.id || (this.organizadores.length > 0 ? this.organizadores[0].id : 0),
        wompi_cuenta_id: null,
        es_gratis: false,
        edad_minima: 0,
        destacado: false,
        porcentaje_servicio: 8
      };
    }
    this.wizardSelectToken += 1;
    this.showModal = true;
    this.cdr.detectChanges();
  }

  trackByWizardSelectToken(_index: number, token: number): number {
    return token;
  }

  formatDateForInput(date: Date | string | undefined): string {
    if (!date) return '';
    // Usar el servicio de timezone para convertir de ISO a datetime-local
    return this.timezoneService.isoToDatetimeLocal(typeof date === 'string' ? date : date.toISOString());
  }

  closeModal() {
    this.showModal = false;
    this.editingEvento = null;
    this.formData = {};
    this.previewUrl = null;
    this.selectedFile = null;
    this.wizardStep = 0;
    this.wizardPhase = 'form';
    this.savedEvento = null;
  }

  wizardGoToStep(step: number): void {
    if (step >= 0 && step < this.activeWizardSteps.length) {
      this.wizardStep = step;
    }
  }

  wizardNextStep(): void {
    if (!this.validateWizardStep(this.wizardStep)) {
      return;
    }
    if (this.wizardStep < this.activeWizardSteps.length - 1) {
      this.wizardStep += 1;
    }
  }

  wizardPrevStep(): void {
    if (this.wizardStep > 0) {
      this.wizardStep -= 1;
    }
  }

  validateWizardStep(step: number): boolean {
    if (!this.editingEvento) {
      return this.validateCreateWizardStep(step);
    }
    return this.validateEditWizardStep(step);
  }

  private validateBasicStep(): boolean {
    if (!this.formData.titulo?.trim()) {
      this.alertService.warning('Campo requerido', 'El título es requerido');
      return false;
    }
    if (!this.formData.categoria_id) {
      this.alertService.warning('Campo requerido', 'La categoría es requerida');
      return false;
    }
    if (!this.authService.isOrganizador() && !this.formData.organizador_id) {
      this.alertService.warning('Campo requerido', 'El organizador es requerido');
      return false;
    }
    if (this.editingEvento && !this.formData.lugar_id) {
      this.alertService.warning('Campo requerido', 'El lugar es requerido');
      return false;
    }
    return true;
  }

  private validateCreateWizardStep(step: number): boolean {
    switch (step) {
      case 0:
        return this.validateBasicStep();
      case 1:
        if (!this.formData.lugar_id) {
          this.alertService.warning('Campo requerido', 'Selecciona el lugar del evento');
          return false;
        }
        if (!this.formData.fecha_inicio || !this.formData.fecha_fin) {
          this.alertService.warning('Campo requerido', 'Las fechas de inicio y fin del evento son requeridas');
          return false;
        }
        const now = this.timezoneService.isoToDatetimeLocal(new Date().toISOString());
        if (compareDatetimeLocal(this.formData.fecha_inicio as string, now) <= 0) {
          this.alertService.warning(
            'Fecha inválida',
            'El evento debe empezar en el futuro. Elige una fecha y hora posteriores a ahora.',
          );
          return false;
        }
        const rangeError = getRangeValidationMessage(this.formData.fecha_inicio, this.formData.fecha_fin);
        if (rangeError) {
          this.alertService.warning('Fechas inválidas', rangeError);
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  private validateEditWizardStep(step: number): boolean {
    switch (step) {
      case 0:
        return this.validateBasicStep();
      case 1:
        if (!this.formData.fecha_inicio || !this.formData.fecha_fin) {
          this.alertService.warning('Campo requerido', 'Las fechas de inicio y fin del evento son requeridas');
          return false;
        }
        if (!this.formData.fecha_venta_inicio || !this.formData.fecha_venta_fin) {
          this.alertService.warning('Campo requerido', 'Las fechas de venta son requeridas');
          return false;
        }
        if (!this.validateAllDateRanges()) {
          return false;
        }
        return true;
      case 3:
        if (!this.isShowcaseMode && !this.formData.es_gratis && !this.formData.wompi_cuenta_id) {
          this.alertService.warning('Campo requerido', 'La cuenta Wompi es requerida para eventos de pago');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  onCreateFechaInicioChange(value: string): void {
    this.formData.fecha_inicio = value;
    if (!value) return;
    this.formData.fecha_fin = this.addHoursToDatetimeLocal(value, 5);
    this.cdr.markForCheck();
  }

  onCreateFechaFinChange(value: string): void {
    this.formData.fecha_fin = value;
  }

  private applyCreateDefaults(): void {
    const legalDefaults = getEventoLegalDefaults();
    if (!this.formData.terminos_condiciones?.trim()) {
      this.formData.terminos_condiciones = legalDefaults.terminos_condiciones;
    }
    if (!this.formData.politica_reembolso?.trim()) {
      this.formData.politica_reembolso = legalDefaults.politica_reembolso;
    }

    const start = this.formData.fecha_inicio as string;
    const eventEnd = this.formData.fecha_fin as string;
    if (!start || !eventEnd) return;

    if (!this.formData.fecha_venta_fin) {
      this.formData.fecha_venta_fin = this.addHoursToDatetimeLocal(eventEnd, -1);
    }

    let ventaFin = this.formData.fecha_venta_fin as string;
    if (compareDatetimeLocal(ventaFin, start) <= 0 || compareDatetimeLocal(ventaFin, eventEnd) >= 0) {
      this.formData.fecha_venta_fin = this.addHoursToDatetimeLocal(eventEnd, -1);
      ventaFin = this.formData.fecha_venta_fin as string;
    }

    const now = this.timezoneService.isoToDatetimeLocal(new Date().toISOString());
    if (!this.formData.fecha_venta_inicio) {
      if (compareDatetimeLocal(now, ventaFin) < 0) {
        this.formData.fecha_venta_inicio = now;
      } else {
        const backdated = this.addHoursToDatetimeLocal(ventaFin, -24);
        this.formData.fecha_venta_inicio = getRangeValidationMessage(backdated, ventaFin)
          ? this.addHoursToDatetimeLocal(ventaFin, -1)
          : backdated;
      }
    }

    this.ensureSaleRangeValid();
  }

  private ensureSaleRangeValid(): void {
    const ventaFin = this.formData.fecha_venta_fin as string;
    const ventaInicio = this.formData.fecha_venta_inicio as string;
    if (!ventaFin || !ventaInicio) return;
    if (getRangeValidationMessage(ventaInicio, ventaFin)) {
      this.formData.fecha_venta_inicio = this.addHoursToDatetimeLocal(ventaFin, -1);
    }
  }

  private validateAllDateRanges(): boolean {
    const eventError = getRangeValidationMessage(this.formData.fecha_inicio, this.formData.fecha_fin);
    if (eventError) {
      this.alertService.warning('Fechas inválidas', eventError);
      return false;
    }
    const saleError = getRangeValidationMessage(this.formData.fecha_venta_inicio, this.formData.fecha_venta_fin);
    if (saleError) {
      this.alertService.warning('Fechas de venta inválidas', saleError);
      return false;
    }
    return true;
  }

  private addHoursToDatetimeLocal(value: string, hours: number): string {
    const iso = this.timezoneService.datetimeLocalToISO(value);
    const date = new Date(iso);
    date.setHours(date.getHours() + hours);
    return this.timezoneService.isoToDatetimeLocal(date.toISOString());
  }

  getCategoriaNombre(id?: number): string {
    if (!id) return '—';
    return this.categorias.find((c) => c.id === id)?.nombre ?? '—';
  }

  getLugarNombreById(id?: number): string {
    if (!id) return 'Sin lugar';
    const lugar = this.lugares.find((l) => l.id === id);
    if (!lugar) return 'Sin lugar';
    return lugar.ciudad ? `${lugar.nombre}, ${lugar.ciudad}` : lugar.nombre;
  }

  getOrganizadorNombre(id?: number): string {
    if (!id) return '—';
    const org = this.organizadores.find((o) => o.id === id);
    if (!org) return '—';
    return `${org.nombre || ''} ${org.apellido || ''}`.trim() || org.email;
  }

  getWompiCuentaNombre(id?: number | null): string {
    if (!id) return 'Sin cuenta asignada';
    return this.wompiCuentas.find((c) => c.id === id)?.nombre ?? `Cuenta #${id}`;
  }

  formatWizardDate(value?: string | Date): string {
    if (!value) return '—';
    return this.formatDateForInput(value) || '—';
  }

  onSuccessConfigureBoletas(): void {
    const evento = this.savedEvento;
    this.closeModal();
    if (evento) {
      void this.openBoletasDrawer(evento);
    }
  }

  onSuccessAddProductos(): void {
    const eventoId = this.savedEvento?.id;
    this.closeModal();
    if (eventoId) {
      void this.router.navigate(['/eventos', eventoId, 'operaciones'], {
        queryParams: { open: 'productos' },
      });
      return;
    }
    void this.router.navigate(['/eventos']);
  }

  onSuccessVerEvento(): void {
    const evento = this.savedEvento;
    this.closeModal();
    if (evento) {
      this.verEvento(evento);
    }
  }

  onSuccessClose(): void {
    this.closeModal();
  }
  
  openCuponesDrawer(evento: Evento): void {
    void openEventoCuponesDrawer(this.drawerService, evento);
  }

  openBoletasDrawer(evento: Evento): void {
    void openEventoBoletasDrawer(this.drawerService, evento);
  }

  // ========== MÉTODOS PARA MANEJO DE IMÁGENES ==========
  
  selectImage() {
    const input = document.getElementById('eventoImageInput') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }
  
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      try {
        // Validar tamaño (máximo 10MB)
        if (!this.imageOptimizationService.validateFileSize(file, 10)) {
          this.alertService.warning('Imagen demasiado grande', 'La imagen es demasiado grande. Máximo 10MB.');
          return;
        }
        
        this.selectedFile = file;
        
        // Crear preview optimizado
        this.previewUrl = await this.imageOptimizationService.createPreview(file, 400);
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        this.alertService.error('Error al procesar imagen', 'Error al procesar la imagen. Intenta con otro archivo.');
      }
    }
  }
  
  removeImage() {
    this.previewUrl = null;
    this.selectedFile = null;
    this.formData.imagen_principal = undefined;
    
    // Limpiar el input
    const input = document.getElementById('eventoImageInput') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
    this.cdr.detectChanges();
  }
  
  async uploadImage(): Promise<string | null> {
    if (!this.selectedFile) return null;
    
    try {
      this.uploadingImage = true;
      this.cdr.detectChanges();
      
      const usuario = this.authService.getUsuario();
      if (!usuario) {
        throw new Error('No hay usuario autenticado');
      }
      
      // Crear nombre único para el archivo
      const timestamp = Date.now();
      const fileName = `eventos/${usuario.id}/evento_${timestamp}.jpg`;
      
      const { data, error, originalSize, optimizedSize } = await this.storageService.uploadOptimizedImage('imagenes', fileName, this.selectedFile);
      
      if (error) {
        console.error('❌ Error subiendo imagen:', error);
        this.alertService.error('Error al subir imagen', 'Error al subir la imagen: ' + (error.message || 'Error desconocido'));
        return null;
      }
      
      // Obtener URL pública
      const publicUrl = this.storageService.getPublicUrl('imagenes', fileName);
      
      console.log(`✅ Imagen subida: ${this.formatFileSize(originalSize)} → ${this.formatFileSize(optimizedSize)}`);
      
      return publicUrl;
    } catch (error: any) {
      console.error('❌ Error inesperado subiendo imagen:', error);
      this.alertService.error('Error inesperado', 'Error inesperado al subir la imagen: ' + (error.message || 'Error desconocido'));
      return null;
    } finally {
      this.uploadingImage = false;
      this.cdr.detectChanges();
    }
  }
  
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async saveEvento() {
    if (!this.editingEvento) {
      if (!this.validateCreateWizardStep(0) || !this.validateCreateWizardStep(1)) {
        return;
      }
      this.applyCreateDefaults();
      if (!this.validateAllDateRanges()) {
        return;
      }
    } else {
      if (!this.validateEditWizardStep(0) || !this.validateEditWizardStep(1)) {
        return;
      }
      if (!this.formData.fecha_inicio || !this.formData.fecha_fin) {
        this.alertService.warning('Campo requerido', 'Las fechas de inicio y fin son requeridas');
        return;
      }
      if (!this.formData.fecha_venta_inicio || !this.formData.fecha_venta_fin) {
        this.alertService.warning('Campo requerido', 'Las fechas de venta son requeridas');
        return;
      }
      if (!this.validateAllDateRanges()) {
        return;
      }
    }

    // Si es organizador, asegurar que se use su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      } else {
        this.alertService.error('Error', 'No se pudo identificar el organizador');
        return;
      }
    } else if (!this.formData.organizador_id) {
      this.alertService.warning('Campo requerido', 'El organizador es requerido');
      return;
    }

    const porcentajeServicio = Number(this.formData.porcentaje_servicio ?? 0);
    if (!this.formData.es_gratis && (!Number.isFinite(porcentajeServicio) || porcentajeServicio < 8 || porcentajeServicio > 100)) {
      this.alertService.warning('Porcentaje inválido', 'El porcentaje de servicio por venta online debe estar entre 8 % y 100 %.');
      return;
    }

    if (this.editingEvento && !this.isShowcaseMode && !this.formData.es_gratis && !this.formData.wompi_cuenta_id) {
      this.alertService.warning('Campo requerido', 'La cuenta Wompi es requerida para eventos de pago');
      return;
    }

    // Subir imagen primero si hay una seleccionada
    let imagenUrl = this.formData.imagen_principal; // Mantener imagen actual por defecto
    if (this.selectedFile) {
      imagenUrl = await this.uploadImage() || imagenUrl;
      if (!imagenUrl && this.selectedFile) {
        this.alertService.error('Error al subir imagen', 'Error al subir la imagen. Intenta de nuevo.');
        return;
      }
    }

    // Preparar datos para envío
    const eventoData: Partial<Evento> = {
      ...this.formData,
      // Convertir fechas de datetime-local a ISO usando el servicio de timezone
      fecha_inicio: this.timezoneService.datetimeLocalToISO(this.formData.fecha_inicio as string),
      fecha_fin: this.timezoneService.datetimeLocalToISO(this.formData.fecha_fin as string),
      fecha_venta_inicio: this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_inicio as string),
      fecha_venta_fin: this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_fin as string),
      // Asegurar que organizador_id esté presente
      organizador_id: this.formData.organizador_id || 0,
      // Agregar URL de imagen
      imagen_principal: imagenUrl || undefined,
      porcentaje_servicio: this.formData.es_gratis ? 0 : porcentajeServicio,
      wompi_cuenta_id: this.isShowcaseMode ? null : (this.formData.wompi_cuenta_id ?? null)
    };

    if (this.isShowcaseMode) {
      eventoData.estado = TipoEstadoEvento.BORRADOR;
      eventoData.activo = false;
      eventoData.wompi_cuenta_id = null;
    }

    Object.assign(eventoData, enforceBorradorCatalogoRules(eventoData));

    // Limpiar campos vacíos opcionales y propiedades de relación que no existen en la BD
    if (!eventoData.descripcion) delete eventoData.descripcion;
    if (!eventoData.descripcion_corta) delete eventoData.descripcion_corta;
    if (!eventoData.imagen_principal) delete eventoData.imagen_principal;
    if (!eventoData.tags) delete eventoData.tags;
    if (!eventoData.terminos_condiciones) delete eventoData.terminos_condiciones;
    if (!eventoData.politica_reembolso) delete eventoData.politica_reembolso;
    if (!eventoData.url_video) delete eventoData.url_video;
    
    // Eliminar objetos de relación que vienen del join y confunden a la base de datos
    delete (eventoData as any).lugar;
    delete (eventoData as any).id;
    delete (eventoData as any).fecha_creacion;
    delete (eventoData as any).fecha_actualizacion;
    // El rango es un dato derivado de los tipos de boleta activos, no editable
    // directamente desde el evento.
    delete eventoData.precio_minimo;
    delete eventoData.precio_maximo;

    if (this.editingEvento) {
      this.saveEventoInternal(this.editingEvento.id, eventoData, true);
    } else {
      this.saveEventoInternal(null, eventoData, false);
    }
  }

  private async saveEventoInternal(id: number | null, eventoData: Partial<Evento>, isUpdate: boolean) {
    try {
      let saved: Evento;
      if (isUpdate && id) {
        saved = await this.eventosService.updateEvento(id, eventoData);
      } else {
        saved = await this.eventosService.createEvento(eventoData);
      }
      this.savedEvento = saved;
      this.closeModal();
      this.loadEventos();
      void this.router.navigate(['/eventos', saved.id, 'operaciones']);
    } catch (err: any) {
      console.error(`Error ${isUpdate ? 'guardando' : 'creando'} evento:`, err);
      this.alertService.error(`Error al ${isUpdate ? 'guardar' : 'crear'}`, `Error al ${isUpdate ? 'guardar' : 'crear'} evento: ` + (err.message || 'Error desconocido'));
    }
  }

  async toggleDestacado(evento: Evento) {
    try {
      await this.eventosService.updateEvento(evento.id, { destacado: !evento.destacado });
      this.loadEventos();
    } catch (err) {
      console.error('Error actualizando evento:', err);
      this.alertService.error('Error', 'Error al actualizar evento');
    }
  }

  async toggleActivo(evento: Evento) {
    if (this.isShowcaseMode) {
      this.alertService.info('Modo demo', 'En modo demo el evento no se publica al catálogo.');
      return;
    }
    try {
      const nextActivo = !evento.activo;
      const payload = nextActivo
        ? { activo: true, estado: TipoEstadoEvento.PUBLICADO }
        : { activo: false };
      await this.eventosService.updateEvento(evento.id, payload);
      this.loadEventos();
    } catch (err) {
      console.error('Error actualizando evento:', err);
      this.alertService.error('Error', 'Error al actualizar evento');
    }
  }

  getEstadoLabel(estado?: string): string {
    return getEventoEstadoAdminLabel(estado);
  }

  getEstadoCardLabel(estado?: string): string {
    return getEventoEstadoCardLabel(estado);
  }

  Math = Math;
}
