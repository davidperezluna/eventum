import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { ProductosService } from '../../services/productos.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvBadge, EvBadgeVariant } from '../../components/ev-badge';
import { EvEmptyState } from '../../components/ev-empty-state';
import { EvPanelSummary, EvPanelSummaryMetric } from '../../components/ev-panel-summary';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelCard } from '../../components/ev-panel-card';
import { EvPanelForm } from '../../components/ev-panel-form';
import { Producto } from '../../types';
import {
  EventoProductosDrawerResult,
  EventoProductosPanelData,
  EventoProductosView,
  ProductoBadge,
  ProductoStockStatus,
  ProductosResumen,
} from './evento-productos.types';
import {
  computeIngresoPotencial,
  computeProductosResumen,
  computeVendidoPct,
  getDisponibles,
  getProductoBadge,
  getProductoRecomendacion,
  getProductoStockStatus,
  hasPrecioEventoDistinto,
} from './evento-productos.utils';
import { formatGroupedNumber } from '../../core/number-input-format';

@Component({
  selector: 'app-evento-productos-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EvDrawerFooter,
    EvButton,
    EvFormSection,
    EvNumberInput,
    EvBadge,
    EvEmptyState,
    EvPanelSummary,
    EvNotice,
    EvPanelCard,
    EvPanelForm,
  ],
  templateUrl: './evento-productos-panel.html',
  styleUrl: './evento-productos-panel.css',
})
export class EventoProductosPanel implements OnInit, EvDrawerContent {
  private readonly productosService = inject(ProductosService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoProductosDrawerResult>);
  readonly data = inject<EventoProductosPanelData>(EV_DRAWER_DATA);

  view: EventoProductosView = 'dashboard';
  viewDirection: 'forward' | 'back' = 'forward';
  productos: Producto[] = [];
  resumen: ProductosResumen = {
    productosCount: 0,
    potencialIngresos: 0,
    unidades: 0,
    vendidas: 0,
    activos: 0,
  };

  editingProducto: Producto | null = null;
  inventarioProducto: Producto | null = null;
  formData: Partial<Producto> = { activo: true, es_licor: false, cantidad_total: 0, orden: 0 };
  cantidadAgregarInventario = 1;

  saving = false;
  menuOpenProductoId: number | null = null;

  private dataChanged = false;
  private formSnapshot = '';
  private inventorySnapshot = '';

  readonly getDisponibles = getDisponibles;
  readonly computeVendidoPct = computeVendidoPct;
  readonly computeIngresoPotencial = computeIngresoPotencial;
  readonly getProductoBadge = getProductoBadge;
  readonly getProductoStockStatus = getProductoStockStatus;
  readonly hasPrecioEventoDistinto = hasPrecioEventoDistinto;
  readonly formatPrecio = formatGroupedNumber;

  ngOnInit(): void {
    void this.loadProductos(true);
  }

  get summaryMetrics(): EvPanelSummaryMetric[] {
    return [
      { value: `$${this.formatPrecio(this.resumen.potencialIngresos)}`, label: 'Potencial de ingresos', variant: 'hero' },
      { value: this.resumen.productosCount, label: 'Productos' },
      { value: this.resumen.unidades, label: 'Unidades' },
      { value: this.resumen.vendidas, label: 'Vendidas' },
      { value: this.resumen.activos, label: 'Activos' },
    ];
  }

  get summaryHint(): string {
    if (this.resumen.vendidas === 0 && this.productos.length > 0) {
      return 'Aún no tienes ventas. Los productos estarán disponibles cuando el evento esté activo.';
    }
    return '';
  }

  get panelInsight(): string | null {
    const reco = getProductoRecomendacion(this.productos);
    if (!reco || this.productos.length === 0) {
      return null;
    }
    return reco.message;
  }

  badgeVariant(badge: ProductoBadge): EvBadgeVariant {
    switch (badge) {
      case 'activo':
        return 'success';
      case 'stock_bajo':
        return 'warning';
      case 'sin_stock':
        return 'danger';
      case 'inactivo':
        return 'neutral';
    }
  }

  statusDotClass(badge: ProductoBadge): string {
    switch (badge) {
      case 'activo':
        return 'ev-panel-card__status-dot--success';
      case 'stock_bajo':
        return 'ev-panel-card__status-dot--warning';
      case 'sin_stock':
        return 'ev-panel-card__status-dot--danger';
      default:
        return '';
    }
  }

  inventoryStatusDotClass(status: ProductoStockStatus): string {
    switch (status) {
      case 'suficiente':
        return 'ev-panel-card__status-dot--success';
      case 'bajo':
        return 'ev-panel-card__status-dot--warning';
      case 'sin_stock':
        return 'ev-panel-card__status-dot--danger';
    }
  }

  get isCreateMode(): boolean {
    return !this.editingProducto;
  }

  get formTitle(): string {
    if (this.isCreateMode) {
      return 'Crear producto';
    }
    return `Editar ${this.editingProducto?.nombre ?? 'producto'}`;
  }

  get inventoryTitle(): string {
    return `Inventario · ${this.inventarioProducto?.nombre ?? ''}`;
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

  get showTopCta(): boolean {
    return this.productos.length > 0;
  }

  badgeLabel(badge: ProductoBadge): string {
    switch (badge) {
      case 'activo':
        return 'Activo';
      case 'stock_bajo':
        return 'Stock bajo';
      case 'sin_stock':
        return 'Sin stock';
      case 'inactivo':
        return 'Inactivo';
    }
  }

  stockStatusLabel(status: ProductoStockStatus): string {
    switch (status) {
      case 'suficiente':
        return 'Stock suficiente';
      case 'bajo':
        return 'Stock bajo';
      case 'sin_stock':
        return 'Sin stock';
    }
  }

  stockStatusDotClass(status: ProductoStockStatus): string {
    return this.inventoryStatusDotClass(status);
  }

  badgeDotClass(badge: ProductoBadge): string {
    return this.statusDotClass(badge);
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

  toggleMenu(productoId: number, event: Event): void {
    event.stopPropagation();
    this.menuOpenProductoId = this.menuOpenProductoId === productoId ? null : productoId;
    this.cdr.detectChanges();
  }

  closeMenu(): void {
    this.menuOpenProductoId = null;
  }

  async loadProductos(showSkeleton = false): Promise<void> {
    if (showSkeleton) {
      this.drawerRef.setLoading(true);
    }
    try {
      this.productos = await this.productosService.getProductosPorEvento(this.data.eventoId, false);
      this.resumen = computeProductosResumen(this.productos);
    } catch (err) {
      console.error('Error cargando productos:', err);
      this.alertService.error('Error', 'No se pudieron cargar los productos');
      this.productos = [];
      this.resumen = computeProductosResumen([]);
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
    this.editingProducto = null;
    this.inventarioProducto = null;
    this.closeMenu();
    this.syncDrawerHeader();
    this.drawerRef.markPristine();
    this.cdr.detectChanges();
  }

  openCreateForm(): void {
    void this.openForm(null);
  }

  async openForm(producto: Producto | null): Promise<void> {
    if (!(await this.confirmLeaveCurrentView())) {
      return;
    }

    this.viewDirection = 'forward';
    this.closeMenu();

    if (!producto) {
      this.editingProducto = null;
      this.formData = {
        evento_id: this.data.eventoId,
        activo: true,
        es_licor: false,
        cantidad_total: 0,
        cantidad_vendidas: 0,
        orden: 0,
        precio: 0,
        precio_evento: 0,
      };
    } else {
      let fresh = producto;
      try {
        fresh = await this.productosService.getProductoById(producto.id);
      } catch (err) {
        console.error('No se pudo cargar el producto:', err);
      }
      this.editingProducto = fresh;
      this.formData = {
        evento_id: this.data.eventoId,
        nombre: fresh.nombre,
        descripcion: fresh.descripcion,
        precio: fresh.precio,
        precio_evento: fresh.precio_evento ?? fresh.precio,
        cantidad_total: fresh.cantidad_total,
        limite_por_persona: fresh.limite_por_persona,
        imagen_url: fresh.imagen_url,
        es_licor: fresh.es_licor ?? false,
        activo: fresh.activo !== false,
        orden: fresh.orden ?? 0,
      };
    }

    this.captureFormSnapshot();
    this.view = 'form';
    this.syncDrawerHeader();
    this.drawerRef.markPristine();
    this.cdr.detectChanges();
  }

  async openInventory(producto: Producto): Promise<void> {
    if (!(await this.confirmLeaveCurrentView())) {
      return;
    }

    this.viewDirection = 'forward';
    this.closeMenu();

    try {
      this.inventarioProducto = await this.productosService.getProductoById(producto.id);
    } catch (err) {
      console.error('No se pudo cargar inventario del producto:', err);
      this.inventarioProducto = producto;
    }

    this.cantidadAgregarInventario = 1;
    this.captureInventorySnapshot();
    this.view = 'inventory';
    this.syncDrawerHeader();
    this.drawerRef.markPristine();
    this.cdr.detectChanges();
  }

  async saveForm(): Promise<void> {
    if (this.saving || !this.isFormDirty()) {
      return;
    }

    if (!this.formData.nombre?.trim()) {
      this.alertService.warning('Datos incompletos', 'El nombre es obligatorio.');
      return;
    }

    const precioPreventa = Number(this.formData.precio ?? 0);
    const precioEvento = Number(this.formData.precio_evento ?? 0);
    if (!Number.isFinite(precioPreventa) || precioPreventa < 0 || !Number.isFinite(precioEvento) || precioEvento < 0) {
      this.alertService.warning('Precio inválido', 'Los precios deben ser números iguales o mayores a 0.');
      return;
    }

    if (!this.editingProducto) {
      const stock = Number(this.formData.cantidad_total ?? 0);
      if (!Number.isFinite(stock) || stock <= 0) {
        this.alertService.warning('Stock inválido', 'El stock inicial debe ser mayor a 0.');
        return;
      }
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      const payload: Partial<Producto> = {
        evento_id: this.data.eventoId,
        nombre: this.formData.nombre?.trim(),
        descripcion: this.formData.descripcion,
        precio: precioPreventa,
        precio_evento: precioEvento,
        limite_por_persona: this.formData.limite_por_persona,
        imagen_url: this.formData.imagen_url,
        es_licor: !!this.formData.es_licor,
        activo: this.formData.activo !== false,
        orden: Number(this.formData.orden ?? 0),
      };

      if (!payload.descripcion) {
        delete payload.descripcion;
      }
      if (!payload.limite_por_persona) {
        delete payload.limite_por_persona;
      }
      if (!payload.imagen_url) {
        delete payload.imagen_url;
      }

      if (this.editingProducto) {
        await this.productosService.updateProducto(this.editingProducto.id, payload);
      } else {
        await this.productosService.createProducto({
          ...payload,
          cantidad_total: Math.floor(Number(this.formData.cantidad_total ?? 0)),
          cantidad_vendidas: 0,
        });
      }

      this.dataChanged = true;
      this.alertService.success(this.editingProducto ? 'Actualizado' : 'Guardado', this.editingProducto ? 'El producto se actualizó correctamente.' : 'El producto se creó correctamente.');
      await this.loadProductos();
      this.notifyParentChange();
      this.captureFormSnapshot();
      this.drawerRef.markPristine();
      await this.goToDashboard(true);
    } catch (err: unknown) {
      console.error('Error guardando producto:', err);
      const message = err instanceof Error ? err.message : 'No se pudo guardar el producto';
      this.alertService.error('Error', message);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveInventory(): Promise<void> {
    if (this.saving || !this.inventarioProducto || !this.isInventoryDirty()) {
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
      const nuevoTotal = Number(this.inventarioProducto.cantidad_total ?? 0) + cantidad;
      await this.productosService.updateProducto(this.inventarioProducto.id, {
        cantidad_total: nuevoTotal,
      });
      this.dataChanged = true;
      this.alertService.success('Guardado', `Se agregaron ${cantidad} unidad(es) al inventario.`);
      await this.loadProductos();
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

  async desactivarProducto(producto: Producto): Promise<void> {
    this.closeMenu();
    const confirmed = await this.alertService.confirm(
      'Desactivar producto',
      `¿Estás seguro de desactivar "${producto.nombre}"?`,
      'Sí, desactivar',
      'Cancelar',
    );
    if (!confirmed) {
      return;
    }

    try {
      await this.productosService.updateProducto(producto.id, { activo: false });
      this.dataChanged = true;
      this.alertService.success('Desactivado', 'El producto fue desactivado.');
      await this.loadProductos();
      this.notifyParentChange();
    } catch (err) {
      console.error('Error desactivando producto:', err);
      this.alertService.error('Error', 'No se pudo desactivar el producto');
    }
  }

  closePanel(): void {
    void this.drawerRef.close({
      changed: this.dataChanged,
      productos: this.dataChanged ? this.productos : undefined,
    });
  }

  private notifyParentChange(): void {
    this.data.onChanged?.({
      changed: true,
      productos: this.productos,
    });
  }

  private syncDrawerHeader(): void {
    switch (this.view) {
      case 'dashboard':
        this.drawerRef.setTitle('Ventas adicionales');
        this.drawerRef.setDescription(this.data.eventoTitulo);
        this.drawerRef.setIcon('local_mall');
        break;
      case 'form':
        this.drawerRef.setTitle(this.formTitle);
        this.drawerRef.setDescription(this.data.eventoTitulo);
        this.drawerRef.setIcon('edit');
        break;
      case 'inventory':
        this.drawerRef.setTitle(this.inventoryTitle);
        this.drawerRef.setDescription(this.data.eventoTitulo);
        this.drawerRef.setIcon('inventory_2');
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

  private captureFormSnapshot(): void {
    this.formSnapshot = JSON.stringify(this.serializeFormSnapshot());
  }

  private serializeFormSnapshot(): Record<string, unknown> {
    return {
      nombre: this.formData.nombre?.trim() ?? '',
      descripcion: this.formData.descripcion ?? '',
      precio: Number(this.formData.precio ?? 0),
      precio_evento: Number(this.formData.precio_evento ?? 0),
      cantidad_total: Number(this.formData.cantidad_total ?? 0),
      limite_por_persona: this.formData.limite_por_persona ?? null,
      imagen_url: this.formData.imagen_url ?? '',
      es_licor: !!this.formData.es_licor,
      activo: this.formData.activo !== false,
      orden: Number(this.formData.orden ?? 0),
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
