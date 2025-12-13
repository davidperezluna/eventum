import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificacionesService } from '../../services/notificaciones.service';
import { Notificacion, PaginatedResponse, TipoTipoNotificacion } from '../../types';
import { UsuariosService } from '../../services/usuarios.service';
import { Usuario } from '../../types';

@Component({
  selector: 'app-notificaciones',
  imports: [CommonModule, FormsModule],
  templateUrl: './notificaciones.html',
  styleUrl: './notificaciones.css',
})
export class Notificaciones implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  notificaciones: Notificacion[] = [];
  usuarios: Usuario[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;

  showModal = false;
  formData: Partial<Notificacion> = { tipo: TipoTipoNotificacion.INFO };
  selectedUserIds: number[] = [];
  enviarMasivo = false;

  tiposNotificacion: { value: TipoTipoNotificacion; label: string }[] = [
    { value: TipoTipoNotificacion.INFO, label: 'Info' },
    { value: TipoTipoNotificacion.SUCCESS, label: 'Éxito' },
    { value: TipoTipoNotificacion.WARNING, label: 'Advertencia' },
    { value: TipoTipoNotificacion.ERROR, label: 'Error' },
    { value: TipoTipoNotificacion.COMPRA, label: 'Compra' },
    { value: TipoTipoNotificacion.EVENTO, label: 'Evento' }
  ];

  constructor(
    private notificacionesService: NotificacionesService,
    private usuariosService: UsuariosService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadNotificaciones();
    this.loadUsuarios();
  }

  loadUsuarios() {
    this.usuariosService.getUsuarios({ limit: 1000 }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.usuarios = response.data;
      },
      error: (err) => console.error('Error cargando usuarios:', err)
    });
  }

  loadNotificaciones() {
    console.log('loadNotificaciones llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.notificacionesService.getNotificaciones({
      page: this.page,
      limit: this.limit
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: PaginatedResponse<Notificacion>) => {
        console.log('Response recibida en notificaciones:', response);
        this.notificaciones = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando notificaciones:', err);
        this.loading = false;
        this.notificaciones = [];
        this.total = 0;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en notificaciones');
        this.cdr.detectChanges();
      }
    });
  }

  openModal() {
    this.formData = { tipo: TipoTipoNotificacion.INFO };
    this.selectedUserIds = [];
    this.enviarMasivo = false;
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.formData = { tipo: TipoTipoNotificacion.INFO };
    this.selectedUserIds = [];
  }

  saveNotificacion() {
    if (this.enviarMasivo && this.selectedUserIds.length > 0) {
      this.notificacionesService.createNotificacionesMasivas(
        this.selectedUserIds,
        this.formData.titulo!,
        this.formData.mensaje!,
        this.formData.tipo || TipoTipoNotificacion.INFO
      ).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          this.closeModal();
          this.loadNotificaciones();
        },
        error: (err) => {
          console.error('Error creando notificaciones:', err);
          alert('Error al crear notificaciones');
        }
      });
    } else if (this.formData.usuario_id) {
      this.notificacionesService.createNotificacion(this.formData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          this.closeModal();
          this.loadNotificaciones();
        },
        error: (err) => {
          console.error('Error creando notificación:', err);
          alert('Error al crear notificación');
        }
      });
    } else {
      alert('Selecciona al menos un usuario');
    }
  }

  deleteNotificacion(id: number) {
    if (confirm('¿Estás seguro de eliminar esta notificación?')) {
      this.notificacionesService.deleteNotificacion(id).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => this.loadNotificaciones(),
        error: (err) => {
          console.error('Error eliminando notificación:', err);
          alert('Error al eliminar notificación');
        }
      });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  Math = Math;
}
