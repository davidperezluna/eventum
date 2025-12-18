import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { LugaresService } from '../../services/lugares.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { Evento, CategoriaEvento, Lugar, Usuario, PaginatedResponse, TipoEstadoEvento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-eventos',
  imports: [CommonModule, FormsModule, DateFormatPipe],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css',
})
export class Eventos implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  eventos: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  lugares: Lugar[] = [];
  organizadores: Usuario[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  searchTerm = '';
  categoriaFiltro: number | null = null;
  estadoFiltro: string | null = null;

  showModal = false;
  editingEvento: Evento | null = null;
  formData: Partial<Evento> = { activo: true, estado: TipoEstadoEvento.BORRADOR };
  
  // Propiedades para manejo de imágenes
  previewUrl: string | null = null;
  selectedFile: File | null = null;
  uploadingImage = false;

  estados: { value: TipoEstadoEvento; label: string }[] = [
    { value: TipoEstadoEvento.BORRADOR, label: 'Borrador' },
    { value: TipoEstadoEvento.PUBLICADO, label: 'Publicado' },
    { value: TipoEstadoEvento.EN_CURSO, label: 'En Curso' },
    { value: TipoEstadoEvento.FINALIZADO, label: 'Finalizado' },
    { value: TipoEstadoEvento.CANCELADO, label: 'Cancelado' }
  ];

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private lugaresService: LugaresService,
    private usuariosService: UsuariosService,
    public authService: AuthService,
    private timezoneService: TimezoneService,
    private storageService: StorageService,
    private imageOptimizationService: ImageOptimizationService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategorias();
    this.loadLugares();
    this.loadOrganizadores();
    this.loadEventos();
  }

  async loadCategorias() {
    try {
      const response = await this.categoriasService.getCategorias({ limit: 1000 });
      this.categorias = response.data;
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  }

  async loadLugares() {
    try {
      const response = await this.lugaresService.getLugares({ limit: 1000 });
      this.lugares = response.data;
    } catch (err) {
      console.error('Error cargando lugares:', err);
    }
  }

  async loadOrganizadores() {
    console.log('loadOrganizadores llamado');
    try {
      const organizadores = await this.usuariosService.getOrganizadores();
      console.log('Organizadores recibidos en componente:', organizadores);
      console.log('Cantidad de organizadores:', organizadores.length);
      this.organizadores = organizadores || [];
      this.cdr.detectChanges();
      console.log('Organizadores asignados:', this.organizadores.length);
    } catch (err) {
      console.error('Error cargando organizadores:', err);
      this.organizadores = [];
      this.cdr.detectChanges();
      this.cdr.detectChanges();
    }
  }

  loadEventos() {
    console.log('loadEventos llamado');
    this.loading = true;
    
    // Si es organizador, filtrar por su ID
    const filters: any = {
      page: this.page,
      limit: this.limit,
      search: this.searchTerm || undefined,
      categoria_id: this.categoriaFiltro || undefined,
      estado: this.estadoFiltro || undefined
    };
    
    // Si es organizador, agregar filtro de organizador_id
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        filters.organizador_id = organizadorId;
      }
    }
    this.cdr.detectChanges();
    
    this.loadEventosInternal(filters);
  }

  private async loadEventosInternal(filters: any) {
    try {
      const response: PaginatedResponse<Evento> = await this.eventosService.getEventos(filters);
      console.log('Response recibida en eventos:', response);
      this.eventos = response.data || [];
      this.total = response.total || 0;
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando eventos:', err);
      this.loading = false;
      this.eventos = [];
      this.total = 0;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openModal(evento?: Evento) {
    this.editingEvento = evento || null;
    const usuario = this.authService.getUsuario();
    
    // Resetear imagen
    this.previewUrl = null;
    this.selectedFile = null;
    
    // Si es organizador, siempre usar su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      }
    }
    
    if (evento) {
      // Convertir fechas a formato datetime-local
      this.formData = {
        ...evento,
        fecha_inicio: this.formatDateForInput(evento.fecha_inicio),
        fecha_fin: this.formatDateForInput(evento.fecha_fin),
        fecha_venta_inicio: this.formatDateForInput(evento.fecha_venta_inicio),
        fecha_venta_fin: this.formatDateForInput(evento.fecha_venta_fin)
      };
      // Si hay imagen existente, mostrar preview
      if (evento.imagen_principal) {
        this.previewUrl = evento.imagen_principal;
      }
    } else {
      // Nuevo evento - establecer valores por defecto
      this.formData = {
        activo: true,
        estado: TipoEstadoEvento.BORRADOR,
        organizador_id: usuario?.id || (this.organizadores.length > 0 ? this.organizadores[0].id : 0),
        es_gratis: false,
        edad_minima: 0,
        destacado: false
      };
    }
    this.showModal = true;
  }

  formatDateForInput(date: Date | string | undefined): string {
    if (!date) return '';
    // Usar el servicio de timezone para convertir de ISO a datetime-local
    return this.timezoneService.isoToDatetimeLocal(typeof date === 'string' ? date : date.toISOString());
  }

  closeModal() {
    this.showModal = false;
    this.editingEvento = null;
    this.formData = {};
    this.previewUrl = null;
    this.selectedFile = null;
  }
  
  // ========== MÉTODOS PARA MANEJO DE IMÁGENES ==========
  
  selectImage() {
    const input = document.getElementById('eventoImageInput') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }
  
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      try {
        // Validar tamaño (máximo 10MB)
        if (!this.imageOptimizationService.validateFileSize(file, 10)) {
          this.alertService.warning('Imagen demasiado grande', 'La imagen es demasiado grande. Máximo 10MB.');
          return;
        }
        
        this.selectedFile = file;
        
        // Crear preview optimizado
        this.previewUrl = await this.imageOptimizationService.createPreview(file, 400);
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        this.alertService.error('Error al procesar imagen', 'Error al procesar la imagen. Intenta con otro archivo.');
      }
    }
  }
  
  removeImage() {
    this.previewUrl = null;
    this.selectedFile = null;
    this.formData.imagen_principal = undefined;
    
    // Limpiar el input
    const input = document.getElementById('eventoImageInput') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
    this.cdr.detectChanges();
  }
  
  async uploadImage(): Promise<string | null> {
    if (!this.selectedFile) return null;
    
    try {
      this.uploadingImage = true;
      this.cdr.detectChanges();
      
      const usuario = this.authService.getUsuario();
      if (!usuario) {
        throw new Error('No hay usuario autenticado');
      }
      
      // Crear nombre único para el archivo
      const timestamp = Date.now();
      const fileName = `eventos/${usuario.id}/evento_${timestamp}.jpg`;
      
      const { data, error, originalSize, optimizedSize } = await this.storageService.uploadOptimizedImage('imagenes', fileName, this.selectedFile);
      
      if (error) {
        console.error('❌ Error subiendo imagen:', error);
        this.alertService.error('Error al subir imagen', 'Error al subir la imagen: ' + (error.message || 'Error desconocido'));
        return null;
      }
      
      // Obtener URL pública
      const publicUrl = this.storageService.getPublicUrl('imagenes', fileName);
      
      console.log(`✅ Imagen subida: ${this.formatFileSize(originalSize)} → ${this.formatFileSize(optimizedSize)}`);
      
      return publicUrl;
    } catch (error: any) {
      console.error('❌ Error inesperado subiendo imagen:', error);
      this.alertService.error('Error inesperado', 'Error inesperado al subir la imagen: ' + (error.message || 'Error desconocido'));
      return null;
    } finally {
      this.uploadingImage = false;
      this.cdr.detectChanges();
    }
  }
  
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async saveEvento() {
    // Validaciones básicas
    if (!this.formData.titulo || !this.formData.titulo.trim()) {
      this.alertService.warning('Campo requerido', 'El título es requerido');
      return;
    }
    if (!this.formData.categoria_id) {
      this.alertService.warning('Campo requerido', 'La categoría es requerida');
      return;
    }
    // Si es organizador, asegurar que se use su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      } else {
        this.alertService.error('Error', 'No se pudo identificar el organizador');
        return;
      }
    } else if (!this.formData.organizador_id) {
      this.alertService.warning('Campo requerido', 'El organizador es requerido');
      return;
    }
    if (!this.formData.fecha_inicio || !this.formData.fecha_fin) {
      this.alertService.warning('Campo requerido', 'Las fechas de inicio y fin son requeridas');
      return;
    }
    if (!this.formData.fecha_venta_inicio || !this.formData.fecha_venta_fin) {
      this.alertService.warning('Campo requerido', 'Las fechas de venta son requeridas');
      return;
    }

    // Subir imagen primero si hay una seleccionada
    let imagenUrl = this.formData.imagen_principal; // Mantener imagen actual por defecto
    if (this.selectedFile) {
      imagenUrl = await this.uploadImage() || imagenUrl;
      if (!imagenUrl && this.selectedFile) {
        this.alertService.error('Error al subir imagen', 'Error al subir la imagen. Intenta de nuevo.');
        return;
      }
    }

    // Preparar datos para envío
    const eventoData: Partial<Evento> = {
      ...this.formData,
      // Convertir fechas de datetime-local a ISO usando el servicio de timezone
      fecha_inicio: this.timezoneService.datetimeLocalToISO(this.formData.fecha_inicio as string),
      fecha_fin: this.timezoneService.datetimeLocalToISO(this.formData.fecha_fin as string),
      fecha_venta_inicio: this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_inicio as string),
      fecha_venta_fin: this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_fin as string),
      // Asegurar que organizador_id esté presente
      organizador_id: this.formData.organizador_id || 0,
      // Agregar URL de imagen
      imagen_principal: imagenUrl || undefined
    };

    // Limpiar campos vacíos opcionales
    if (!eventoData.descripcion) delete eventoData.descripcion;
    if (!eventoData.descripcion_corta) delete eventoData.descripcion_corta;
    if (!eventoData.imagen_principal) delete eventoData.imagen_principal;
    if (!eventoData.tags) delete eventoData.tags;
    if (!eventoData.terminos_condiciones) delete eventoData.terminos_condiciones;
    if (!eventoData.politica_reembolso) delete eventoData.politica_reembolso;

    if (this.editingEvento) {
      this.saveEventoInternal(this.editingEvento.id, eventoData, true);
    } else {
      this.saveEventoInternal(null, eventoData, false);
    }
  }

  private async saveEventoInternal(id: number | null, eventoData: Partial<Evento>, isUpdate: boolean) {
    try {
      if (isUpdate && id) {
        await this.eventosService.updateEvento(id, eventoData);
      } else {
        await this.eventosService.createEvento(eventoData);
      }
      this.closeModal();
      this.loadEventos();
    } catch (err: any) {
      console.error(`Error ${isUpdate ? 'guardando' : 'creando'} evento:`, err);
      this.alertService.error(`Error al ${isUpdate ? 'guardar' : 'crear'}`, `Error al ${isUpdate ? 'guardar' : 'crear'} evento: ` + (err.message || 'Error desconocido'));
    }
  }

  async toggleDestacado(evento: Evento) {
    try {
      await this.eventosService.updateEvento(evento.id, { destacado: !evento.destacado });
      this.loadEventos();
    } catch (err) {
      console.error('Error actualizando evento:', err);
      this.alertService.error('Error', 'Error al actualizar evento');
    }
  }

  async toggleActivo(evento: Evento) {
    try {
      await this.eventosService.updateEvento(evento.id, { activo: !evento.activo });
      this.loadEventos();
    } catch (err) {
      console.error('Error actualizando evento:', err);
      this.alertService.error('Error', 'Error al actualizar evento');
    }
  }

  getEstadoLabel(estado?: string): string {
    const estadoObj = this.estados.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  Math = Math;
}
