import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CalificacionesService } from '../../services/calificaciones.service';
import { Calificacion, PaginatedResponse } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-calificaciones',
  imports: [CommonModule, FormsModule, DateFormatPipe],
  templateUrl: './calificaciones.html',
  styleUrl: './calificaciones.css',
})
export class Calificaciones implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  calificaciones: Calificacion[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  eventoFiltro: number | null = null;
  activoFiltro: boolean | null = null;

  constructor(
    private calificacionesService: CalificacionesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCalificaciones();
  }

  loadCalificaciones() {
    console.log('loadCalificaciones llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.calificacionesService.getCalificaciones({
      page: this.page,
      limit: this.limit,
      evento_id: this.eventoFiltro || undefined,
      activo: this.activoFiltro !== null ? this.activoFiltro : undefined
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: PaginatedResponse<Calificacion>) => {
        console.log('Response recibida en calificaciones:', response);
        this.calificaciones = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando calificaciones:', err);
        this.loading = false;
        this.calificaciones = [];
        this.total = 0;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en calificaciones');
        this.cdr.detectChanges();
      }
    });
  }

  toggleActivo(calificacion: Calificacion) {
    this.calificacionesService.desactivarCalificacion(calificacion.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => this.loadCalificaciones(),
      error: (err) => {
        console.error('Error actualizando calificación:', err);
        alert('Error al actualizar calificación');
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getStars(rating: number): string[] {
    return Array(5).fill(0).map((_, i) => i < rating ? 'star' : 'star_border');
  }

  Math = Math;
}
