import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, of, forkJoin, firstValueFrom, from } from 'rxjs';
import { takeUntil, catchError, debounceTime, switchMap } from 'rxjs/operators';
import { ComprasService } from '../../services/compras.service';
import { BoletasService } from '../../services/boletas.service';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { Compra, BoletaComprada, PaginatedResponse, TipoBoleta, Evento, TipoEstadoPago, TipoEstadoCompra } from '../../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

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
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  totalPages = 0;

  // Filtros
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;
  eventoFiltro: number | null = null;
  fechaDesde: string = '';
  fechaHasta: string = '';
  searchTerm: string = '';

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

  constructor(
    private comprasService: ComprasService,
    private boletasService: BoletasService,
    private eventosService: EventosService,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Configurar debounce para búsqueda
    this.loadComprasSubject.pipe(
      debounceTime(300),
      switchMap(() => from(this.loadComprasInternal())),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: PaginatedResponse<Compra>) => {
        this.compras = response.data || [];
        this.total = response.total || 0;
        this.totalPages = response.totalPages || 0;
        this.loadBoletasPorCompra();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando compras:', err);
        this.compras = [];
        this.comprasConBoletas = [];
        this.total = 0;
        this.totalPages = 0;
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    this.loadEventosDisponibles(); // Cargar eventos disponibles
    this.loadCompras(); // Carga inicial
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

  async loadBoletasPorCompra() {
    this.comprasConBoletas = [];
    
    for (const compra of this.compras) {
      try {
        const response = await this.boletasService.getBoletasCompradas({
          compra_id: compra.id,
          limit: 1000
        });
        this.comprasConBoletas.push({
          compra,
          boletas: response.data || []
        });
        this.cdr.detectChanges();
      } catch (err) {
        console.error('Error cargando boletas para compra:', compra.id, err);
        this.comprasConBoletas.push({
          compra,
          boletas: []
        });
        this.cdr.detectChanges();
      }
    }
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
      'pendiente': 'Pendiente',
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

  Math = Math;

  /**
   * Muestra la vista previa de la boleta con QR
   */
  async verBoleta(boleta: BoletaComprada, compra: Compra) {
    this.boletaSeleccionada = boleta;
    this.compraSeleccionada = compra;
    this.loadingQR = true;
    this.showBoletaModal = true;

    // Generar QR
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
    }

    // Obtener información del evento y tipo de boleta
    try {
      const tipoBoleta = await this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id);
      if (!tipoBoleta) {
        this.loadingQR = false;
        this.cdr.detectChanges();
        return;
      }

      this.tipoBoletaSeleccionado = tipoBoleta;

      try {
        const evento = await this.eventosService.getEventoById(tipoBoleta.evento_id);
        this.eventoSeleccionado = evento;
        this.loadingQR = false;
        this.cdr.detectChanges();
      } catch (err) {
        console.error('Error obteniendo evento:', err);
        this.loadingQR = false;
        this.cdr.detectChanges();
      }
    } catch (err) {
      console.error('Error obteniendo tipo de boleta:', err);
      this.loadingQR = false;
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

