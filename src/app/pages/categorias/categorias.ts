import { Component, OnInit, OnDestroy, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CategoriasService } from '../../services/categorias.service';
import { AlertService } from '../../services/alert.service';
import { CategoriaEvento, PaginatedResponse } from '../../types';

@Component({
  selector: 'app-categorias',
  imports: [CommonModule, FormsModule],
  templateUrl: './categorias.html',
  styleUrl: './categorias.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Categorias implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  categorias: CategoriaEvento[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  searchTerm = '';

  showModal = false;
  editingCategoria: CategoriaEvento | null = null;
  formData: Partial<CategoriaEvento> = {};
  
  // Lista de iconos de Ionic para categorías
  iconosDisponibles: string[] = [
    'musical-notes', 'mic', 'film', 'football', 'basketball', 'tennisball',
    'wine', 'restaurant', 'cafe', 'beer', 'pizza', 'ice-cream',
    'car', 'airplane', 'train', 'boat', 'bicycle', 'walk',
    'heart', 'star', 'gift', 'balloon', 'confetti', 'trophy',
    'school', 'library', 'book', 'brush', 'color-palette', 'camera',
    'fitness', 'barbell', 'bicycle', 'walk', 'medical', 'pulse',
    'home', 'business', 'storefront', 'location', 'map', 'compass',
    'game-controller', 'musical-note', 'radio', 'tv', 'laptop', 'phone-portrait',
    'people', 'person', 'happy', 'partly-sunny', 'moon', 'sunny',
    'calendar', 'time', 'alarm', 'stopwatch', 'hourglass', 'timer'
  ];

  constructor(
    private categoriasService: CategoriasService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategorias();
  }

  loadCategorias() {
    console.log('loadCategorias llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.categoriasService.getCategorias({
      page: this.page,
      limit: this.limit,
      search: this.searchTerm || undefined
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: PaginatedResponse<CategoriaEvento>) => {
        console.log('Response recibida en categorias:', response);
        this.categorias = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando categorías:', err);
        this.loading = false;
        this.categorias = [];
        this.total = 0;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en categorias');
        this.cdr.detectChanges();
      }
    });
  }

  openModal(categoria?: CategoriaEvento) {
    this.editingCategoria = categoria || null;
    this.formData = categoria ? { ...categoria } : { activo: true };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingCategoria = null;
    this.formData = {};
  }

  saveCategoria() {
    // Validar que el nombre esté presente
    if (!this.formData.nombre || this.formData.nombre.trim() === '') {
      this.alertService.warning('Campo requerido', 'El nombre de la categoría es requerido');
      return;
    }

    console.log('Guardando categoría:', this.formData);
    console.log('Editando:', this.editingCategoria ? 'Sí' : 'No');

    if (this.editingCategoria) {
      console.log('Actualizando categoría ID:', this.editingCategoria.id);
      this.categoriasService.updateCategoria(this.editingCategoria.id, this.formData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (data) => {
          console.log('Categoría actualizada exitosamente:', data);
          this.closeModal();
          this.loadCategorias();
        },
        error: (err) => {
          console.error('Error guardando categoría:', err);
          this.alertService.error('Error al guardar', 'Error al guardar categoría: ' + (err.message || 'Error desconocido'));
        }
      });
    } else {
      console.log('Creando nueva categoría');
      this.categoriasService.createCategoria(this.formData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (data) => {
          console.log('Categoría creada exitosamente:', data);
          this.closeModal();
          this.loadCategorias();
        },
        error: (err) => {
          console.error('Error creando categoría:', err);
          this.alertService.error('Error al crear', 'Error al crear categoría: ' + (err.message || 'Error desconocido'));
        }
      });
    }
  }

  async deleteCategoria(id: number) {
    const confirmed = await this.alertService.confirm('Desactivar categoría', '¿Estás seguro de desactivar esta categoría?');
    if (confirmed) {
      this.categoriasService.deleteCategoria(id).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => this.loadCategorias(),
        error: (err) => {
          console.error('Error eliminando categoría:', err);
          this.alertService.error('Error', 'Error al eliminar categoría');
        }
      });
    }
  }

  toggleActivo(categoria: CategoriaEvento) {
    this.categoriasService.updateCategoria(categoria.id, { activo: !categoria.activo }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => this.loadCategorias(),
      error: (err) => {
        console.error('Error actualizando categoría:', err);
        this.alertService.error('Error', 'Error al actualizar categoría');
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectIcon(icono: string) {
    this.formData.icono = icono;
  }

  Math = Math;
}
