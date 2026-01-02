import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { BoletasService } from '../../services/boletas.service';
import { EventosService } from '../../services/eventos.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { BoletaComprada, TipoBoleta, PaginatedResponse, TipoEstadoBoleta, Evento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-boletas',
  imports: [CommonModule, FormsModule, DateFormatPipe],
  templateUrl: './boletas.html',
  styleUrl: './boletas.css',
})
export class Boletas implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private loadBoletasSubject = new Subject<void>();

  boletas: BoletaComprada[] = [];
  tiposBoleta: TipoBoleta[] = [];
  eventos: Evento[] = [];
  loading = false;
  loadingTipos = false;
  total = 0;
  page = 1;
  limit = 10;
  estadoFiltro: string | null = null;
  eventoFiltro: number | null = null;
  tipoBoletaFiltro: number | null = null;
  searchFiltro: string = '';
  codigoQRFiltro: string = '';
  nombreFiltro: string = '';
  emailFiltro: string = '';
  telefonoFiltro: string = '';
  fechaDesdeFiltro: string = '';
  fechaHastaFiltro: string = '';
  showTiposSection = false;
  showFiltrosAvanzados = false;

  showModal = false;
  showTiposModal = false;
  showValidarModal = false;
  showScannerModal = false;
  editingTipo: TipoBoleta | null = null;
  formData: Partial<TipoBoleta> = { activo: true };
  eventoSeleccionado: number | null = null;
  tiposBoletaEvento: TipoBoleta[] = [];
  codigoQRValidar: string = '';
  documentoValidar: string = '';
  boletaEncontrada: BoletaComprada | null = null;
  boletasEncontradasPorDocumento: BoletaComprada[] = [];
  boletaSeleccionada: BoletaComprada | null = null;
  modoBusqueda: 'qr' | 'documento' = 'qr';
  validandoBoleta = false;

  estados: { value: TipoEstadoBoleta; label: string }[] = [
    { value: TipoEstadoBoleta.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoBoleta.USADA, label: 'Usada' },
    { value: TipoEstadoBoleta.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoBoleta.REEMBOLSADA, label: 'Reembolsada' }
  ];

  constructor(
    private boletasService: BoletasService,
    private eventosService: EventosService,
    private timezoneService: TimezoneService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadEventos();
    this.loadAllTiposBoleta();
    
    // Configurar debounce para loadBoletas
    this.loadBoletasSubject.pipe(
      debounceTime(300),
      switchMap(async () => {
        return await this.loadBoletasInternal();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.boletas = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando boletas:', err);
        this.loading = false;
        this.boletas = [];
        this.total = 0;
        this.cdr.detectChanges();
      }
    });

    // Cargar boletas inicialmente
    this.loadBoletas();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onEventoFiltroChange() {
    // Cuando cambia el evento, cargar los tipos de boleta de ese evento
    if (this.eventoFiltro) {
      this.loadTiposBoleta(this.eventoFiltro);
    } else {
      this.tipoBoletaFiltro = null;
      this.tiposBoletaEvento = [];
    }
    this.loadBoletas();
  }

  async loadAllTiposBoleta() {
    this.loadingTipos = true;
    try {
      const tipos = await this.boletasService.getAllTiposBoleta({ activo: true });
      this.tiposBoleta = tipos || [];
      this.loadingTipos = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando tipos de boleta:', err);
      this.tiposBoleta = [];
      this.loadingTipos = false;
      this.cdr.detectChanges();
    }
  }

  async loadEventos() {
    // Para el selector de eventos en boletas, solo necesitamos eventos activos
    // Reducir el límite para mejor rendimiento
    try {
      const response = await this.eventosService.getEventos({ 
        limit: 500, // Reducido de 1000
        page: 1,
        activo: true
      });
      this.eventos = response.data || [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando eventos:', err);
      // Si falla, intentar con menos eventos
      try {
        const response = await this.eventosService.getEventos({ limit: 100, page: 1, activo: true });
        this.eventos = response.data || [];
        this.cdr.detectChanges();
      } catch {
        this.eventos = [];
        this.cdr.detectChanges();
      }
    }
  }

  loadBoletas() {
    this.loading = true;
    this.page = 1; // Resetear a primera página al filtrar
    this.cdr.detectChanges();
    this.loadBoletasSubject.next();
  }

  private async loadBoletasInternal() {
    const filters: any = {
      page: this.page,
      limit: this.limit,
    };

    if (this.estadoFiltro) {
      filters.estado = this.estadoFiltro;
    }
    if (this.eventoFiltro) {
      filters.evento_id = this.eventoFiltro;
    }
    if (this.tipoBoletaFiltro) {
      filters.tipo_boleta_id = this.tipoBoletaFiltro;
    }
    if (this.searchFiltro.trim()) {
      filters.search = this.searchFiltro.trim();
    }
    if (this.codigoQRFiltro.trim()) {
      filters.codigo_qr = this.codigoQRFiltro.trim();
    }
    if (this.nombreFiltro.trim()) {
      filters.nombre_asistente = this.nombreFiltro.trim();
    }
    if (this.emailFiltro.trim()) {
      filters.email_asistente = this.emailFiltro.trim();
    }
    if (this.telefonoFiltro.trim()) {
      filters.telefono_asistente = this.telefonoFiltro.trim();
    }
    if (this.fechaDesdeFiltro) {
      filters.fecha_desde = new Date(this.fechaDesdeFiltro).toISOString();
    }
    if (this.fechaHastaFiltro) {
      const fechaHasta = new Date(this.fechaHastaFiltro);
      fechaHasta.setHours(23, 59, 59, 999); // Incluir todo el día
      filters.fecha_hasta = fechaHasta.toISOString();
    }
    
    try {
      return await this.boletasService.getBoletasCompradas(filters);
    } catch (err) {
      console.error('Error cargando boletas:', err);
      return { data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 };
    }
  }

  limpiarFiltros() {
    this.estadoFiltro = null;
    this.eventoFiltro = null;
    this.tipoBoletaFiltro = null;
    this.searchFiltro = '';
    this.codigoQRFiltro = '';
    this.nombreFiltro = '';
    this.emailFiltro = '';
    this.telefonoFiltro = '';
    this.fechaDesdeFiltro = '';
    this.fechaHastaFiltro = '';
    this.loadBoletas();
  }

  async validarBoleta(boleta: BoletaComprada) {
    if (boleta.estado === 'usada') {
      this.alertService.warning('Boleta ya validada', 'Esta boleta ya ha sido validada');
      return;
    }
    if (boleta.estado === 'cancelada' || boleta.estado === 'reembolsada') {
      this.alertService.warning('No se puede validar', 'No se puede validar una boleta cancelada o reembolsada');
      return;
    }
    
    // Verificar que el pago esté completado
    const estadoPago = boleta.estado_pago || boleta.compra?.estado_pago;
    if (!estadoPago || estadoPago !== 'completado') {
      this.alertService.warning(
        'Pago pendiente', 
        'No se puede validar una boleta cuyo pago esté pendiente. El pago debe estar completado antes de validar la boleta.'
      );
      return;
    }
    
    const confirmed = await this.alertService.confirm('Validar boleta', `¿Validar la boleta ${boleta.codigo_qr}?`);
    if (confirmed) {
      this.validandoBoleta = true;
      try {
        await this.boletasService.validarBoleta(boleta.id);
        this.alertService.success('¡Boleta validada!', 'Boleta validada exitosamente');
        this.loadBoletas();
        this.validandoBoleta = false;
        this.cdr.detectChanges();
      } catch (err: any) {
        console.error('Error validando boleta:', err);
        this.alertService.error('Error al validar', 'Error al validar la boleta: ' + (err.message || 'Error desconocido'));
        this.validandoBoleta = false;
        this.cdr.detectChanges();
      }
    }
  }

  abrirValidarModal() {
    this.showValidarModal = true;
    this.codigoQRValidar = '';
    this.documentoValidar = '';
    this.boletaEncontrada = null;
    this.boletasEncontradasPorDocumento = [];
    this.boletaSeleccionada = null;
    this.modoBusqueda = 'qr';
  }

  cerrarValidarModal() {
    this.showValidarModal = false;
    this.showScannerModal = false;
    this.codigoQRValidar = '';
    this.documentoValidar = '';
    this.boletaEncontrada = null;
    this.boletasEncontradasPorDocumento = [];
    this.boletaSeleccionada = null;
    this.modoBusqueda = 'qr';
  }

  cambiarModoBusqueda(modo: 'qr' | 'documento') {
    this.modoBusqueda = modo;
    this.codigoQRValidar = '';
    this.documentoValidar = '';
    this.boletaEncontrada = null;
    this.boletasEncontradasPorDocumento = [];
    this.boletaSeleccionada = null;
  }

  async buscarBoletaPorQR() {
    if (!this.codigoQRValidar.trim()) {
      this.alertService.warning('Campo requerido', 'Por favor ingresa un código QR');
      return;
    }

    this.validandoBoleta = true;
    this.boletaEncontrada = null;
    this.boletasEncontradasPorDocumento = [];
    this.boletaSeleccionada = null;
    
    try {
      const boleta = await this.boletasService.buscarBoletaPorCodigoQR(this.codigoQRValidar.trim());
      this.validandoBoleta = false;
      if (!boleta) {
        this.alertService.info('No encontrado', 'No se encontró ninguna boleta con ese código QR');
        this.boletaEncontrada = null;
      } else {
        this.boletaEncontrada = boleta;
        this.boletaSeleccionada = boleta;
      }
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('Error buscando boleta:', err);
      this.alertService.error('Error al buscar', 'Error al buscar la boleta: ' + (err.message || 'Error desconocido'));
      this.validandoBoleta = false;
      this.boletaEncontrada = null;
      this.boletaSeleccionada = null;
      this.cdr.detectChanges();
    }
  }

  async buscarBoletasPorDocumento() {
    if (!this.documentoValidar.trim()) {
      this.alertService.warning('Campo requerido', 'Por favor ingresa un número de cédula');
      return;
    }

    this.validandoBoleta = true;
    this.boletaEncontrada = null;
    this.boletasEncontradasPorDocumento = [];
    this.boletaSeleccionada = null;
    
    try {
      const boletas = await this.boletasService.buscarBoletasPorDocumento(this.documentoValidar.trim());
      this.validandoBoleta = false;
      if (!boletas || boletas.length === 0) {
        this.alertService.info('No encontrado', 'No se encontraron boletas con ese número de cédula');
        this.boletasEncontradasPorDocumento = [];
      } else {
        this.boletasEncontradasPorDocumento = boletas;
        // Si solo hay una, seleccionarla automáticamente
        if (boletas.length === 1) {
          this.boletaSeleccionada = boletas[0];
        }
      }
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('Error buscando boletas:', err);
      this.alertService.error('Error al buscar', 'Error al buscar las boletas: ' + (err.message || 'Error desconocido'));
      this.validandoBoleta = false;
      this.boletasEncontradasPorDocumento = [];
      this.boletaSeleccionada = null;
      this.cdr.detectChanges();
    }
  }

  seleccionarBoleta(boleta: BoletaComprada) {
    this.boletaSeleccionada = boleta;
    this.cdr.detectChanges();
  }

  validarBoletaDesdeModal() {
    const boletaAValidar = this.boletaSeleccionada || this.boletaEncontrada;
    if (!boletaAValidar) {
      this.alertService.warning('Selección requerida', 'Por favor selecciona una boleta para validar');
      return;
    }
    this.validarBoleta(boletaAValidar);
    this.cerrarValidarModal();
  }

  async loadTiposBoleta(eventoId: number) {
    try {
      const tipos = await this.boletasService.getTiposBoleta(eventoId);
      this.tiposBoletaEvento = tipos || [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando tipos de boleta:', err);
      this.tiposBoletaEvento = [];
      this.cdr.detectChanges();
    }
  }

  async openTiposModalFromTipo(tipoBoletaId: number) {
    // Obtener el tipo de boleta para conseguir el evento_id
    try {
      const tipo = await this.boletasService.getTipoBoletaById(tipoBoletaId);
      if (tipo) {
        this.openTiposModal(tipo.evento_id);
      }
    } catch (err) {
      console.error('Error obteniendo tipo de boleta:', err);
      this.alertService.error('Error', 'Error al obtener información del tipo de boleta');
    }
  }

  openModalTipo(eventoId?: number) {
    this.eventoSeleccionado = eventoId || null;
    this.editingTipo = null;
    this.formData = { 
      activo: true, 
      evento_id: eventoId || 0,
      cantidad_vendidas: 0
      // cantidad_disponibles se calculará automáticamente cuando se ingrese cantidad_total
    };
    this.showModal = true;
  }

  openModalEditTipo(tipo: TipoBoleta) {
    this.editingTipo = tipo;
    this.eventoSeleccionado = tipo.evento_id;
    this.formData = {
      ...tipo,
      fecha_venta_inicio: tipo.fecha_venta_inicio ? this.formatDateForInput(tipo.fecha_venta_inicio) : undefined,
      fecha_venta_fin: tipo.fecha_venta_fin ? this.formatDateForInput(tipo.fecha_venta_fin) : undefined
    };
    this.showModal = true;
  }

  openTiposModal(eventoId: number) {
    this.eventoSeleccionado = eventoId;
    this.loadTiposBoleta(eventoId);
    this.showTiposModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingTipo = null;
    this.formData = {};
    this.eventoSeleccionado = null;
  }

  closeTiposModal() {
    this.showTiposModal = false;
    this.eventoSeleccionado = null;
    this.tiposBoletaEvento = [];
  }

  calcularCantidades() {
    if (this.formData.cantidad_total) {
      const cantidadVendidas = this.editingTipo 
        ? (this.editingTipo.cantidad_vendidas || 0)
        : 0;
      
      this.formData.cantidad_disponibles = this.formData.cantidad_total - cantidadVendidas;
      this.formData.cantidad_vendidas = cantidadVendidas;
    }
  }

  formatDateForInput(date: Date | string | undefined): string {
    if (!date) return '';
    // Usar el servicio de timezone para convertir de ISO a datetime-local
    return this.timezoneService.isoToDatetimeLocal(typeof date === 'string' ? date : date.toISOString());
  }

  async saveTipoBoleta() {
    // Validaciones
    if (!this.formData.evento_id) {
      this.alertService.warning('Campo requerido', 'El evento es requerido');
      return;
    }
    if (!this.formData.nombre || !this.formData.nombre.trim()) {
      this.alertService.warning('Campo requerido', 'El nombre es requerido');
      return;
    }
    if (!this.formData.precio || this.formData.precio < 0) {
      this.alertService.warning('Valor inválido', 'El precio debe ser mayor o igual a 0');
      return;
    }
    if (!this.formData.cantidad_total || this.formData.cantidad_total <= 0) {
      this.alertService.warning('Valor inválido', 'La cantidad total debe ser mayor a 0');
      return;
    }

    // Calcular cantidad_disponibles basado en cantidad_total y cantidad_vendidas
    if (this.formData.cantidad_total) {
      // Si es edición, mantener cantidad_vendidas existente del tipo original
      // Si es nuevo, cantidad_vendidas debe ser 0
      const cantidadVendidas = this.editingTipo 
        ? (this.editingTipo.cantidad_vendidas || 0)
        : 0;
      
      // Calcular cantidad_disponibles
      this.formData.cantidad_disponibles = this.formData.cantidad_total - cantidadVendidas;
      this.formData.cantidad_vendidas = cantidadVendidas;
      
      console.log('Cálculo de cantidades:', {
        cantidad_total: this.formData.cantidad_total,
        cantidad_vendidas: cantidadVendidas,
        cantidad_disponibles: this.formData.cantidad_disponibles
      });
    }

    // Preparar datos para envío
    const tipoData: Partial<TipoBoleta> = {
      ...this.formData,
      // Convertir fechas de datetime-local a ISO usando el servicio de timezone
      fecha_venta_inicio: this.formData.fecha_venta_inicio 
        ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_inicio as string)
        : undefined,
      fecha_venta_fin: this.formData.fecha_venta_fin 
        ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_fin as string)
        : undefined
    };

    // Limpiar campos vacíos opcionales
    if (!tipoData.descripcion) delete tipoData.descripcion;
    if (!tipoData.limite_por_persona) delete tipoData.limite_por_persona;
    if (!tipoData.fecha_venta_inicio) delete tipoData.fecha_venta_inicio;
    if (!tipoData.fecha_venta_fin) delete tipoData.fecha_venta_fin;

    if (this.editingTipo) {
      try {
        await this.boletasService.updateTipoBoleta(this.editingTipo.id, tipoData);
        this.closeModal();
        this.loadBoletas();
        this.loadAllTiposBoleta();
        if (this.eventoSeleccionado) {
          this.loadTiposBoleta(this.eventoSeleccionado);
        }
      } catch (err: any) {
        console.error('Error guardando tipo de boleta:', err);
        this.alertService.error('Error al guardar', 'Error al guardar tipo de boleta: ' + (err.message || 'Error desconocido'));
      }
    } else {
      try {
        await this.boletasService.createTipoBoleta(tipoData);
        this.closeModal();
        this.loadBoletas();
        this.loadAllTiposBoleta();
        if (this.eventoSeleccionado) {
          this.loadTiposBoleta(this.eventoSeleccionado);
        }
      } catch (err: any) {
        console.error('Error creando tipo de boleta:', err);
        this.alertService.error('Error al crear', 'Error al crear tipo de boleta: ' + (err.message || 'Error desconocido'));
      }
    }
  }

  async deleteTipoBoleta(tipo: TipoBoleta) {
    const confirmed = await this.alertService.confirm('Desactivar tipo de boleta', `¿Estás seguro de desactivar el tipo de boleta "${tipo.nombre}"?`);
    if (confirmed) {
      try {
        await this.boletasService.updateTipoBoleta(tipo.id, { activo: false });
        this.loadAllTiposBoleta();
        if (this.eventoSeleccionado) {
          this.loadTiposBoleta(this.eventoSeleccionado);
        }
      } catch (err) {
        console.error('Error desactivando tipo de boleta:', err);
        this.alertService.error('Error', 'Error al desactivar tipo de boleta');
      }
    }
  }

  getEventoNombre(eventoId: number): string {
    const evento = this.eventos.find(e => e.id === eventoId);
    return evento ? evento.titulo : `Evento #${eventoId}`;
  }

  getEstadoLabel(estado?: string): string {
    const estadoObj = this.estados.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  puedeValidar(boleta: BoletaComprada): boolean {
    // La boleta debe estar pendiente Y el pago debe estar completado
    const estadoPago = boleta.estado_pago || boleta.compra?.estado_pago;
    return boleta.estado === 'pendiente' && estadoPago === 'completado';
  }

  getTotalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const pages: number[] = [];
    const maxPages = 5; // Mostrar máximo 5 números de página
    
    if (totalPages <= maxPages) {
      // Si hay 5 o menos páginas, mostrar todas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Si hay más de 5 páginas, mostrar páginas alrededor de la actual
      let start = Math.max(1, this.page - 2);
      let end = Math.min(totalPages, start + maxPages - 1);
      
      // Ajustar el inicio si estamos cerca del final
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
      this.loadBoletas();
    }
  }

  Math = Math;
}
