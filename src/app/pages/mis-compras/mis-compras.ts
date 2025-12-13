import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, of, forkJoin } from 'rxjs';
import { takeUntil, catchError, debounceTime, switchMap } from 'rxjs/operators';
import { ComprasService } from '../../services/compras.service';
import { BoletasService } from '../../services/boletas.service';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { Compra, BoletaComprada, PaginatedResponse, TipoBoleta, Evento, TipoEstadoPago, TipoEstadoCompra } from '../../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

@Component({
  selector: 'app-mis-compras',
  imports: [CommonModule, RouterModule, FormsModule],
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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Configurar debounce para búsqueda
    this.loadComprasSubject.pipe(
      debounceTime(300),
      switchMap(() => this.loadComprasInternal()),
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

  private loadComprasInternal() {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      console.error('No se pudo identificar el cliente');
      return of({ data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 });
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

    return this.comprasService.getCompras(filters).pipe(
      catchError((err) => {
        console.error('Error en loadComprasInternal:', err);
        return of({ data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 });
      })
    );
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
    this.comprasService.getCompras({
      cliente_id: clienteId,
      limit: 1000 // Límite alto para obtener todas las compras
    }).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error('Error cargando compras para eventos:', err);
        return of({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 });
      })
    ).subscribe({
      next: (response: PaginatedResponse<Compra>) => {
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
          const eventosPromises = eventoIdsArray.map(eventoId => 
            this.eventosService.getEventoById(eventoId).pipe(
              catchError(() => of(null))
            )
          );

          // Usar forkJoin para cargar todos los eventos en paralelo
          forkJoin(eventosPromises).pipe(
            takeUntil(this.destroy$)
          ).subscribe({
            next: (eventos: (Evento | null)[]) => {
              this.eventosDisponibles = eventos.filter((e): e is Evento => e !== null)
                .sort((a, b) => {
                  // Ordenar por título
                  return a.titulo.localeCompare(b.titulo);
                });
              this.loadingEventos = false;
              this.cdr.detectChanges();
            },
            error: (err) => {
              console.error('Error cargando eventos:', err);
              this.loadingEventos = false;
              this.cdr.detectChanges();
            }
          });
        } else {
          this.eventosDisponibles = [];
          this.loadingEventos = false;
          this.cdr.detectChanges();
        }
      }
    });
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

  loadBoletasPorCompra() {
    this.comprasConBoletas = [];
    
    this.compras.forEach(compra => {
      this.boletasService.getBoletasCompradas({
        compra_id: compra.id,
        limit: 1000
      }).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (response: PaginatedResponse<BoletaComprada>) => {
          this.comprasConBoletas.push({
            compra,
            boletas: response.data || []
          });
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error cargando boletas para compra:', compra.id, err);
          this.comprasConBoletas.push({
            compra,
            boletas: []
          });
          this.cdr.detectChanges();
        }
      });
    });
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
    this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error('Error obteniendo tipo de boleta:', err);
        return of(null);
      })
    ).subscribe({
      next: async (tipoBoleta: TipoBoleta | null) => {
        if (!tipoBoleta) {
          this.loadingQR = false;
          this.cdr.detectChanges();
          return;
        }

        this.tipoBoletaSeleccionado = tipoBoleta;

        this.eventosService.getEventoById(tipoBoleta.evento_id).pipe(
          takeUntil(this.destroy$),
          catchError((err) => {
            console.error('Error obteniendo evento:', err);
            return of(null);
          })
        ).subscribe({
          next: (evento: Evento | null) => {
            this.eventoSeleccionado = evento;
            this.loadingQR = false;
            this.cdr.detectChanges();
          }
        });
      }
    });
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
      const tipoBoleta$ = this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id).pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error('Error obteniendo tipo de boleta:', err);
          return of(null);
        })
      );

      tipoBoleta$.subscribe({
        next: async (tipoBoleta: TipoBoleta | null) => {
          if (!tipoBoleta) {
            alert('No se pudo obtener la información del tipo de boleta');
            return;
          }

          // Obtener información del evento
          const evento$ = this.eventosService.getEventoById(tipoBoleta.evento_id).pipe(
            takeUntil(this.destroy$),
            catchError((err) => {
              console.error('Error obteniendo evento:', err);
              return of(null);
            })
          );

          evento$.subscribe({
            next: async (evento: Evento | null) => {
              if (!evento) {
                alert('No se pudo obtener la información del evento');
                return;
              }

              // Generar el PDF
              await this.generarPDF(boleta, compra, tipoBoleta, evento);
            }
          });
        }
      });
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Error al generar el PDF de la boleta');
    }
  }

  /**
   * Genera el PDF con el mismo diseño que el preview
   */
  private async generarPDF(boleta: BoletaComprada, compra: Compra, tipoBoleta: TipoBoleta, evento: Evento) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Colores minimalistas
    const black: [number, number, number] = [0, 0, 0];
    const gray: [number, number, number] = [100, 100, 100];
    const lightGray: [number, number, number] = [240, 240, 240];

    // Generar código QR (mismo tamaño que en el preview)
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(boleta.codigo_qr, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error('Error generando QR:', err);
    }

    const pageWidth = 210;
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = margin;

    // ========== ENCABEZADO ==========
    doc.setTextColor(black[0], black[1], black[2]);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    const tituloLines = doc.splitTextToSize(evento.titulo, contentWidth);
    doc.text(tituloLines, pageWidth / 2, yPos, { align: 'center' });
    yPos += tituloLines.length * 7 + 5;

    // Tipo de boleta
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text(tipoBoleta.nombre, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Línea separadora
    doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.setLineWidth(1);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 15;

    // ========== CÓDIGO QR (Centrado) ==========
    if (qrCodeDataUrl) {
      const qrSize = 60;
      const qrX = (pageWidth - qrSize) / 2;
      doc.addImage(qrCodeDataUrl, 'PNG', qrX, yPos, qrSize, qrSize);
      yPos += qrSize + 8;

      // Código QR texto
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(black[0], black[1], black[2]);
      doc.text(boleta.codigo_qr, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;
    }

    // ========== INFORMACIÓN EN FILAS ==========
    const infoStartY = yPos;
    const rowHeight = 8;
    let currentY = infoStartY;

    // Precio
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Precio:', margin, currentY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(this.formatCurrency(boleta.precio_unitario), pageWidth - margin, currentY, { align: 'right' });
    currentY += rowHeight;

    // Fecha
    if (evento.fecha_inicio) {
      const fechaInicio = new Date(evento.fecha_inicio);
      const fechaStr = fechaInicio.toLocaleDateString('es-CO', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text('Fecha:', margin, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(black[0], black[1], black[2]);
      const fechaLines = doc.splitTextToSize(fechaStr, contentWidth - 50);
      doc.text(fechaLines, pageWidth - margin, currentY, { align: 'right' });
      currentY += fechaLines.length * rowHeight;
    }

    // Asistente
    if (boleta.nombre_asistente) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text('Asistente:', margin, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(black[0], black[1], black[2]);
      doc.text(boleta.nombre_asistente, pageWidth - margin, currentY, { align: 'right' });
      currentY += rowHeight;
    }

    // Documento
    if (boleta.documento_asistente) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text('Documento:', margin, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(black[0], black[1], black[2]);
      doc.text(boleta.documento_asistente, pageWidth - margin, currentY, { align: 'right' });
      currentY += rowHeight;
    }

    // Transacción
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Transacción:', margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(compra.numero_transaccion, pageWidth - margin, currentY, { align: 'right' });
    currentY += rowHeight;

    // Líneas separadoras entre filas
    for (let i = 0; i < 5; i++) {
      const lineY = infoStartY + (i * rowHeight) - 3;
      doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.setLineWidth(0.3);
      doc.line(margin, lineY, pageWidth - margin, lineY);
    }

    // Guardar el PDF
    const fileName = `Boleta_${boleta.codigo_qr}_${evento.titulo.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}.pdf`;
    doc.save(fileName);
  }
}

