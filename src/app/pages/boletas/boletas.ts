import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoletasService } from '../../services/boletas.service';
import { EventosService } from '../../services/eventos.service';
import { BoletaComprada, TipoBoleta, PaginatedResponse, TipoEstadoBoleta, Evento } from '../../types';

@Component({
  selector: 'app-boletas',
  imports: [CommonModule, FormsModule],
  templateUrl: './boletas.html',
  styleUrl: './boletas.css',
})
export class Boletas implements OnInit {
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
  showTiposSection = false;

  showModal = false;
  showTiposModal = false;
  editingTipo: TipoBoleta | null = null;
  formData: Partial<TipoBoleta> = { activo: true };
  eventoSeleccionado: number | null = null;
  tiposBoletaEvento: TipoBoleta[] = [];

  estados: { value: TipoEstadoBoleta; label: string }[] = [
    { value: TipoEstadoBoleta.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoBoleta.USADA, label: 'Usada' },
    { value: TipoEstadoBoleta.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoBoleta.REEMBOLSADA, label: 'Reembolsada' }
  ];

  constructor(
    private boletasService: BoletasService,
    private eventosService: EventosService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadEventos();
    this.loadBoletas();
    this.loadAllTiposBoleta();
  }

  loadAllTiposBoleta() {
    this.loadingTipos = true;
    this.boletasService.getAllTiposBoleta({ activo: true }).subscribe({
      next: (tipos) => {
        this.tiposBoleta = tipos || [];
        this.loadingTipos = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando tipos de boleta:', err);
        this.tiposBoleta = [];
        this.loadingTipos = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadEventos() {
    this.eventosService.getEventos({ limit: 1000, page: 1 }).subscribe({
      next: (response) => {
        this.eventos = response.data || [];
      },
      error: (err) => console.error('Error cargando eventos:', err)
    });
  }

  loadBoletas() {
    console.log('loadBoletas llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.boletasService.getBoletasCompradas({
      page: this.page,
      limit: this.limit,
      estado: this.estadoFiltro || undefined,
      tipo_boleta_id: this.eventoFiltro ? undefined : undefined // Filtro por tipo si se implementa
    }).subscribe({
      next: (response: PaginatedResponse<BoletaComprada>) => {
        console.log('Response recibida en boletas:', response);
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
      },
      complete: () => {
        console.log('Observable completado en boletas');
        this.cdr.detectChanges();
      }
    });
  }

  loadTiposBoleta(eventoId: number) {
    this.boletasService.getTiposBoleta(eventoId).subscribe({
      next: (tipos) => {
        this.tiposBoletaEvento = tipos || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando tipos de boleta:', err);
        this.tiposBoletaEvento = [];
      }
    });
  }

  openTiposModalFromTipo(tipoBoletaId: number) {
    // Obtener el tipo de boleta para conseguir el evento_id
    this.boletasService.getTipoBoletaById(tipoBoletaId).subscribe({
      next: (tipo) => {
        this.openTiposModal(tipo.evento_id);
      },
      error: (err) => {
        console.error('Error obteniendo tipo de boleta:', err);
        alert('Error al obtener información del tipo de boleta');
      }
    });
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
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  saveTipoBoleta() {
    // Validaciones
    if (!this.formData.evento_id) {
      alert('El evento es requerido');
      return;
    }
    if (!this.formData.nombre || !this.formData.nombre.trim()) {
      alert('El nombre es requerido');
      return;
    }
    if (!this.formData.precio || this.formData.precio < 0) {
      alert('El precio debe ser mayor o igual a 0');
      return;
    }
    if (!this.formData.cantidad_total || this.formData.cantidad_total <= 0) {
      alert('La cantidad total debe ser mayor a 0');
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
      // Convertir fechas de string a ISO si existen
      fecha_venta_inicio: this.formData.fecha_venta_inicio 
        ? new Date(this.formData.fecha_venta_inicio as string).toISOString() 
        : undefined,
      fecha_venta_fin: this.formData.fecha_venta_fin 
        ? new Date(this.formData.fecha_venta_fin as string).toISOString() 
        : undefined
    };

    // Limpiar campos vacíos opcionales
    if (!tipoData.descripcion) delete tipoData.descripcion;
    if (!tipoData.limite_por_persona) delete tipoData.limite_por_persona;
    if (!tipoData.fecha_venta_inicio) delete tipoData.fecha_venta_inicio;
    if (!tipoData.fecha_venta_fin) delete tipoData.fecha_venta_fin;

    if (this.editingTipo) {
      this.boletasService.updateTipoBoleta(this.editingTipo.id, tipoData).subscribe({
        next: () => {
          this.closeModal();
          this.loadBoletas();
          this.loadAllTiposBoleta();
          if (this.eventoSeleccionado) {
            this.loadTiposBoleta(this.eventoSeleccionado);
          }
        },
        error: (err) => {
          console.error('Error guardando tipo de boleta:', err);
          alert('Error al guardar tipo de boleta: ' + (err.message || 'Error desconocido'));
        }
      });
    } else {
      this.boletasService.createTipoBoleta(tipoData).subscribe({
        next: () => {
          this.closeModal();
          this.loadBoletas();
          this.loadAllTiposBoleta();
          if (this.eventoSeleccionado) {
            this.loadTiposBoleta(this.eventoSeleccionado);
          }
        },
        error: (err) => {
          console.error('Error creando tipo de boleta:', err);
          alert('Error al crear tipo de boleta: ' + (err.message || 'Error desconocido'));
        }
      });
    }
  }

  deleteTipoBoleta(tipo: TipoBoleta) {
    if (confirm(`¿Estás seguro de desactivar el tipo de boleta "${tipo.nombre}"?`)) {
      this.boletasService.updateTipoBoleta(tipo.id, { activo: false }).subscribe({
        next: () => {
          this.loadAllTiposBoleta();
          if (this.eventoSeleccionado) {
            this.loadTiposBoleta(this.eventoSeleccionado);
          }
        },
        error: (err) => {
          console.error('Error desactivando tipo de boleta:', err);
          alert('Error al desactivar tipo de boleta');
        }
      });
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

  Math = Math;
}
