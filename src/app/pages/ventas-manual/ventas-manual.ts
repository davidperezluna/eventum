import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { AlertService } from '../../services/alert.service';
import { UsuariosService } from '../../services/usuarios.service';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { ComprasService } from '../../services/compras.service';
import { Evento, Palco, TipoBoleta, Usuario } from '../../types';

interface LineaVentaManual {
  id: number;
  tipo_boleta_id: number | null;
  cantidad: number;
  palco_ids: Array<number | null>;
}

@Component({
  selector: 'app-ventas-manual',
  imports: [CommonModule, FormsModule],
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
  valorServicioManualInput: number | null = null;
  ventaManualNotas = '';
  ventaManualClienteSearch = '';
  ventaManualEventoSearch = '';
  ventaManualClientes: Usuario[] = [];
  ventaManualEventos: Evento[] = [];
  ventaManualTipos: TipoBoleta[] = [];
  ventaManualLineas: LineaVentaManual[] = [];
  private ventaManualLineaSeq = 1;
  private palcosDisponiblesPorTipoId = new Map<number, Palco[]>();

  constructor(
    private comprasService: ComprasService,
    private comprasClienteService: ComprasClienteService,
    private alertService: AlertService,
    private usuariosService: UsuariosService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.ventaManualLineas = [this.nuevaLineaVentaManual()];
    void Promise.all([this.cargarClientesVentaManual(), this.cargarEventosVentaManual()]);
  }

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
      return acc + Number(tipo.precio) * Number(linea.cantidad);
    }, 0);
  }

  get descuentoVentaManual(): number {
    return this.subtotalVentaManual;
  }

  get totalVentaManual(): number {
    return 0;
  }

  get valorServicioManualNormalizado(): number {
    const raw = Number(this.valorServicioManualInput ?? NaN);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, raw);
  }

  get valorServicioManualDisplay(): string {
    if (this.valorServicioManualInput == null || !Number.isFinite(Number(this.valorServicioManualInput))) {
      return '';
    }
    return this.formatearMiles(this.valorServicioManualInput);
  }

  get puedeGuardarVentaManual(): boolean {
    if (!this.ventaManualClienteId || !this.ventaManualEventoId) return false;
    if (this.valorServicioManualInput == null || !Number.isFinite(Number(this.valorServicioManualInput))) return false;
    if (Number(this.valorServicioManualInput) < 0) return false;
    if (!this.ventaManualLineas.length) return false;
    return this.ventaManualLineas.every((linea) => this.validarLineaVentaManual(linea));
  }

  usuarioLabel(usuario: Usuario): string {
    const nombre = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim();
    return `#${usuario.id} · ${nombre || 'Sin nombre'} · ${usuario.email}`;
  }

  onValorServicioManualInput(raw: string): void {
    const numeric = this.parsearNumeroManual(raw);
    this.valorServicioManualInput = numeric;
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
        sortOrder: 'asc',
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
        sortOrder: 'desc',
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
    if (!tipo) return 1;
    if (this.esTipoPalcoMultipersona(tipo)) {
      const palcos = this.palcosDisponiblesPorTipoId.get(tipo.id) || [];
      return Math.max(1, palcos.length);
    }
    return Math.max(1, Number(tipo.cantidad_disponibles ?? 0));
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
    if (!confirmado || !this.ventaManualClienteId || !this.ventaManualEventoId) return;

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
          creado_desde: 'ventas_manual',
        },
      });

      await this.comprasClienteService.confirmarPago(resultado.compra.id);

      const notasBase = 'Venta creada manualmente desde administrador (sin Wompi).';
      const notasFinal = this.ventaManualNotas.trim()
        ? `${notasBase} ${this.ventaManualNotas.trim()}`
        : notasBase;
      await this.comprasService.updateCompra(resultado.compra.id, {
        notas: notasFinal,
        valor_servicio_manual: this.valorServicioManualNormalizado,
      });

      await this.alertService.success(
        'Compra creada',
        `Se creó la compra #${resultado.compra.id} y las boletas quedaron confirmadas.`
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

  private parsearNumeroManual(raw: string): number | null {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    const value = Number(digits);
    if (!Number.isFinite(value)) return null;
    return value;
  }

  private formatearMiles(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.max(0, Number(value) || 0));
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
    this.ventaManualEventoId = null;
    this.valorServicioManualInput = null;
    this.ventaManualNotas = '';
    this.ventaManualClienteSearch = '';
    this.ventaManualEventoSearch = '';
    this.ventaManualClientes = [];
    this.ventaManualEventos = [];
    this.ventaManualTipos = [];
    this.ventaManualLineas = [];
    this.palcosDisponiblesPorTipoId.clear();
    this.ventaManualLineaSeq = 1;
    void Promise.all([this.cargarClientesVentaManual(), this.cargarEventosVentaManual()]);
  }
}

