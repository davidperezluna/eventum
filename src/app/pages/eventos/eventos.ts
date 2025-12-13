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
import { Evento, CategoriaEvento, Lugar, Usuario, PaginatedResponse, TipoEstadoEvento } from '../../types';

@Component({
  selector: 'app-eventos',
  imports: [CommonModule, FormsModule],
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
    private storageService: StorageService,
    private imageOptimizationService: ImageOptimizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategorias();
    this.loadLugares();
    this.loadOrganizadores();
    this.loadEventos();
  }

  loadCategorias() {
    this.categoriasService.getCategorias({ limit: 1000 }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.categorias = response.data;
      },
      error: (err) => console.error('Error cargando categorías:', err)
    });
  }

  loadLugares() {
    this.lugaresService.getLugares({ limit: 1000 }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.lugares = response.data;
      },
      error: (err) => console.error('Error cargando lugares:', err)
    });
  }

  loadOrganizadores() {
    console.log('loadOrganizadores llamado');
    this.usuariosService.getOrganizadores().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (organizadores) => {
        console.log('Organizadores recibidos en componente:', organizadores);
        console.log('Cantidad de organizadores:', organizadores.length);
        this.organizadores = organizadores || [];
        this.cdr.detectChanges();
        console.log('Organizadores asignados:', this.organizadores.length);
      },
      error: (err) => {
        console.error('Error cargando organizadores:', err);
        this.organizadores = [];
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en loadOrganizadores');
        this.cdr.detectChanges();
      }
    });
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
    
    this.eventosService.getEventos(filters).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: PaginatedResponse<Evento>) => {
        console.log('Response recibida en eventos:', response);
        this.eventos = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando eventos:', err);
        this.loading = false;
        this.eventos = [];
        this.total = 0;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en eventos');
        this.cdr.detectChanges();
      }
    });
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
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    // Formato: YYYY-MM-DDTHH:mm
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
          alert('La imagen es demasiado grande. Máximo 10MB.');
          return;
        }
        
        this.selectedFile = file;
        
        // Crear preview optimizado
        this.previewUrl = await this.imageOptimizationService.createPreview(file, 400);
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        alert('Error al procesar la imagen. Intenta con otro archivo.');
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
        alert('Error al subir la imagen: ' + (error.message || 'Error desconocido'));
        return null;
      }
      
      // Obtener URL pública
      const publicUrl = this.storageService.getPublicUrl('imagenes', fileName);
      
      console.log(`✅ Imagen subida: ${this.formatFileSize(originalSize)} → ${this.formatFileSize(optimizedSize)}`);
      
      return publicUrl;
    } catch (error: any) {
      console.error('❌ Error inesperado subiendo imagen:', error);
      alert('Error inesperado al subir la imagen: ' + (error.message || 'Error desconocido'));
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
      alert('El título es requerido');
      return;
    }
    if (!this.formData.categoria_id) {
      alert('La categoría es requerida');
      return;
    }
    // Si es organizador, asegurar que se use su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      } else {
        alert('No se pudo identificar el organizador');
        return;
      }
    } else if (!this.formData.organizador_id) {
      alert('El organizador es requerido');
      return;
    }
    if (!this.formData.fecha_inicio || !this.formData.fecha_fin) {
      alert('Las fechas de inicio y fin son requeridas');
      return;
    }
    if (!this.formData.fecha_venta_inicio || !this.formData.fecha_venta_fin) {
      alert('Las fechas de venta son requeridas');
      return;
    }

    // Subir imagen primero si hay una seleccionada
    let imagenUrl = this.formData.imagen_principal; // Mantener imagen actual por defecto
    if (this.selectedFile) {
      imagenUrl = await this.uploadImage() || imagenUrl;
      if (!imagenUrl && this.selectedFile) {
        alert('Error al subir la imagen. Intenta de nuevo.');
        return;
      }
    }

    // Preparar datos para envío
    const eventoData: Partial<Evento> = {
      ...this.formData,
      // Convertir fechas de string a ISO
      fecha_inicio: new Date(this.formData.fecha_inicio as string).toISOString(),
      fecha_fin: new Date(this.formData.fecha_fin as string).toISOString(),
      fecha_venta_inicio: new Date(this.formData.fecha_venta_inicio as string).toISOString(),
      fecha_venta_fin: new Date(this.formData.fecha_venta_fin as string).toISOString(),
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
      this.eventosService.updateEvento(this.editingEvento.id, eventoData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          this.closeModal();
          this.loadEventos();
        },
        error: (err) => {
          console.error('Error guardando evento:', err);
          alert('Error al guardar evento: ' + (err.message || 'Error desconocido'));
        }
      });
    } else {
      this.eventosService.createEvento(eventoData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          this.closeModal();
          this.loadEventos();
        },
        error: (err) => {
          console.error('Error creando evento:', err);
          alert('Error al crear evento: ' + (err.message || 'Error desconocido'));
        }
      });
    }
  }

  toggleDestacado(evento: Evento) {
    this.eventosService.updateEvento(evento.id, { destacado: !evento.destacado }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => this.loadEventos(),
      error: (err) => {
        console.error('Error actualizando evento:', err);
        alert('Error al actualizar evento');
      }
    });
  }

  toggleActivo(evento: Evento) {
    this.eventosService.updateEvento(evento.id, { activo: !evento.activo }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => this.loadEventos(),
      error: (err) => {
        console.error('Error actualizando evento:', err);
        alert('Error al actualizar evento');
      }
    });
  }

  getEstadoLabel(estado?: string): string {
    const estadoObj = this.estados.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  Math = Math;
}
