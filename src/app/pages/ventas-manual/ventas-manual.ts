import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvButton } from '../../components/ev-button';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvSelect, EvSelectOption } from '../../components/ev-select/ev-select';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { ComprasService } from '../../services/compras.service';
import { Evento, Palco, TipoBoleta, Usuario } from '../../types';

interface DetalleCajaVentaManual {
  nombre: string;
  precioUnitario: number;
  subtotal: number;
  cantidad: number;
  disponibles: number;
  esPalco: boolean;
  unidad: string;
}

interface LineaVentaManual {
  id: number;
  tipo_boleta_id: number | null;
  cantidad: number;
  palco_ids: Array<number | null>;
}

@Component({
  selector: 'app-ventas-manual',
  imports: [
    CommonModule,
    FormsModule,
    EvButton,
    EvNumberInput,
    EvSelect,
  ],
  templateUrl: './ventas-manual.html',
  styleUrl: './ventas-manual.css',
})
export class VentasManual implements OnInit {
  savingVentaManual = false;
  loadingVentaManualClientes = false;
  loadingVentaManualEventos = false;
  loadingVentaManualTipos = false;
  ventaManualClienteId: number | null = null;
  ventaManualEventoId: number | null = null;
  ventaManualClientes: Usuario[] = [];
  ventaManualEventos: Evento[] = [];
  ventaManualTipos: TipoBoleta[] = [];
  ventaManualLineas: LineaVentaManual[] = [];
  private ventaManualLineaSeq = 1;
  private palcosDisponiblesPorTipoId = new Map<number, Palco[]>();
  private clienteSeleccionadoSnapshot: Usuario | null = null;
  private clienteSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private clienteSearchRequestId = 0;

  constructor(
    private comprasService: ComprasService,
    private comprasClienteService: ComprasClienteService,
    private alertService: AlertService,
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.ventaManualLineas = [this.nuevaLineaVentaManual()];
    void Promise.all([this.cargarClientesVentaManual(), this.cargarEventosVentaManual()]);
  }

  get isOrganizador(): boolean {
    return this.authService.isOrganizador();
  }

  get clienteOptions(): EvSelectOption<number>[] {
    return this.ventaManualClientes.map((usuario) => ({
      value: usuario.id,
      label: this.usuarioLabel(usuario),
    }));
  }

  get eventoOptions(): EvSelectOption<number>[] {
    return this.ventaManualEventos.map((evento) => ({
      value: evento.id,
      label: evento.titulo,
    }));
  }

  get tipoOptions(): EvSelectOption<number>[] {
    return this.ventaManualTipos.map((tipo) => ({
      value: tipo.id,
      label: tipo.nombre,
    }));
  }

  get clienteVentaManualSeleccionado(): Usuario | null {
    if (this.ventaManualClienteId == null) return null;
    return (
      this.ventaManualClientes.find((u) => u.id === this.ventaManualClienteId) ||
      (this.clienteSeleccionadoSnapshot?.id === this.ventaManualClienteId
        ? this.clienteSeleccionadoSnapshot
        : null)
    );
  }

  get eventoVentaManualSeleccionado(): Evento | null {
    return this.ventaManualEventos.find((e) => e.id === this.ventaManualEventoId) || null;
  }

  get clienteChipLabel(): string {
    const cliente = this.clienteVentaManualSeleccionado;
    if (!cliente) return '';
    const nombre = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
    return nombre || cliente.email || 'Titular';
  }

  get subtotalVentaManual(): number {
    return this.ventaManualLineas.reduce((acc, linea) => {
      const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
      if (!tipo || linea.cantidad < 1) {
        return acc;
      }
      return acc + Number(tipo.precio) * Number(linea.cantidad);
    }, 0);
  }

  get puedeGuardarVentaManual(): boolean {
    if (!this.ventaManualClienteId || !this.ventaManualEventoId) return false;
    if (!this.ventaManualLineas.length) return false;
    return this.ventaManualLineas.every((linea) => this.validarLineaVentaManual(linea));
  }

  get siguientePasoHint(): string {
    if (!this.ventaManualEventoId) return 'Comienza eligiendo el evento';
    if (!this.ventaManualClienteId) return 'Falta indicar el titular de las boletas';
    if (this.loadingVentaManualTipos) return 'Cargando boletas disponibles…';
    if (!this.ventaManualTipos.length) return 'Este evento no tiene boletas disponibles por ahora';
    if (!this.ventaManualLineas.some((l) => l.tipo_boleta_id)) return 'Agrega al menos un tipo de boleta';
    if (this.ventaManualLineas.some((l) => this.esTipoPalcoLinea(l) && !this.validarLineaVentaManual(l))) {
      return 'Completa la asignación de palcos';
    }
    return 'Revisa el resumen y confirma cuando esté bien';
  }

  get resumenEntradas(): string {
    const tipos = this.ventaManualLineas.filter(
      (linea) => linea.tipo_boleta_id && this.validarLineaVentaManual(linea),
    ).length;
    const unidades = this.ventaManualLineas.reduce((acc, linea) => {
      if (!this.validarLineaVentaManual(linea)) return acc;
      return acc + Math.max(0, Number(linea.cantidad || 0));
    }, 0);

    if (tipos <= 0 || unidades <= 0) return 'Aún sin boletas';

    const tiposTxt = tipos === 1 ? '1 tipo' : `${tipos} tipos`;
    const unidadesTxt = unidades === 1 ? '1 boleta' : `${unidades} boletas`;
    return `${tiposTxt} · ${unidadesTxt}`;
  }

  get lineasResumen(): DetalleCajaVentaManual[] {
    return this.ventaManualLineas
      .map((linea) => this.detalleCaja(linea))
      .filter((detalle): detalle is DetalleCajaVentaManual => detalle != null);
  }

  trackLinea(_: number, linea: LineaVentaManual): number {
    return linea.id;
  }

  trackResumen(_: number, detalle: DetalleCajaVentaManual): string {
    return `${detalle.nombre}-${detalle.cantidad}-${detalle.precioUnitario}`;
  }

  usuarioLabel(usuario: Usuario): string {
    const nombre = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim();
    if (nombre && usuario.email) return `${nombre} · ${usuario.email}`;
    return nombre || usuario.email || `Usuario #${usuario.id}`;
  }

  detalleCaja(linea: LineaVentaManual): DetalleCajaVentaManual | null {
    const tipo = this.getTipoVentaManual(linea.tipo_boleta_id);
    if (!tipo) return null;

    const cantidad = Math.max(1, Number(linea.cantidad || 1));
    const precioUnitario = Number(tipo.precio || 0);

    return {
      nombre: tipo.nombre,
      precioUnitario,
      subtotal: precioUnitario * cantidad,
      cantidad,
      disponibles: tipo.cantidad_disponibles ?? 0,
      esPalco: !!tipo.es_palco,
      unidad: tipo.es_palco ? 'palco' : 'entrada',
    };
  }

  unidadCajaLabel(detalle: DetalleCajaVentaManual): string {
    if (detalle.cantidad === 1) return detalle.unidad;
    return detalle.unidad === 'palco' ? 'palcos' : 'entradas';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  palcoOptionsParaSlot(linea: LineaVentaManual, slot: number): EvSelectOption<number>[] {
    return this.palcosDisponiblesParaSlot(linea, slot).map((palco) => ({
      value: palco.id,
      label: `Palco ${palco.numero}`,
    }));
  }

  setPalcoSlot(linea: LineaVentaManual, slot: number, value: unknown): void {
    const next = [...linea.palco_ids];
    next[slot] = typeof value === 'number' ? value : null;
    linea.palco_ids = next;
    this.cdr.detectChanges();
  }

  async onLineaTipoIdChange(linea: LineaVentaManual, value: unknown): Promise<void> {
    linea.tipo_boleta_id = typeof value === 'number' ? value : null;
    await this.onLineaTipoChange(linea);
  }

  onLineaCantidadValueChange(linea: LineaVentaManual, value: number | null): void {
    linea.cantidad = value == null || !Number.isFinite(value) ? 1 : value;
    this.onLineaCantidadChange(linea);
  }

  async cargarClientesVentaManual(search?: string): Promise<void> {
    const term = search?.trim() ?? '';
    const requestId = ++this.clienteSearchRequestId;
    this.loadingVentaManualClientes = true;
    this.cdr.detectChanges();
    try {
      const response = await this.usuariosService.getUsuarios({
        page: 1,
        limit: term ? 50 : 200,
        activo: true,
        tipo_usuario_id: this.isOrganizador ? 1 : undefined,
        sortBy: term ? 'email' : 'nombre',
        sortOrder: 'asc',
        search: term || undefined,
      });
      if (requestId !== this.clienteSearchRequestId) return;
      this.ventaManualClientes = this.mergeClienteSeleccionado(response.data || []);
    } catch (error) {
      if (requestId !== this.clienteSearchRequestId) return;
      console.error('Error cargando usuarios para venta manual:', error);
      await this.alertService.error('Usuarios', 'No se pudieron cargar los usuarios.');
    } finally {
      if (requestId === this.clienteSearchRequestId) {
        this.loadingVentaManualClientes = false;
        this.cdr.detectChanges();
      }
    }
  }

  onTitularSearch(term: string): void {
    if (this.clienteSearchTimer) {
      clearTimeout(this.clienteSearchTimer);
    }
    this.clienteSearchTimer = setTimeout(() => {
      const q = term.trim();
      if (q.length > 0 && q.length < 2) {
        return;
      }
      void this.cargarClientesVentaManual(q);
    }, 300);
  }

  onVentaManualClienteChange(): void {
    this.clienteSeleccionadoSnapshot = this.clienteVentaManualSeleccionado;
  }

  private mergeClienteSeleccionado(clientes: Usuario[]): Usuario[] {
    const seleccionado = this.clienteSeleccionadoSnapshot;
    if (!seleccionado) {
      return clientes;
    }
    if (clientes.some((usuario) => usuario.id === seleccionado.id)) {
      return clientes;
    }
    return [seleccionado, ...clientes];
  }

  async cargarEventosVentaManual(): Promise<void> {
    this.loadingVentaManualEventos = true;
    this.cdr.detectChanges();
    try {
      const organizadorId = this.isOrganizador ? this.authService.getUsuarioId() : null;
      const response = await this.eventosService.getEventos({
        page: 1,
        limit: 200,
        activo: true,
        organizador_id: organizadorId || undefined,
        sortBy: 'fecha_inicio',
        sortOrder: 'asc',
      });
      this.ventaManualEventos = (response.data || [])
        .filter((evento) => evento.activo !== false)
        .sort((a, b) => String(a.fecha_inicio || '').localeCompare(String(b.fecha_inicio || '')));

      if (this.ventaManualEventos.length === 1 && !this.ventaManualEventoId) {
        this.ventaManualEventoId = this.ventaManualEventos[0].id;
        await this.onVentaManualEventoChange();
      }
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

    if (this.isOrganizador) {
      const evento = this.eventoVentaManualSeleccionado;
      const organizadorId = this.authService.getUsuarioId();
      if (!evento || !organizadorId || Number(evento.organizador_id) !== organizadorId) {
        this.ventaManualEventoId = null;
        await this.alertService.error('Evento', 'Solo puedes registrar ventas de tus propios eventos.');
        this.cdr.detectChanges();
        return;
      }
    }

    this.loadingVentaManualTipos = true;
    this.cdr.detectChanges();
    try {
      const tipos = await this.boletasService.getTiposBoleta(this.ventaManualEventoId);
      this.ventaManualTipos = await this.prepararTiposVentaManual(tipos || []);
      if (!this.ventaManualTipos.length) {
        await this.alertService.warning('Sin boletas disponibles', 'Este evento no tiene tipos de boleta activos en este momento.');
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
    if (!tipo) return 1;
    if (this.esTipoPalcoMultipersona(tipo)) {
      const palcos = this.palcosDisponiblesPorTipoId.get(tipo.id) || [];
      return Math.max(0, palcos.length);
    }
    return Math.max(0, Number(tipo.cantidad_disponibles ?? 0));
  }

  getTipoVentaManual(tipoId: number | null): TipoBoleta | undefined {
    if (!tipoId) return undefined;
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
    if (!tipo) return [];
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
      if (idx !== slot && id != null) tomados.add(id);
    });

    const actual = linea.palco_ids[slot];
    return catalogo.filter((p) => !tomados.has(p.id) || p.id === actual);
  }

  async guardarVentaManual(): Promise<void> {
    if (!this.puedeGuardarVentaManual) {
      await this.alertService.warning(
        'Casi listo',
        'Selecciona el evento, el titular y completa cada tipo de boleta.',
      );
      return;
    }

    if (this.isOrganizador) {
      const evento = this.eventoVentaManualSeleccionado;
      const organizadorId = this.authService.getUsuarioId();
      if (!evento || !organizadorId || Number(evento.organizador_id) !== organizadorId) {
        await this.alertService.error('Evento', 'Solo puedes registrar ventas de tus propios eventos.');
        return;
      }
    }

    const confirmado = await this.alertService.confirm(
      '¿Registrar esta venta?',
      `${this.resumenEntradas} para ${this.clienteChipLabel}. El cobro fue directo al organizador, sin pago en línea por Eventum.`,
      'Sí, registrar',
      'Volver'
    );
    if (!confirmado || !this.ventaManualClienteId || !this.ventaManualEventoId) return;

    const items = this.construirItemsVentaManual();
    if (!items.length) {
      await this.alertService.warning('Falta agregar boletas', 'Elige al menos un tipo con cantidad válida.');
      return;
    }

    this.savingVentaManual = true;
    this.cdr.detectChanges();

    try {
      const subtotal = this.subtotalVentaManual;
      const origen = this.isOrganizador ? 'organizador_manual' : 'admin_manual';
      const resultado = await this.comprasClienteService.procesarCompra({
        evento_id: this.ventaManualEventoId,
        cliente_id: this.ventaManualClienteId,
        items,
        subtotal,
        descuento_total: subtotal,
        total: 0,
        datos_facturacion: {
          origen,
          creado_desde: 'ventas_manual',
        },
      });

      await this.comprasClienteService.confirmarPago(resultado.compra.id);

      const actor = this.isOrganizador ? 'organizador' : 'administrador';
      await this.comprasService.updateCompra(resultado.compra.id, {
        notas: `Venta creada manualmente desde ${actor} (sin Wompi).`,
      });

      await this.alertService.success(
        'Venta registrada',
        `Compra #${resultado.compra.id} lista. ${this.resumenEntradas} activas.`
      );

      this.resetVentaManualForm();
      this.ventaManualLineas = [this.nuevaLineaVentaManual()];
      this.cdr.detectChanges();
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
      if (!tipo) continue;
      const cantidad = Math.max(1, Math.floor(Number(linea.cantidad || 0)));
      if (cantidad < 1) continue;

      const item: ItemCompra = {
        tipo_boleta_id: tipo.id,
        cantidad,
        precio_unitario: Number(tipo.precio),
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
    if (!tipo) return false;
    const cantidad = Math.max(1, Math.floor(Number(linea.cantidad || 0)));
    const max = this.maxCantidadDisponibleLinea(linea);
    if (cantidad < 1 || cantidad > max) return false;

    if (!this.esTipoPalcoMultipersona(tipo)) return true;
    if (linea.palco_ids.length !== cantidad) return false;
    const ids = linea.palco_ids.filter((id): id is number => typeof id === 'number');
    if (ids.length !== cantidad) return false;
    return new Set(ids).size === ids.length;
  }

  private async cargarPalcosDisponiblesTipo(tipoBoletaId: number): Promise<void> {
    if (this.palcosDisponiblesPorTipoId.has(tipoBoletaId)) return;
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

  /** Palcos numerados: disponibilidad por unidades en tabla `palcos`, no por `cantidad_disponibles`. */
  private async prepararTiposVentaManual(tipos: TipoBoleta[]): Promise<TipoBoleta[]> {
    const preparados: TipoBoleta[] = [];

    for (const raw of tipos) {
      let disponibles: number;

      if (this.esTipoPalcoMultipersona(raw)) {
        await this.cargarPalcosDisponiblesTipo(raw.id);
        disponibles = this.palcosDisponiblesPorTipoId.get(raw.id)?.length ?? 0;
      } else {
        disponibles = this.disponiblesTipoBoleta(raw);
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
      palco_ids: [],
    };
  }

  private resetVentaManualForm(): void {
    this.ventaManualClienteId = null;
    this.clienteSeleccionadoSnapshot = null;
    this.ventaManualEventoId = null;
    this.ventaManualClientes = [];
    this.ventaManualEventos = [];
    this.ventaManualTipos = [];
    this.ventaManualLineas = [];
    this.palcosDisponiblesPorTipoId.clear();
    this.ventaManualLineaSeq = 1;
    void Promise.all([this.cargarClientesVentaManual(), this.cargarEventosVentaManual()]);
  }
}
