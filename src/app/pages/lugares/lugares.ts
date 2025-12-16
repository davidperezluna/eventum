import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LugaresService } from '../../services/lugares.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { Lugar, PaginatedResponse } from '../../types';

@Component({
  selector: 'app-lugares',
  imports: [CommonModule, FormsModule],
  templateUrl: './lugares.html',
  styleUrl: './lugares.css',
})
export class Lugares implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  lugares: Lugar[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  searchTerm = '';

  showModal = false;
  editingLugar: Lugar | null = null;
  formData: Partial<Lugar> = { activo: true, pais: 'Colombia' };
  
  // Propiedades para manejo de imágenes
  previewUrl: string | null = null;
  selectedFile: File | null = null;
  uploadingImage = false;

  constructor(
    private lugaresService: LugaresService,
    private storageService: StorageService,
    private imageOptimizationService: ImageOptimizationService,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadLugares();
  }

  loadLugares() {
    console.log('loadLugares llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.lugaresService.getLugares({
      page: this.page,
      limit: this.limit,
      search: this.searchTerm || undefined
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: PaginatedResponse<Lugar>) => {
        console.log('Response recibida en lugares:', response);
        this.lugares = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando lugares:', err);
        this.loading = false;
        this.lugares = [];
        this.total = 0;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en lugares');
        this.cdr.detectChanges();
      }
    });
  }

  openModal(lugar?: Lugar) {
    this.editingLugar = lugar || null;
    
    // Resetear imagen
    this.previewUrl = null;
    this.selectedFile = null;
    
    if (lugar) {
      this.formData = { ...lugar };
      // Si hay imagen existente, mostrar preview
      if (lugar.imagen_principal) {
        this.previewUrl = lugar.imagen_principal;
      }
    } else {
      this.formData = { activo: true, pais: 'Colombia' };
    }
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingLugar = null;
    this.formData = { activo: true, pais: 'Colombia' };
    this.previewUrl = null;
    this.selectedFile = null;
  }
  
  // ========== MÉTODOS PARA MANEJO DE IMÁGENES ==========
  
  selectImage() {
    const input = document.getElementById('lugarImageInput') as HTMLInputElement;
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
    const input = document.getElementById('lugarImageInput') as HTMLInputElement;
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
      const fileName = `lugares/${usuario.id}/lugar_${timestamp}.jpg`;
      
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

  async saveLugar() {
    // Validaciones básicas
    if (!this.formData.nombre || !this.formData.direccion || !this.formData.ciudad) {
      this.alertService.warning('Campos requeridos', 'Nombre, dirección y ciudad son campos requeridos');
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

    // Preparar datos (el servicio normalizará los valores numéricos)
    // Los valores del formulario pueden venir como string desde ngModel
    const formDataRaw: any = this.formData;
    const lugarData: Partial<Lugar> = {};
    
    // Copiar campos no numéricos directamente
    lugarData.nombre = formDataRaw.nombre;
    lugarData.direccion = formDataRaw.direccion;
    lugarData.ciudad = formDataRaw.ciudad;
    lugarData.pais = formDataRaw.pais;
    lugarData.telefono = formDataRaw.telefono;
    lugarData.email = formDataRaw.email;
    lugarData.sitio_web = formDataRaw.sitio_web;
    lugarData.descripcion = formDataRaw.descripcion;
    lugarData.activo = formDataRaw.activo;
    lugarData.imagen_principal = imagenUrl || undefined;
    
    // Convertir y validar valores numéricos
    // Los valores pueden venir como string desde el formulario
    if (formDataRaw.latitud !== null && formDataRaw.latitud !== undefined && formDataRaw.latitud !== '') {
      const latValue = formDataRaw.latitud;
      const latStr = String(latValue).trim();
      if (latStr !== '') {
        const latNum = Number(latStr);
        if (!isNaN(latNum)) {
          lugarData.latitud = latNum;
        }
      }
    }
    
    if (formDataRaw.longitud !== null && formDataRaw.longitud !== undefined && formDataRaw.longitud !== '') {
      const lngValue = formDataRaw.longitud;
      const lngStr = String(lngValue).trim();
      if (lngStr !== '') {
        const lngNum = Number(lngStr);
        if (!isNaN(lngNum)) {
          lugarData.longitud = lngNum;
        }
      }
    }
    
    if (formDataRaw.capacidad_maxima !== null && formDataRaw.capacidad_maxima !== undefined && formDataRaw.capacidad_maxima !== '') {
      const capValue = formDataRaw.capacidad_maxima;
      const capStr = String(capValue).trim();
      if (capStr !== '') {
        const capNum = Number(capStr);
        if (!isNaN(capNum) && capNum > 0) {
          lugarData.capacidad_maxima = Math.floor(capNum);
        }
      }
    }

    console.log('Datos a guardar (antes de normalización):', lugarData);

    if (this.editingLugar) {
      this.lugaresService.updateLugar(this.editingLugar.id, lugarData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          console.log('Lugar actualizado exitosamente');
          this.closeModal();
          this.loadLugares();
        },
        error: (err) => {
          console.error('Error guardando lugar:', err);
          const errorMessage = err?.message || err?.error?.message || 'Error al guardar lugar';
          this.alertService.error('Error al guardar', `Error al guardar lugar: ${errorMessage}`);
        }
      });
    } else {
      this.lugaresService.createLugar(lugarData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          console.log('Lugar creado exitosamente');
          this.closeModal();
          this.loadLugares();
        },
        error: (err) => {
          console.error('Error creando lugar:', err);
          const errorMessage = err?.message || err?.error?.message || 'Error al crear lugar';
          this.alertService.error('Error al crear', `Error al crear lugar: ${errorMessage}`);
        }
      });
    }
  }

  toggleActivo(lugar: Lugar) {
    this.lugaresService.updateLugar(lugar.id, { activo: !lugar.activo }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => this.loadLugares(),
      error: (err) => {
        console.error('Error actualizando lugar:', err);
        this.alertService.error('Error', 'Error al actualizar lugar');
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  Math = Math;
}
