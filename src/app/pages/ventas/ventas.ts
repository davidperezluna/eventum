import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ComprasService } from '../../services/compras.service';
import { AlertService } from '../../services/alert.service';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { UsuariosService } from '../../services/usuarios.service';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { TransaccionesCheckoutService } from '../../services/transacciones-checkout.service';
import {
  Compra,
  Evento,
  PaginatedResponse,
  Palco,
  TipoBoleta,
  TipoEstadoCompra,
  TipoEstadoPago,
  Usuario,
} from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

interface LineaVentaManual {
  id: number;
  tipo_boleta_id: number | null;
  cantidad: number;
  palco_ids: Array<number | null>;
}

@Component({
  selector: 'app-ventas',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  compras: Compra[] = [];
  comprasConCheckout = new Set<number>();
  deletingCompraId: number | null = null;
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;
  eventoFiltro: number | null = null;
  eventosFiltro: Evento[] = [];

  showModal = false;
  editingCompra: Compra | null = null;
  formData: Partial<Compra> = {};
  
  // Modales para mostrar detalles
  showClienteModal = false;
  showEventoModal = false;
  selectedCliente: Compra['cliente'] | null = null;
  selectedEvento: Compra['evento'] | null = null;

  // Venta manual sin Wompi (misma salida que compra 100% off)
  showVentaManualModal = false;
  savingVentaManual = false;
  loadingVentaManualClientes = false;
  loadingVentaManualEventos = false;
  loadingVentaManualTipos = false;
  ventaManualClienteId: number | null = null;
  ventaManualEventoId: number | null = null;
  ventaManualNotas = '';
  ventaManualClienteSearch = '';
  ventaManualEventoSearch = '';
  ventaManualClientes: Usuario[] = [];
  ventaManualEventos: Evento[] = [];
  ventaManualTipos: TipoBoleta[] = [];
  ventaManualLineas: LineaVentaManual[] = [];
  private ventaManualLineaSeq = 1;
  private palcosDisponiblesPorTipoId = new Map<number, Palco[]>();

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

  constructor(
    private comprasService: ComprasService,
    private alertService: AlertService,
    private comprasClienteService: ComprasClienteService,
    private usuariosService: UsuariosService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private transaccionesCheckoutService: TransaccionesCheckoutService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    void this.cargarEventosFiltro();
    this.loadCompras();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ======== Venta manual ========

  get clienteVentaManualSeleccionado(): Usuario | null {
    return this.ventaManualClientes.find((u) => u.id === this.ventaManualClienteId) || null;
  }

  get eventoVentaManualSeleccionado(): Evento | null {
    return this.ventaManualEventos.find((e) => e.id === this.ventaManualEventoId) || null;
  }

  get subtotalVentaManual(): number {
    return this.ventaManualLineas.reduce((acc, linea) => {
      const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
      if (!tipo || linea.cantidad < 1) {
        return acc;
      }
      return acc + (Number(tipo.precio) * Number(linea.cantidad));
    }, 0);
  }

  get descuentoVentaManual(): number {
    // Flujo equivalente a cupón 100%.
    return this.subtotalVentaManual;
  }

  get totalVentaManual(): number {
    return 0;
  }

  get puedeGuardarVentaManual(): boolean {
    if (!this.ventaManualClienteId || !this.ventaManualEventoId) {
      return false;
    }
    if (!this.ventaManualLineas.length) {
      return false;
    }
    return this.ventaManualLineas.every((linea) => this.validarLineaVentaManual(linea));
  }

  async abrirVentaManualModal(): Promise<void> {
    this.resetVentaManualForm();
    this.showVentaManualModal = true;
    this.ventaManualLineas = [this.nuevaLineaVentaManual()];
    await Promise.all([this.cargarClientesVentaManual(), this.cargarEventosVentaManual()]);
    this.cdr.detectChanges();
  }

  cerrarVentaManualModal(): void {
    this.showVentaManualModal = false;
    this.savingVentaManual = false;
    this.loadingVentaManualClientes = false;
    this.loadingVentaManualEventos = false;
    this.loadingVentaManualTipos = false;
    this.cdr.detectChanges();
  }

  async cargarClientesVentaManual(): Promise<void> {
    this.loadingVentaManualClientes = true;
    this.cdr.detectChanges();
    try {
      const response = await this.usuariosService.getUsuarios({
        page: 1,
        limit: 200,
        activo: true,
        search: this.ventaManualClienteSearch.trim() || undefined,
        sortBy: 'nombre',
        sortOrder: 'asc'
      });
      this.ventaManualClientes = response.data || [];
    } catch (error) {
      console.error('Error cargando usuarios para venta manual:', error);
      await this.alertService.error('Usuarios', 'No se pudieron cargar los usuarios.');
    } finally {
      this.loadingVentaManualClientes = false;
      this.cdr.detectChanges();
    }
  }

  async cargarEventosVentaManual(): Promise<void> {
    this.loadingVentaManualEventos = true;
    this.cdr.detectChanges();
    try {
      const response = await this.eventosService.getEventos({
        page: 1,
        limit: 200,
        activo: true,
        sortBy: 'fecha_inicio',
        sortOrder: 'desc'
      });
      this.ventaManualEventos = (response.data || [])
        .filter((evento) => evento.activo !== false)
        .sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || '')));
    } catch (error) {
      console.error('Error cargando eventos para venta manual:', error);
      await this.alertService.error('Eventos', 'No se pudieron cargar los eventos.');
    } finally {
      this.loadingVentaManualEventos = false;
      this.cdr.detectChanges();
    }
  }

  async onVentaManualEventoChange(): Promise<void> {
    this.ventaManualTipos = [];
    this.ventaManualLineas = [this.nuevaLineaVentaManual()];
    this.palcosDisponiblesPorTipoId.clear();

    if (!this.ventaManualEventoId) {
      this.cdr.detectChanges();
      return;
    }

    this.loadingVentaManualTipos = true;
    this.cdr.detectChanges();
    try {
      const tipos = await this.boletasService.getTiposBoleta(this.ventaManualEventoId);
      this.ventaManualTipos = await this.prepararTiposVentaManual(tipos || []);
      if (!this.ventaManualTipos.length) {
        await this.alertService.warning('Sin boletas', 'El evento seleccionado no tiene tipos de boleta disponibles.');
      }
    } catch (error) {
      console.error('Error cargando tipos de boleta para venta manual:', error);
      await this.alertService.error('Boletas', 'No se pudieron cargar los tipos de boleta del evento.');
    } finally {
      this.loadingVentaManualTipos = false;
      this.cdr.detectChanges();
    }
  }

  agregarLineaVentaManual(): void {
    this.ventaManualLineas.push(this.nuevaLineaVentaManual());
    this.cdr.detectChanges();
  }

  eliminarLineaVentaManual(lineaId: number): void {
    if (this.ventaManualLineas.length <= 1) {
      this.ventaManualLineas = [this.nuevaLineaVentaManual()];
      this.cdr.detectChanges();
      return;
    }
    this.ventaManualLineas = this.ventaManualLineas.filter((linea) => linea.id !== lineaId);
    this.cdr.detectChanges();
  }

  async onLineaTipoChange(linea: LineaVentaManual): Promise<void> {
    linea.cantidad = 1;
    linea.palco_ids = [];

    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    if (!tipo || !this.esTipoPalcoMultipersona(tipo)) {
      this.cdr.detectChanges();
      return;
    }

    await this.cargarPalcosDisponiblesTipo(tipo.id);
    linea.palco_ids = Array.from({ length: linea.cantidad }, () => null);
    this.cdr.detectChanges();
  }

  onLineaCantidadChange(linea: LineaVentaManual): void {
    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    const max = this.maxCantidadDisponibleLinea(linea);
    const valorNormalizado = Number.isFinite(Number(linea.cantidad))
      ? Math.max(1, Math.min(max, Math.floor(Number(linea.cantidad))))
      : 1;

    linea.cantidad = valorNormalizado;
    if (tipo && this.esTipoPalcoMultipersona(tipo)) {
      const actuales = [...linea.palco_ids];
      linea.palco_ids = Array.from({ length: linea.cantidad }, (_, i) => actuales[i] ?? null);
    } else {
      linea.palco_ids = [];
    }
    this.cdr.detectChanges();
  }

  maxCantidadDisponibleLinea(linea: LineaVentaManual): number {
    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    if (!tipo) {
      return 1;
    }
    if (this.esTipoPalcoMultipersona(tipo)) {
      const palcos = this.palcosDisponiblesPorTipoId.get(tipo.id) || [];
      return Math.max(1, palcos.length);
    }
    return Math.max(1, Number(tipo.cantidad_disponibles ?? 0));
  }

  getTipoVentaManual(tipoId: number | null): TipoBoleta | undefined {
    if (!tipoId) {
      return undefined;
    }
    return this.ventaManualTipos.find((tipo) => tipo.id === tipoId);
  }

  esTipoPalcoLinea(linea: LineaVentaManual): boolean {
    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    return !!tipo && this.esTipoPalcoMultipersona(tipo);
  }

  indicesSlotsPalco(linea: LineaVentaManual): number[] {
    return Array.from({ length: Math.max(0, Number(linea.cantidad || 0)) }, (_, i) => i);
  }

  palcosDisponiblesParaSlot(linea: LineaVentaManual, slot: number): Palco[] {
    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    if (!tipo) {
      return [];
    }
    const catalogo = this.palcosDisponiblesPorTipoId.get(tipo.id) || [];
    const tomados = new Set<number>();

    for (const l of this.ventaManualLineas) {
      if (l.id !== linea.id && l.tipo_boleta_id === tipo.id) {
        for (const id of l.palco_ids) {
          if (id != null) tomados.add(id);
        }
      }
    }

    linea.palco_ids.forEach((id, idx) => {
      if (idx !== slot && id != null) {
        tomados.add(id);
      }
    });

    const actual = linea.palco_ids[slot];
    return catalogo.filter((p) => !tomados.has(p.id) || p.id === actual);
  }

  async guardarVentaManual(): Promise<void> {
    if (!this.puedeGuardarVentaManual) {
      await this.alertService.warning(
        'Completa la venta',
        'Selecciona usuario, evento y completa correctamente todas las líneas de boletas/palcos.'
      );
      return;
    }

    const confirmado = await this.alertService.confirm(
      '¿Crear compra manual?',
      'Se registrará la compra como confirmada y se generarán las boletas sin pasar por Wompi (equivalente a cupón 100%).',
      'Sí, crear compra',
      'Cancelar'
    );

    if (!confirmado || !this.ventaManualClienteId || !this.ventaManualEventoId) {
      return;
    }

    const items = this.construirItemsVentaManual();
    if (!items.length) {
      await this.alertService.warning('Sin boletas', 'Agrega al menos un tipo de boleta con cantidad válida.');
      return;
    }

    this.savingVentaManual = true;
    this.cdr.detectChanges();

    try {
      const subtotal = this.subtotalVentaManual;
      const resultado = await this.comprasClienteService.procesarCompra({
        evento_id: this.ventaManualEventoId,
        cliente_id: this.ventaManualClienteId,
        items,
        subtotal,
        descuento_total: subtotal,
        total: 0,
        datos_facturacion: {
          origen: 'admin_manual',
          creado_desde: 'ventas_admin'
        }
      });

      await this.comprasClienteService.confirmarPago(resultado.compra.id);

      const notasBase = 'Venta creada manualmente desde administrador (sin Wompi).';
      const notasFinal = this.ventaManualNotas.trim()
        ? `${notasBase} ${this.ventaManualNotas.trim()}`
        : notasBase;
      await this.comprasService.updateCompra(resultado.compra.id, { notas: notasFinal });

      await this.alertService.success(
        'Compra creada',
        `Se creó la compra #${resultado.compra.id} y las boletas quedaron confirmadas.`
      );

      this.cerrarVentaManualModal();
      await this.loadComprasInternal();
    } catch (error: any) {
      console.error('Error creando venta manual:', error);
      await this.alertService.error(
        'Error al crear venta manual',
        error?.message || error?.error_description || 'No fue posible crear la compra manual.'
      );
    } finally {
      this.savingVentaManual = false;
      this.cdr.detectChanges();
    }
  }

  private construirItemsVentaManual(): ItemCompra[] {
    const items: ItemCompra[] = [];

    for (const linea of this.ventaManualLineas) {
      const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
      if (!tipo) {
        continue;
      }

      const cantidad = Math.max(1, Math.floor(Number(linea.cantidad || 0)));
      if (cantidad < 1) {
        continue;
      }

      const item: ItemCompra = {
        tipo_boleta_id: tipo.id,
        cantidad,
        precio_unitario: Number(tipo.precio)
      };

      if (this.esTipoPalcoMultipersona(tipo)) {
        item.palco_ids = linea.palco_ids
          .filter((id): id is number => typeof id === 'number')
          .slice(0, cantidad);
      }

      items.push(item);
    }

    return items;
  }

  private validarLineaVentaManual(linea: LineaVentaManual): boolean {
    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    if (!tipo) {
      return false;
    }

    const cantidad = Math.max(1, Math.floor(Number(linea.cantidad || 0)));
    const max = this.maxCantidadDisponibleLinea(linea);
    if (cantidad < 1 || cantidad > max) {
      return false;
    }

    if (!this.esTipoPalcoMultipersona(tipo)) {
      return true;
    }

    if (linea.palco_ids.length !== cantidad) {
      return false;
    }
    const ids = linea.palco_ids.filter((id): id is number => typeof id === 'number');
    if (ids.length !== cantidad) {
      return false;
    }
    return new Set(ids).size === ids.length;
  }

  private async cargarPalcosDisponiblesTipo(tipoBoletaId: number): Promise<void> {
    if (this.palcosDisponiblesPorTipoId.has(tipoBoletaId)) {
      return;
    }
    try {
      const palcos = await this.boletasService.getPalcosDisponiblesParaVenta(tipoBoletaId);
      this.palcosDisponiblesPorTipoId.set(tipoBoletaId, palcos || []);
    } catch (error) {
      console.error(`Error cargando palcos disponibles del tipo ${tipoBoletaId}:`, error);
      this.palcosDisponiblesPorTipoId.set(tipoBoletaId, []);
    }
  }

  private esTipoPalcoMultipersona(tipo: TipoBoleta): boolean {
    return Boolean(tipo.es_palco) || Number(tipo.personas_por_unidad ?? 1) > 1;
  }

  private async prepararTiposVentaManual(tipos: TipoBoleta[]): Promise<TipoBoleta[]> {
    const preparados: TipoBoleta[] = [];

    for (const raw of tipos) {
      let disponibles = this.disponiblesTipoBoleta(raw);

      if (this.esTipoPalcoMultipersona(raw)) {
        await this.cargarPalcosDisponiblesTipo(raw.id);
        const palcosLibres = this.palcosDisponiblesPorTipoId.get(raw.id)?.length ?? 0;
        if (raw.es_palco || palcosLibres > 0) {
          disponibles = palcosLibres;
        }
      }

      if (disponibles > 0) {
        preparados.push({ ...raw, cantidad_disponibles: disponibles });
      }
    }

    return preparados.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  }

  private disponiblesTipoBoleta(tipo: TipoBoleta): number {
    const vendidas = Number(tipo.cantidad_vendidas ?? 0);
    const total = Number(tipo.cantidad_total ?? 0);
    const calculados = Math.max(0, total - vendidas);
    if (tipo.cantidad_disponibles === null || tipo.cantidad_disponibles === undefined) {
      return calculados;
    }
    return Math.max(0, Number(tipo.cantidad_disponibles));
  }

  private nuevaLineaVentaManual(): LineaVentaManual {
    return {
      id: this.ventaManualLineaSeq++,
      tipo_boleta_id: null,
      cantidad: 1,
      palco_ids: []
    };
  }

  private resetVentaManualForm(): void {
    this.ventaManualClienteId = null;
    this.ventaManualEventoId = null;
    this.ventaManualNotas = '';
    this.ventaManualClienteSearch = '';
    this.ventaManualEventoSearch = '';
    this.ventaManualClientes = [];
    this.ventaManualEventos = [];
    this.ventaManualTipos = [];
    this.ventaManualLineas = [];
    this.palcosDisponiblesPorTipoId.clear();
    this.ventaManualLineaSeq = 1;
  }

  async cargarEventosFiltro(): Promise<void> {
    try {
      const response = await this.eventosService.getEventos({
        page: 1,
        limit: 500,
        activo: true,
        sortBy: 'titulo',
        sortOrder: 'asc'
      });
      this.eventosFiltro = response.data || [];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error cargando eventos para filtro de ventas:', error);
      this.eventosFiltro = [];
      this.cdr.detectChanges();
    }
  }

  loadCompras() {
    console.log('loadCompras llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.loadComprasInternal();
  }

  onFiltrosChange(): void {
    this.page = 1;
    this.loadCompras();
  }

  private async loadComprasInternal() {
    try {
      const response: PaginatedResponse<Compra> = await this.comprasService.getCompras({
        page: this.page,
        limit: this.limit,
        evento_id: this.eventoFiltro || undefined,
        estado_pago: this.estadoPagoFiltro || undefined,
        estado_compra: this.estadoCompraFiltro || undefined,
        ocultar_total_cero_cliente_id: 5
      });
      console.log('Response recibida en ventas:', response);
      this.compras = response.data || [];
      this.total = response.total || 0;
      await this.cargarDisponibilidadCheckout(this.compras);
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando compras:', err);
      this.compras = [];
      this.total = 0;
      this.comprasConCheckout = new Set<number>();
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async cargarDisponibilidadCheckout(compras: Compra[]): Promise<void> {
    try {
      const ids = compras.map((c) => c.id);
      this.comprasConCheckout = await this.transaccionesCheckoutService.getCompraIdsConCheckout(ids);
    } catch (error) {
      console.warn('No se pudo cargar disponibilidad de checkout para ventas boletas:', error);
      this.comprasConCheckout = new Set<number>();
    }
  }

  tieneCheckout(compra: Compra): boolean {
    return this.comprasConCheckout.has(compra.id);
  }

  openModal(compra: Compra) {
    this.editingCompra = compra;
    this.formData = { ...compra };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingCompra = null;
    this.formData = {};
  }

  async saveCompra() {
    if (this.editingCompra) {
      try {
        // Limpiar datos que no deben enviarse a la BD
        const updateData = { ...this.formData };
        delete (updateData as any).cliente;
        delete (updateData as any).evento;
        delete (updateData as any).cupon; // Eliminar el objeto cupon del join
        delete (updateData as any).id;
        delete (updateData as any).fecha_creacion;
        delete (updateData as any).fecha_actualizacion;

        await this.comprasService.updateCompra(this.editingCompra.id, updateData);
        this.closeModal();
        this.loadCompras();
      } catch (err) {
        console.error('Error guardando compra:', err);
        this.alertService.error('Error', 'Error al guardar compra');
      }
    }
  }

  getEstadoPagoLabel(estado?: string): string {
    const estadoObj = this.estadosPago.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  getEstadoCompraLabel(estado?: string): string {
    const estadoObj = this.estadosCompra.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  getTotalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const pages: number[] = [];
    const maxPages = 5;
    
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, this.page - 2);
      let end = Math.min(totalPages, start + maxPages - 1);
      
      if (end - start < maxPages - 1) {
        start = Math.max(1, end - maxPages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  goToPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= this.getTotalPages()) {
      this.page = pageNum;
      this.loadCompras();
    }
  }

  Math = Math;

  // Métodos para mostrar detalles
  openClienteModal(compra: Compra) {
    this.selectedCliente = compra.cliente || null;
    this.showClienteModal = true;
  }

  closeClienteModal() {
    this.showClienteModal = false;
    this.selectedCliente = null;
  }

  openEventoModal(compra: Compra) {
    this.selectedEvento = compra.evento || null;
    this.showEventoModal = true;
  }

  closeEventoModal() {
    this.showEventoModal = false;
    this.selectedEvento = null;
  }

  // Helper para obtener nombre completo del cliente
  getClienteNombre(compra: Compra): string {
    if (compra.cliente) {
      const nombre = compra.cliente.nombre || '';
      const apellido = compra.cliente.apellido || '';
      return `${nombre} ${apellido}`.trim() || compra.cliente.email || `Cliente #${compra.cliente_id}`;
    }
    return `Cliente #${compra.cliente_id}`;
  }

  // Helper para obtener título del evento
  getEventoTitulo(compra: Compra): string {
    return compra.evento?.titulo || `Evento #${compra.evento_id}`;
  }

  /**
   * Clasificación por líneas de `boletas_compradas`.
   * `null` = compra sin líneas cargadas (ej. sin join); se muestra en tabla boletas con tipo "—".
   */
  categoriaCompra(compra: Compra): 'Palco' | 'Boleta' | 'Mixto' | null {
    const rows = compra.boletas_compradas ?? [];
    if (!rows.length) {
      return null;
    }
    const hasPalco = rows.some((b) => b.grupo_palco_id != null && String(b.grupo_palco_id).length > 0);
    const hasNormal = rows.some((b) => b.grupo_palco_id == null || String(b.grupo_palco_id).length === 0);
    if (hasPalco && hasNormal) {
      return 'Mixto';
    }
    return hasPalco ? 'Palco' : 'Boleta';
  }

  /** Ventas con líneas de palco (incluye mixtas; para no duplicar la misma compra en ambas tablas). */
  get comprasPalcos(): Compra[] {
    return this.compras.filter((c) => {
      const cat = this.categoriaCompra(c);
      return cat === 'Palco' || cat === 'Mixto';
    });
  }

  /** Solo ventas de entradas generales (sin líneas de palco en la compra). */
  get comprasBoletas(): Compra[] {
    return this.compras.filter((c) => {
      const cat = this.categoriaCompra(c);
      return cat === 'Boleta' || cat === null;
    });
  }

  /** Etiqueta tipo para badges (tabla palcos). */
  tipoCompraLabel(compra: Compra): string {
    const cat = this.categoriaCompra(compra);
    return cat ?? '—';
  }

  private unwrapBoletaEmbed<T>(v: T | T[] | null | undefined): T | undefined {
    if (v == null) {
      return undefined;
    }
    return Array.isArray(v) ? v[0] : v;
  }

  /** Una entrada por `palco_id` distinto (tipo de boleta / palco + número físico). */
  private palcosUnicosPorCompra(compra: Compra): Array<{ nombre: string; numero: string }> {
    const rows = compra.boletas_compradas ?? [];
    const map = new Map<number, { nombre: string; numero: string }>();
    for (const b of rows) {
      if (b.palco_id == null) {
        continue;
      }
      if (map.has(b.palco_id)) {
        continue;
      }
      const tipo = this.unwrapBoletaEmbed(b.tipos_boleta);
      const pal = this.unwrapBoletaEmbed(b.palcos);
      const nombre = tipo?.nombre?.trim() || 'Palco';
      const numero = pal?.numero != null ? String(pal.numero) : '—';
      map.set(b.palco_id, { nombre, numero });
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);
  }

  /** Texto para columna “Nombre palco” (tipo de entrada numerada). */
  palcosNombreLista(compra: Compra): string {
    const items = this.palcosUnicosPorCompra(compra);
    return items.length ? items.map((i) => i.nombre).join(' · ') : '—';
  }

  /** Texto para columna “Nº palco”. */
  palcosNumeroLista(compra: Compra): string {
    const items = this.palcosUnicosPorCompra(compra);
    return items.length ? items.map((i) => i.numero).join(' · ') : '—';
  }

  /**
   * Un solo grupo de palco y sin boletas “sueltas” → se puede borrar solo ese grupo.
   * En cualquier otro caso se elimina la compra completa.
   */
  private grupoPalcoParaEliminar(compra: Compra): string | null {
    const rows = compra.boletas_compradas ?? [];
    const hasNormal = rows.some((b) => !b.grupo_palco_id);
    if (hasNormal) {
      return null;
    }
    const grupos = [...new Set(rows.map((b) => b.grupo_palco_id).filter((g): g is string => !!g))];
    if (grupos.length === 1) {
      return grupos[0];
    }
    return null;
  }

  /** Ventas cerradas (pagadas y confirmadas): no se muestra eliminar en UI. */
  puedeEliminarBoletaVenta(compra: Compra): boolean {
    const pagoCerrado = compra.estado_pago === TipoEstadoPago.COMPLETADO;
    const compraCerrada = compra.estado_compra === TipoEstadoCompra.CONFIRMADA;
    return !(pagoCerrado && compraCerrada);
  }

  mensajeConfirmarEliminar(compra: Compra): string {
    const g = this.grupoPalcoParaEliminar(compra);
    if (g) {
      return (
        '¿Eliminar este palco y todas sus boletas asociadas (mismo grupo)? ' +
        'Si era la única unidad de la compra, también se eliminará el registro de la compra. ' +
        'Esta acción no se puede deshacer.'
      );
    }
    return (
      '¿Eliminar esta compra y todas sus boletas? Se liberarán palcos y se revertirá stock si la venta estaba confirmada. ' +
      'Esta acción no se puede deshacer.'
    );
  }

  async eliminarBoletasVenta(compra: Compra) {
    if (!this.puedeEliminarBoletaVenta(compra)) {
      return;
    }
    if (!confirm(this.mensajeConfirmarEliminar(compra))) {
      return;
    }
    const grupo = this.grupoPalcoParaEliminar(compra);
    this.deletingCompraId = compra.id;
    this.cdr.detectChanges();
    try {
      await this.comprasService.adminEliminarVentaBoletas(compra.id, grupo);
      this.alertService.success('Listo', grupo ? 'Palco / boletas eliminados.' : 'Compra eliminada.');
      await this.loadComprasInternal();
    } catch (e: any) {
      console.error(e);
      this.alertService.error(
        'Error',
        e?.message || e?.error_description || 'No se pudo eliminar la venta.'
      );
    } finally {
      this.deletingCompraId = null;
      this.cdr.detectChanges();
    }
  }
}
