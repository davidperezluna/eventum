import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificacionesService } from '../../services/notificaciones.service';
import { AlertService } from '../../services/alert.service';
import { Notificacion, PaginatedResponse, TipoTipoNotificacion } from '../../types';
import { UsuariosService } from '../../services/usuarios.service';
import { Usuario } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-notificaciones',
  imports: [CommonModule, FormsModule, DateFormatPipe],
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
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadNotificaciones();
    this.loadUsuarios();
  }

  async loadUsuarios() {
    try {
      const response = await this.usuariosService.getUsuarios({ limit: 1000 });
      this.usuarios = response.data;
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    }
  }

  async loadNotificaciones() {
    console.log('loadNotificaciones llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    try {
      const response = await this.notificacionesService.getNotificaciones({
        page: this.page,
        limit: this.limit
      });
      
      console.log('Response recibida en notificaciones:', response);
      this.notificaciones = response.data || [];
      this.total = response.total || 0;
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando notificaciones:', err);
      this.loading = false;
      this.notificaciones = [];
      this.total = 0;
      this.cdr.detectChanges();
    }
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

  async saveNotificacion() {
    try {
      if (this.enviarMasivo && this.selectedUserIds.length > 0) {
        await this.notificacionesService.createNotificacionesMasivas(
          this.selectedUserIds,
          this.formData.titulo!,
          this.formData.mensaje!,
          this.formData.tipo || TipoTipoNotificacion.INFO
        );
        this.closeModal();
        this.loadNotificaciones();
      } else if (this.formData.usuario_id) {
        await this.notificacionesService.createNotificacion(this.formData);
        this.closeModal();
        this.loadNotificaciones();
      } else {
        this.alertService.warning('Selección requerida', 'Selecciona al menos un usuario');
      }
    } catch (err) {
      console.error('Error creando notificación:', err);
      this.alertService.error('Error', 'Error al crear notificación');
    }
  }

  async deleteNotificacion(id: number) {
    const confirmed = await this.alertService.confirm('Eliminar notificación', '¿Estás seguro de eliminar esta notificación?');
    if (confirmed) {
      try {
        await this.notificacionesService.deleteNotificacion(id);
        this.loadNotificaciones();
      } catch (err) {
        console.error('Error eliminando notificación:', err);
        this.alertService.error('Error', 'Error al eliminar notificación');
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  Math = Math;
}
