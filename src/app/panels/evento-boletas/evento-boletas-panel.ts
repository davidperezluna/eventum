import { Component, OnInit, inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, DrawerService, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { BoletasService } from '../../services/boletas.service';
import { StorageService } from '../../services/storage.service';
import { TimezoneService } from '../../services/timezone.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvDatetimePeriod } from '../../components/ev-datetime-period/ev-datetime-period';
import { EvBadge, EvBadgeVariant } from '../../components/ev-badge';
import { EvEmptyState } from '../../components/ev-empty-state';
import { EvPanelSummary, EvPanelSummaryMetric } from '../../components/ev-panel-summary';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelCard } from '../../components/ev-panel-card';
import { EvPanelForm } from '../../components/ev-panel-form';
import { TipoBoleta } from '../../types';
import {
  EventoBoletasDrawerResult,
  EventoBoletasPanelData,
  EventoBoletasView,
  BoletasResumen,
  TipoBoletaBadge,
} from './evento-boletas.types';
import {
  computeBoletasResumen,
  computeOcupacionPct,
  getPalcoLabel,
  getTipoBoletaBadge,
  isVentaActiva,
} from './evento-boletas.utils';
import { formatGroupedNumber } from '../../core/number-input-format';
import { eventoTieneVentanaVentaGlobal } from '../../core/catalogo-compra-evento';
import { openEventoPalcosDrawer } from '../evento-palcos';

@Component({
  selector: 'app-evento-boletas-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EvDrawerFooter,
    EvButton,
    EvFormSection,
    EvNumberInput,
    EvDatetimePeriod,
    EvBadge,
    EvEmptyState,
    EvPanelSummary,
    EvNotice,
    EvPanelCard,
    EvPanelForm,
  ],
  templateUrl: './evento-boletas-panel.html',
  styleUrl: './evento-boletas-panel.css',
})
export class EventoBoletasPanel implements OnInit, EvDrawerContent {
  @ViewChild('mapaPalcoInput') mapaPalcoInput?: ElementRef<HTMLInputElement>;

  private readonly boletasService = inject(BoletasService);
  private readonly storageService = inject(StorageService);
  private readonly timezoneService = inject(TimezoneService);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly drawerService = inject(DrawerService);
  readonly drawerRef = inject(DrawerRef<EventoBoletasDrawerResult>);
  readonly data = inject<EventoBoletasPanelData>(EV_DRAWER_DATA);

  view: EventoBoletasView = 'dashboard';
  viewDirection: 'forward' | 'back' = 'forward';
  tipos: TipoBoleta[] = [];
  resumen: BoletasResumen = { tiposCount: 0, totalBoletas: 0, vendidas: 0, ocupacionPct: 0 };

  editingTipo: TipoBoleta | null = null;
  inventarioTipo: TipoBoleta | null = null;
  formData: Partial<TipoBoleta> = { activo: true };
  cantidadAgregarInventario = 1;

  selectedMapaPalcoFile: File | null = null;
  previewMapaPalco: string | null = null;
  uploadingMapaPalco = false;
  saving = false;
  menuOpenTipoId: number | null = null;

  private dataChanged = false;
  private formSnapshot = '';
  private inventorySnapshot = '';

  readonly getOcupacionPct = computeOcupacionPct;
  readonly getTipoBoletaBadge = getTipoBoletaBadge;
  readonly isVentaActiva = isVentaActiva;
  readonly getPalcoLabel = getPalcoLabel;
  readonly formatPrecio = formatGroupedNumber;

  ngOnInit(): void {
    void this.loadTipos(true);
  }

  get usaVentanaVentaEvento(): boolean {
    return eventoTieneVentanaVentaGlobal({
      fecha_venta_inicio: this.data.eventoFechaVentaInicio,
      fecha_venta_fin: this.data.eventoFechaVentaFin,
    });
  }

  get summaryMetrics(): EvPanelSummaryMetric[] {
    return [
      { value: this.resumen.tiposCount, label: 'tipos' },
      { value: this.resumen.totalBoletas, label: 'boletas' },
      { value: this.resumen.vendidas, label: 'vendidas' },
      { value: `${this.resumen.ocupacionPct}%`, label: 'ocupación', variant: 'accent' },
    ];
  }

  get panelInsight(): { message: string; ctaLabel: string } | null {
    if (this.tipos.length === 1) {
      return {
        message: 'Agrega una boleta VIP para aumentar el ingreso promedio.',
        ctaLabel: 'Crear tipo',
      };
    }
    return null;
  }

  badgeVariant(badge: TipoBoletaBadge): EvBadgeVariant {
    switch (badge) {
      case 'agotada':
        return 'danger';
      case 'agotandose':
        return 'warning';
      case 'inactiva':
        return 'neutral';
      default:
        return 'success';
    }
  }

  statusDotClass(active: boolean): string {
    return active ? 'ev-panel-card__status-dot--success' : '';
  }

  get isCreateMode(): boolean {
    return !this.editingTipo;
  }

  get formTitle(): string {
    if (this.isCreateMode) {
      return 'Crear tipo de boleta';
    }
    return `Editar ${this.editingTipo?.nombre ?? 'tipo'}`;
  }

  get inventoryTitle(): string {
    return `Inventario · ${this.inventarioTipo?.nombre ?? ''}`;
  }

  get showFooter(): boolean {
    return this.view === 'form' || this.view === 'inventory';
  }

  get canSaveForm(): boolean {
    return this.isFormDirty();
  }

  get canSaveInventory(): boolean {
    return this.isInventoryDirty();
  }

  get mostrarCampoMapaPalcos(): boolean {
    return !!this.formData.es_palco;
  }

  get mostrarPersonasPorPalco(): boolean {
    return !!this.formData.es_palco;
  }

  get cantidadTotalLabel(): string {
    return this.mostrarCampoMapaPalcos ? 'Cantidad de palcos *' : 'Cantidad total *';
  }

  get cantidadTotalFieldLabel(): string {
    return this.mostrarCampoMapaPalcos ? 'Cantidad de palcos' : 'Cantidad total';
  }

  badgeLabel(badge: TipoBoletaBadge | null): string {
    switch (badge) {
      case 'agotada':
        return 'Agotada';
      case 'agotandose':
        return 'Agotándose';
      case 'inactiva':
        return 'Inactiva';
      default:
        return '';
    }
  }

  evDrawerHasUnsavedChanges(): boolean {
    if (this.view === 'form') {
      return this.isFormDirty();
    }
    if (this.view === 'inventory') {
      return this.isInventoryDirty();
    }
    return false;
  }

  onFormChange(): void {
    if (this.isFormDirty()) {
      this.drawerRef.markDirty();
    } else {
      this.drawerRef.markPristine();
    }
  }

  onInventoryChange(): void {
    if (this.isInventoryDirty()) {
      this.drawerRef.markDirty();
    } else {
      this.drawerRef.markPristine();
    }
  }

  toggleMenu(tipoId: number, event: Event): void {
    event.stopPropagation();
    this.menuOpenTipoId = this.menuOpenTipoId === tipoId ? null : tipoId;
    this.cdr.detectChanges();
  }

  closeMenu(): void {
    this.menuOpenTipoId = null;
  }

  async loadTipos(showSkeleton = false): Promise<void> {
    if (showSkeleton) {
      this.drawerRef.setLoading(true);
    }
    try {
      this.tipos = await this.boletasService.getTiposBoleta(this.data.eventoId);
      this.resumen = computeBoletasResumen(this.tipos);
    } catch (err) {
      console.error('Error cargando tipos de boleta:', err);
      this.alertService.error('Error', 'No se pudieron cargar los tipos de boleta');
      this.tipos = [];
      this.resumen = computeBoletasResumen([]);
    } finally {
      if (showSkeleton) {
        this.drawerRef.setLoading(false);
      }
      this.cdr.detectChanges();
    }
  }

  async goToDashboard(force = false): Promise<void> {
    if (!force && !(await this.confirmLeaveCurrentView())) {
      return;
    }
    this.viewDirection = 'back';
    this.view = 'dashboard';
    this.editingTipo = null;
    this.inventarioTipo = null;
    this.closeMenu();
    this.syncDrawerHeader();
    this.drawerRef.markPristine();
    this.cdr.detectChanges();
  }

  openCreateForm(): void {
    void this.openForm(null);
  }

  async openForm(tipo: TipoBoleta | null): Promise<void> {
    if (!(await this.confirmLeaveCurrentView())) {
      return;
    }

    this.viewDirection = 'forward';
    this.closeMenu();

    if (!tipo) {
      this.editingTipo = null;
      this.selectedMapaPalcoFile = null;
      this.previewMapaPalco = null;
      this.formData = {
        evento_id: this.data.eventoId,
        activo: true,
        cantidad_vendidas: 0,
        personas_por_unidad: 1,
        es_palco: false,
      };
    } else {
      let fresh = tipo;
      try {
        fresh = await this.boletasService.getTipoBoletaById(tipo.id);
      } catch (err) {
        console.error('No se pudo cargar el tipo de boleta:', err);
      }
      this.editingTipo = fresh;
      this.selectedMapaPalcoFile = null;
      this.previewMapaPalco = fresh.imagen_mapa_palcos || null;
      this.formData = {
        evento_id: this.data.eventoId,
        nombre: fresh.nombre,
        descripcion: fresh.descripcion,
        precio: fresh.precio,
        fecha_venta_inicio: fresh.fecha_venta_inicio
          ? this.formatDateForInput(fresh.fecha_venta_inicio)
          : undefined,
        fecha_venta_fin: fresh.fecha_venta_fin
          ? this.formatDateForInput(fresh.fecha_venta_fin)
          : undefined,
        limite_por_persona: fresh.limite_por_persona,
        activo: fresh.activo,
        es_palco: fresh.es_palco ?? false,
        personas_por_unidad: fresh.es_palco
          ? Math.max(2, fresh.personas_por_unidad ?? 4)
          : 1,
        imagen_mapa_palcos: fresh.imagen_mapa_palcos,
      };
    }

    this.captureFormSnapshot();
    this.view = 'form';
    this.syncDrawerHeader();
    this.drawerRef.markPristine();
    this.cdr.detectChanges();
  }

  async openInventory(tipo: TipoBoleta): Promise<void> {
    if (!(await this.confirmLeaveCurrentView())) {
      return;
    }

    this.viewDirection = 'forward';
    this.closeMenu();

    try {
      this.inventarioTipo = await this.boletasService.getTipoBoletaById(tipo.id);
    } catch (err) {
      console.error('No se pudo cargar inventario del tipo:', err);
      this.inventarioTipo = tipo;
    }

    this.cantidadAgregarInventario = 1;
    this.captureInventorySnapshot();
    this.view = 'inventory';
    this.syncDrawerHeader();
    this.drawerRef.markPristine();
    this.cdr.detectChanges();
  }

  calcularCantidadesTipoBoleta(): void {
    if (!this.editingTipo && this.formData.cantidad_total) {
      this.formData.cantidad_disponibles = this.formData.cantidad_total;
      this.formData.cantidad_vendidas = 0;
    }
    this.onFormChange();
  }

  onEsPalcoChange(): void {
    if (!this.formData.es_palco) {
      this.formData.personas_por_unidad = 1;
      this.selectedMapaPalcoFile = null;
      this.previewMapaPalco = null;
      this.formData.imagen_mapa_palcos = undefined;
    } else if (Number(this.formData.personas_por_unidad ?? 1) <= 1) {
      this.formData.personas_por_unidad = 4;
    }
    this.calcularCantidadesTipoBoleta();
  }

  triggerMapaSelect(): void {
    this.mapaPalcoInput?.nativeElement.click();
  }

  onMapaPalcoFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.alertService.warning('Archivo grande', 'Máximo 10 MB.');
      return;
    }
    this.selectedMapaPalcoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.previewMapaPalco = reader.result as string;
      this.onFormChange();
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  quitarImagenMapaPalco(): void {
    this.selectedMapaPalcoFile = null;
    this.previewMapaPalco = null;
    this.formData.imagen_mapa_palcos = undefined;
    if (this.mapaPalcoInput?.nativeElement) {
      this.mapaPalcoInput.nativeElement.value = '';
    }
    this.onFormChange();
    this.cdr.detectChanges();
  }

  async saveForm(): Promise<void> {
    if (this.saving || !this.isFormDirty()) {
      return;
    }

    if (!this.formData.nombre?.trim()) {
      this.alertService.warning('Campo requerido', 'El nombre es requerido');
      return;
    }
    if (this.formData.precio == null || this.formData.precio < 0) {
      this.alertService.warning('Valor inválido', 'El precio debe ser mayor o igual a 0');
      return;
    }
    if (!this.editingTipo && (!this.formData.cantidad_total || this.formData.cantidad_total <= 0)) {
      this.alertService.warning('Valor inválido', 'La cantidad total debe ser mayor a 0');
      return;
    }

    const pp = Number(this.formData.personas_por_unidad ?? 1);
    if (this.formData.es_palco && (!Number.isFinite(pp) || pp < 2)) {
      this.alertService.warning('Valor inválido', 'Indica cuántas personas incluye cada palco o paquete (mínimo 2).');
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      let tipoData: Partial<TipoBoleta>;
      if (this.editingTipo) {
        tipoData = this.buildTipoBoletaUpdatePayload();
      } else {
        this.calcularCantidadesTipoBoleta();
        tipoData = {
          ...this.formData,
          evento_id: this.data.eventoId,
          personas_por_unidad: this.resolvePersonasPorUnidad(),
          es_palco: !!this.formData.es_palco,
          cantidad_vendidas: 0,
          cantidad_disponibles: this.formData.cantidad_total,
          fecha_venta_inicio: this.formData.fecha_venta_inicio
            ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_inicio as string)
            : undefined,
          fecha_venta_fin: this.formData.fecha_venta_fin
            ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_fin as string)
            : undefined,
        };
        this.applyVentanaVentaTipoPayload(tipoData);
        this.cleanOptionalTipoFields(tipoData);
      }

      if (this.mostrarCampoMapaPalcos) {
        if (this.selectedMapaPalcoFile) {
          const urlMapa = await this.subirImagenMapaPalcos();
          if (!urlMapa) {
            return;
          }
          tipoData.imagen_mapa_palcos = urlMapa;
        }
      } else if (this.editingTipo) {
        tipoData.imagen_mapa_palcos = undefined;
      } else {
        delete tipoData.imagen_mapa_palcos;
      }

      if (this.editingTipo) {
        await this.boletasService.updateTipoBoleta(this.editingTipo.id, tipoData);
      } else {
        await this.boletasService.createTipoBoleta(tipoData);
      }

      this.dataChanged = true;
      this.alertService.success(this.editingTipo ? 'Actualizado' : 'Guardado', 'El tipo de boleta se guardó correctamente.');
      await this.loadTipos();
      this.notifyParentChange();
      this.captureFormSnapshot();
      this.drawerRef.markPristine();
      await this.goToDashboard(true);
    } catch (err: unknown) {
      console.error('Error guardando tipo de boleta:', err);
      const message = err instanceof Error ? err.message : 'No se pudo guardar el tipo de boleta';
      this.alertService.error('Error', message);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveInventory(): Promise<void> {
    if (this.saving || !this.inventarioTipo || !this.isInventoryDirty()) {
      return;
    }

    const cantidad = Math.floor(Number(this.cantidadAgregarInventario));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      this.alertService.warning('Valor inválido', 'Indica cuántas unidades quieres agregar al inventario');
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      await this.boletasService.agregarInventarioTipoBoleta(this.inventarioTipo.id, cantidad);
      this.dataChanged = true;
      this.alertService.success('Guardado', `Se agregaron ${cantidad} unidad(es) al inventario.`);
      await this.loadTipos();
      this.notifyParentChange();
      this.captureInventorySnapshot();
      this.drawerRef.markPristine();
      await this.goToDashboard(true);
    } catch (err: unknown) {
      console.error('Error agregando inventario:', err);
      const message = err instanceof Error ? err.message : 'No se pudo agregar inventario';
      this.alertService.error('Error', message);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async desactivarTipo(tipo: TipoBoleta): Promise<void> {
    this.closeMenu();
    const confirmed = await this.alertService.confirm(
      'Desactivar tipo de boleta',
      `¿Estás seguro de desactivar "${tipo.nombre}"?`,
      'Sí, desactivar',
      'Cancelar',
    );
    if (!confirmed) {
      return;
    }

    try {
      await this.boletasService.updateTipoBoleta(tipo.id, { activo: false });
      this.dataChanged = true;
      this.alertService.success('Desactivado', 'El tipo de boleta fue desactivado.');
      await this.loadTipos();
      this.notifyParentChange();
    } catch (err: unknown) {
      console.error('Error desactivando tipo de boleta:', err);
      this.alertService.error('Error', 'No se pudo desactivar el tipo de boleta');
    }
  }

  puedeReservarPalcos(tipo: TipoBoleta): boolean {
    return (this.authService.isOrganizador() || this.authService.isAdministrador()) && !!tipo.es_palco;
  }

  async irAReservarPalcos(): Promise<void> {
    this.closeMenu();
    const closed = await this.drawerRef.close({
      changed: this.dataChanged,
      tiposBoleta: this.dataChanged ? this.tipos : undefined,
    });
    if (closed) {
      await this.drawerRef.afterClosed();
      openEventoPalcosDrawer(this.drawerService, {
        id: this.data.eventoId,
        titulo: this.data.eventoTitulo,
      });
    }
  }

  closePanel(): void {
    void this.drawerRef.close({
      changed: this.dataChanged,
      tiposBoleta: this.dataChanged ? this.tipos : undefined,
    });
  }

  private notifyParentChange(): void {
    this.data.onChanged?.({
      changed: true,
      tiposBoleta: this.tipos,
    });
  }

  private syncDrawerHeader(): void {
    switch (this.view) {
      case 'dashboard':
        this.drawerRef.setTitle('Boletas');
        this.drawerRef.setDescription(this.data.eventoTitulo);
        this.drawerRef.setIcon('confirmation_number');
        this.drawerRef.resize('lg');
        break;
      case 'form':
        this.drawerRef.setTitle(this.formTitle);
        this.drawerRef.setDescription(this.data.eventoTitulo);
        this.drawerRef.setIcon('edit');
        this.drawerRef.resize('md');
        break;
      case 'inventory':
        this.drawerRef.setTitle(this.inventoryTitle);
        this.drawerRef.setDescription(this.data.eventoTitulo);
        this.drawerRef.setIcon('inventory_2');
        this.drawerRef.resize('md');
        break;
    }
  }

  private async confirmLeaveCurrentView(): Promise<boolean> {
    if (!this.evDrawerHasUnsavedChanges()) {
      return true;
    }
    return this.alertService.confirm(
      'Cambios sin guardar',
      'Tienes cambios que no se han guardado. ¿Deseas salir de esta vista?',
      'Salir sin guardar',
      'Seguir editando',
    );
  }

  private resolvePersonasPorUnidad(): number {
    if (!this.formData.es_palco) {
      return 1;
    }
    const pp = Number(this.formData.personas_por_unidad ?? 1);
    return Math.max(2, Math.floor(pp));
  }

  private buildTipoBoletaUpdatePayload(): Partial<TipoBoleta> {
    const payload: Partial<TipoBoleta> = {
      evento_id: this.data.eventoId,
      nombre: this.formData.nombre?.trim(),
      descripcion: this.formData.descripcion,
      precio: this.formData.precio,
      limite_por_persona: this.formData.limite_por_persona,
      activo: this.formData.activo,
      personas_por_unidad: this.resolvePersonasPorUnidad(),
      es_palco: !!this.formData.es_palco,
      fecha_venta_inicio: this.formData.fecha_venta_inicio
        ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_inicio as string)
        : undefined,
      fecha_venta_fin: this.formData.fecha_venta_fin
        ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_fin as string)
        : undefined,
    };
    this.applyVentanaVentaTipoPayload(payload);
    this.cleanOptionalTipoFields(payload);
    return payload;
  }

  private applyVentanaVentaTipoPayload(payload: Partial<TipoBoleta>): void {
    if (!this.usaVentanaVentaEvento) {
      return;
    }
    delete payload.fecha_venta_inicio;
    delete payload.fecha_venta_fin;
    if (this.editingTipo) {
      Object.assign(payload, { fecha_venta_inicio: null, fecha_venta_fin: null });
    }
  }

  private cleanOptionalTipoFields(payload: Partial<TipoBoleta>): void {
    if (!payload.descripcion) delete payload.descripcion;
    if (!payload.limite_por_persona) delete payload.limite_por_persona;
    if (!payload.fecha_venta_inicio) delete payload.fecha_venta_inicio;
    if (!payload.fecha_venta_fin) delete payload.fecha_venta_fin;
  }

  private formatDateForInput(date: Date | string | undefined): string {
    if (!date) {
      return '';
    }
    return this.timezoneService.isoToDatetimeLocal(typeof date === 'string' ? date : date.toISOString());
  }

  private async subirImagenMapaPalcos(): Promise<string | null> {
    if (!this.selectedMapaPalcoFile) {
      return null;
    }
    const usuario = this.authService.getUsuario();
    if (!usuario) {
      this.alertService.warning('Sesión', 'Debes iniciar sesión para subir el mapa.');
      return null;
    }

    this.uploadingMapaPalco = true;
    this.cdr.detectChanges();

    try {
      const fileName = `palcos/${usuario.id}/mapa_${Date.now()}.jpg`;
      const { error } = await this.storageService.uploadOptimizedImage(
        'imagenes',
        fileName,
        this.selectedMapaPalcoFile,
      );
      if (error) {
        throw error;
      }
      return this.storageService.getPublicUrl('imagenes', fileName);
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'No se pudo subir la imagen';
      this.alertService.error('Error', message);
      return null;
    } finally {
      this.uploadingMapaPalco = false;
      this.cdr.detectChanges();
    }
  }

  private captureFormSnapshot(): void {
    this.formSnapshot = JSON.stringify(this.serializeFormSnapshot());
  }

  private serializeFormSnapshot(): Record<string, unknown> {
    return {
      nombre: this.formData.nombre?.trim() ?? '',
      descripcion: this.formData.descripcion ?? '',
      precio: Number(this.formData.precio ?? 0),
      cantidad_total: Number(this.formData.cantidad_total ?? 0),
      fecha_venta_inicio: this.formData.fecha_venta_inicio ?? '',
      fecha_venta_fin: this.formData.fecha_venta_fin ?? '',
      limite_por_persona: this.formData.limite_por_persona ?? null,
      activo: this.formData.activo !== false,
      personas_por_unidad: Number(this.formData.personas_por_unidad ?? 1),
      es_palco: !!this.formData.es_palco,
      hasMapaFile: !!this.selectedMapaPalcoFile,
      mapaRemoved: !this.previewMapaPalco && !this.selectedMapaPalcoFile,
    };
  }

  private isFormDirty(): boolean {
    return JSON.stringify(this.serializeFormSnapshot()) !== this.formSnapshot;
  }

  private captureInventorySnapshot(): void {
    this.inventorySnapshot = String(this.cantidadAgregarInventario);
  }

  private isInventoryDirty(): boolean {
    return String(this.cantidadAgregarInventario) !== this.inventorySnapshot;
  }
}
