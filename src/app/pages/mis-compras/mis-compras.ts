import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
  Compra,
  BoletaComprada,
  PaginatedResponse,
  TipoBoleta,
  Evento,
  TipoEstadoPago,
  TipoEstadoCompra,
  TrasladoBoleta,
  EstadoTrasladoBoleta
} from '../../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

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

interface EventoBoletasGrupo {
  key: string;
  titulo: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  lugar?: any;
  tipos: TipoBoletasGrupo[];
  compras: Compra[];
  totalCedidas: number;
  totalBoletas: number;
  totalDisponibles: number;
  totalTrasladoSaliente: number;
  totalUsadas: number;
  totalSinUsar: number;
  totalSinAsignar: number;
}

@Component({
  selector: 'app-mis-compras',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './mis-compras.html',
  styleUrl: './mis-compras.css',
})
export class MisCompras implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private loadComprasSubject = new Subject<void>();
  
  compras: Compra[] = [];
  comprasConBoletas: { compra: Compra; boletas: BoletaComprada[] }[] = [];
  eventosConBoletas: EventoBoletasGrupo[] = [];
  eventoExpandidoKey: string | null = null;
  eventoDetalleKey: string | null = null;
  tabBoletasDetalle: 'sin-usar' | 'usadas' | 'sin-asignar' = 'sin-usar';
  loading = false;
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

  /** Traslados de palcos: historial y mapas para ocultar QR al remitente con envío pendiente. */
  trasladosHistorial: TrasladoBoleta[] = [];
  trasladosPendientesRecibir: Array<TrasladoBoleta & { boletaDetail?: BoletaComprada }> = [];
  trasladoSalientePorBoletaId = new Map<number, TrasladoBoleta>();
  entradasCedidas: BoletaComprada[] = [];
  loadingTraslados = false;

  showTrasladoModal = false;
  trasladoBoleta: BoletaComprada | null = null;
  trasladoCompra: Compra | null = null;
  emailTrasladoDestino = '';
  enviandoTraslado = false;
  rellenarPerfilBoletaId: number | null = null;

  /** Ruta `/mis-compras/actividad`: solo trazabilidad de traslados. */
  vistaActividad = false;

  constructor(
    private comprasService: ComprasService,
    private boletasService: BoletasService,
    private trasladosBoletaService: TrasladosBoletaService,
    private eventosService: EventosService,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
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

    // Configurar debounce para búsqueda
    this.loadComprasSubject.pipe(
      debounceTime(300),
      switchMap(() => from(this.loadComprasInternal())),
      takeUntil(this.destroy$)
    ).subscribe({
      next: async (response: PaginatedResponse<Compra>) => {
        this.compras = response.data || [];
        this.total = response.total || 0;
        this.totalPages = response.totalPages || 0;
        
        await this.loadBoletasPorCompra();

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando compras:', err);
        this.compras = [];
        this.comprasConBoletas = [];
        this.eventosConBoletas = [];
        this.eventoExpandidoKey = null;
        this.total = 0;
        this.totalPages = 0;
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    this.loadEventosDisponibles(); // Cargar eventos disponibles
    this.loadCompras(); // Carga inicial
  }

  private syncVistaActividadDesdeUrl(url: string): void {
    const path = (url || '').split('?')[0];
    this.vistaActividad = path.endsWith('/mis-compras/actividad');
    const detalleMatch = path.match(/\/mis-compras\/evento\/([^/]+)$/);
    this.eventoDetalleKey = detalleMatch ? decodeURIComponent(detalleMatch[1]) : null;
    this.cdr.detectChanges();
  }

  loadCompras() {
    this.loading = true;
    this.page = 1; // Resetear a primera página al filtrar
    this.cdr.detectChanges();
    this.loadComprasSubject.next();
  }

  private async loadComprasInternal(): Promise<PaginatedResponse<Compra>> {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      console.error('No se pudo identificar el cliente');
      return { data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 };
    }

    const filters: any = {
      cliente_id: clienteId,
      page: this.page,
      limit: this.limit
    };

    // Aplicar filtros
    if (this.estadoPagoFiltro) {
      filters.estado_pago = this.estadoPagoFiltro;
    }
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
      this.loading = true;
      this.cdr.detectChanges();
      this.loadComprasSubject.next();
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
      this.trasladosHistorial = await this.trasladosBoletaService.listarMiTrazabilidad();
      this.trasladoSalientePorBoletaId.clear();
      for (const t of this.trasladosHistorial) {
        const e = String(t.estado);
        if (
          t.usuario_origen_id === uid &&
          (e === EstadoTrasladoBoleta.ENVIADO || e === EstadoTrasladoBoleta.RECIBIDO)
        ) {
          this.trasladoSalientePorBoletaId.set(t.boleta_id, t);
        }
      }
      const pend = this.trasladosHistorial.filter((t) => {
        const e = String(t.estado);
        return (
          t.usuario_destino_id === uid &&
          (e === EstadoTrasladoBoleta.ENVIADO || e === EstadoTrasladoBoleta.RECIBIDO)
        );
      });
      const ids = pend.map((p) => p.boleta_id);
      const detMap = new Map<number, BoletaComprada>();
      if (ids.length) {
        const det = await this.boletasService.getBoletasByIds(ids);
        det.forEach((b) => detMap.set(b.id, b));
      }
      this.trasladosPendientesRecibir = pend.map((t) => ({
        ...t,
        boletaDetail: detMap.get(t.boleta_id)
      }));
    } catch (e) {
      console.error('Error cargando traslados:', e);
      this.trasladosHistorial = [];
      this.trasladosPendientesRecibir = [];
      this.trasladoSalientePorBoletaId.clear();
    } finally {
      this.loadingTraslados = false;
    }
  }

  async loadBoletasPorCompra() {
    this.comprasConBoletas = [];
    this.eventosConBoletas = [];
    this.eventoExpandidoKey = null;
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.entradasCedidas = [];
      return;
    }

    await this.refrescarTrasladosMaps();

    for (const compra of this.compras) {
      try {
        const response = await this.boletasService.getBoletasCompradas({
          compra_id: compra.id,
          limit: 1000
        });
        const boletas = response.data || [];
        const visibles = boletas.filter((b) => this.esTitularBoleta(b, compra));
        if (visibles.length === 0) {
          continue;
        }
        this.comprasConBoletas.push({
          compra,
          boletas: visibles
        });
        this.cdr.detectChanges();
      } catch (err) {
        console.error('Error cargando boletas para compra:', compra.id, err);
        this.cdr.detectChanges();
      }
    }

    try {
      this.entradasCedidas = await this.boletasService.getBoletasCedidasTitular(uid);
    } catch (e) {
      console.error('Error cargando entradas cedidas:', e);
      this.entradasCedidas = [];
    }

    this.reconstruirEventosConBoletas();
  }

  private reconstruirEventosConBoletas(): void {
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
          totalCedidas: 0,
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0
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
        agregarBoleta(item.compra, boleta);
      }
    }

    for (const boleta of this.entradasCedidas) {
      agregarBoleta(this.compraVistaParaBoletaCedida(boleta), boleta, true);
    }

    this.eventosConBoletas = Array.from(eventosMap.values())
      .map((grupo) => ({
        ...grupo,
        tipos: grupo.tipos.sort((a, b) => a.nombre.localeCompare(b.nombre))
      }))
      .sort((a, b) => {
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
    return this.trasladoSalientePorBoletaId.has(boletaId);
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
    this.router.navigate(['/mis-compras/evento', eventoKey]);
  }

  volverAMisCompras(): void {
    this.router.navigate(['/mis-compras']);
  }

  eventoDetalleBoletas(): EventoBoletasGrupo | null {
    if (!this.eventoDetalleKey) return null;
    return this.eventosConBoletas.find((grupo) => grupo.key === this.eventoDetalleKey) || null;
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

  async usarMiPerfilComoAsistentePalco(boleta: BoletaComprada, compra: Compra): Promise<void> {
    if (!this.puedeMostrarBotonYoAsistoPalco(boleta, compra)) {
      return;
    }
    const tipoNombre = boleta.tipo_boleta_meta?.nombre || 'esta entrada';
    const palcoTxt =
      boleta.numero_palco != null ? ` (palco ${boleta.numero_palco})` : '';
    const confirmado = await this.alertService.confirm(
      '¿Confirmas «Yo asisto»?',
      `Se guardarán en la entrada${palcoTxt} el nombre y documento de tu perfil para «${tipoNombre}». Podrás ver y usar el código QR con esos datos. ¿Deseas continuar?`,
      'Sí, usar mis datos',
      'Cancelar'
    );
    if (!confirmado) {
      return;
    }

    this.rellenarPerfilBoletaId = boleta.id;
    this.cdr.detectChanges();
    let ok = false;
    let errMsg: string | undefined;
    try {
      const res = await this.trasladosBoletaService.rellenarAsistentePalcoDesdePerfil(boleta.id);
      if (!res.ok) {
        errMsg = res.error || 'Error desconocido';
        return;
      }
      ok = true;
    } finally {
      // Liberar el estado del botón inmediatamente para que no se quede “Aplicando…”
      this.rellenarPerfilBoletaId = null;
      this.cdr.detectChanges();
    }

    if (!ok) {
      this.alertService.error('No se pudo completar', errMsg || 'Error desconocido');
      return;
    }

    this.alertService.success('Listo', 'Se aplicaron los datos de tu perfil. Ya puedes ver el código QR.');
    try {
      await this.recargarBoletasYTraslados();
    } catch (e) {
      console.error(e);
      // Aun si falla la recarga, el botón ya no queda bloqueado.
      this.alertService.warning('Aviso', 'Se aplicaron los datos, pero no se pudo recargar la pantalla automáticamente.');
    }
  }

  abrirModalTraslado(boleta: BoletaComprada, compra: Compra): void {
    if (!this.puedeAsignarEntradaPorCorreoPalco(boleta, compra)) {
      return;
    }
    this.trasladoBoleta = boleta;
    this.trasladoCompra = compra;
    this.emailTrasladoDestino = '';
    this.showTrasladoModal = true;
    this.cdr.detectChanges();
  }

  cerrarModalTraslado(): void {
    this.showTrasladoModal = false;
    this.trasladoBoleta = null;
    this.trasladoCompra = null;
    this.emailTrasladoDestino = '';
    this.cdr.detectChanges();
  }

  async confirmarEnvioTraslado(): Promise<void> {
    if (!this.trasladoBoleta) return;
    const email = this.emailTrasladoDestino.trim();
    if (!email) {
      this.alertService.warning('Email', 'Indica el email del usuario registrado que recibirá la entrada.');
      return;
    }
    const b = this.trasladoBoleta;
    const tipoNombre = b.tipo_boleta_meta?.nombre || 'esta entrada';
    const palcoTxt = b.numero_palco != null ? ` · palco ${b.numero_palco}` : '';
    const confirmadoEnvio = await this.alertService.confirm(
      '¿Enviar solicitud por correo?',
      `Se enviará a ${email} una solicitud para aceptar la entrada «${tipoNombre}»${palcoTxt}. Mientras esté pendiente no podrás usar el QR. ¿Enviar ahora?`,
      'Sí, enviar',
      'Cancelar'
    );
    if (!confirmadoEnvio) {
      return;
    }

    this.enviandoTraslado = true;
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosBoletaService.iniciarTrasladoPalco(this.trasladoBoleta.id, email);
      if (!res.ok) {
        this.alertService.error('No se pudo enviar', res.error || 'Error desconocido');
        return;
      }
      this.alertService.success('Enviado', 'El destinatario debe aceptar el traslado en Mis Boletas. Tú verás el estado como enviado y no podrás usar el QR hasta que canceles o él rechace.');
      this.cerrarModalTraslado();
      await this.recargarBoletasYTraslados();
    } finally {
      this.enviandoTraslado = false;
      this.cdr.detectChanges();
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
    const tb = Array.isArray(t.boleta?.tipos_boleta) ? t.boleta?.tipos_boleta[0] : t.boleta?.tipos_boleta;
    return tb?.nombre || '—';
  }

  tituloEventoTraslado(t: TrasladoBoleta): string {
    const tb = Array.isArray(t.boleta?.tipos_boleta) ? t.boleta?.tipos_boleta[0] : t.boleta?.tipos_boleta;
    const ev = tb?.eventos;
    if (Array.isArray(ev)) {
      return ev[0]?.titulo || '—';
    }
    return ev?.titulo || '—';
  }

  async marcarRecibidoTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.marcarRecibido(t.id);
    if (!res.ok) {
      this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Listo', 'Marcado como recibido. Puedes aceptar o rechazar.');
    await this.recargarBoletasYTraslados();
  }

  async aceptarTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.aceptar(t.id);
    if (!res.ok) {
      this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Aceptado', 'La entrada es tuya. Ya puedes ver el QR.');
    await this.recargarBoletasYTraslados();
  }

  async rechazarTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.rechazar(t.id);
    if (!res.ok) {
      this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Rechazado', 'El remitente recupera el uso de la entrada.');
    await this.recargarBoletasYTraslados();
  }

  async cancelarTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.cancelar(t.id);
    if (!res.ok) {
      this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Cancelado', 'Se anuló el envío pendiente.');
    await this.recargarBoletasYTraslados();
  }

  private async recargarBoletasYTraslados(): Promise<void> {
    await this.loadBoletasPorCompra();
    this.cdr.detectChanges();
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
      this.trasladosPendientesRecibir.length > 0
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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

  esDiaEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): boolean {
    const fechaEvento = this.fechaInicioEventoBoleta(boleta, compra);
    if (!fechaEvento) return true;
    const hoy = new Date();
    return (
      hoy.getFullYear() === fechaEvento.getFullYear() &&
      hoy.getMonth() === fechaEvento.getMonth() &&
      hoy.getDate() === fechaEvento.getDate()
    );
  }

  fechaEventoLabelBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const fechaEvento = this.fechaInicioEventoBoleta(boleta, compra);
    if (!fechaEvento) return 'del evento';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(fechaEvento);
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
    return `Tranqui, esta boleta ya está a tu nombre. El QR se activa el ${this.fechaEventoLabelBoleta(boleta, compra)} para que todo sea más seguro, sin vueltas raras. Gracias por parchar con Eventum.`;
  }

  esBoletaUsada(boleta: BoletaComprada | null | undefined): boolean {
    return (boleta?.estado || '').toLowerCase() === 'usada';
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

    // Generar QR solo el día del evento y mientras la boleta no haya sido usada.
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

