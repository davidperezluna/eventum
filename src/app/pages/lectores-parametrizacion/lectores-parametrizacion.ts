import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService, RolesPermitidos } from '../../services/auth.service';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { UsuariosService } from '../../services/usuarios.service';
import { LectorEventoTipoBoletaService } from '../../services/lector-evento-tipo-boleta.service';
import { AlertService } from '../../services/alert.service';
import {
  Evento,
  LectorEventoTipoBoleta,
  TipoBoleta,
  Usuario,
} from '../../types';

@Component({
  selector: 'app-lectores-parametrizacion',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lectores-parametrizacion.html',
  styleUrl: './lectores-parametrizacion.css',
  standalone: true,
})
export class LectoresParametrizacion implements OnInit {
  filas: LectorEventoTipoBoleta[] = [];
  loading = false;
  showModal = false;

  lectores: Usuario[] = [];
  eventos: Evento[] = [];
  tiposBoletaEvento: TipoBoleta[] = [];

  formUsuarioId: number | null = null;
  formEventoId: number | null = null;
  /** IDs de tipos de boleta seleccionados para la asignación actual */
  tiposSeleccionados: Set<number> = new Set();
  formPermitirProductos = false;

  constructor(
    private authService: AuthService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private usuariosService: UsuariosService,
    private lectorEvtService: LectorEventoTipoBoletaService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarTabla();
  }

  async cargarTabla(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();
    try {
      this.filas = await this.lectorEvtService.listar();
    } catch (e) {
      console.error(e);
      this.filas = [];
      await this.alertService.error('No se pudo cargar la parametrización de lectores.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async abrirModal(): Promise<void> {
    this.formUsuarioId = null;
    this.formEventoId = null;
    this.tiposBoletaEvento = [];
    this.tiposSeleccionados = new Set();
    this.formPermitirProductos = false;
    this.showModal = true;

    try {
      const [lectRes, evRes] = await Promise.all([
        this.usuariosService.getUsuarios({
          page: 1,
          limit: 500,
          tipo_usuario_id: RolesPermitidos.LECTOR,
          activo: true,
        }),
        this.eventosService.getEventos({
          page: 1,
          limit: 500,
          ...(this.authService.isOrganizador()
            ? { organizador_id: this.authService.getUsuarioId() ?? undefined }
            : {}),
        }),
      ]);
      this.lectores = lectRes.data || [];
      this.eventos = evRes.data || [];
    } catch (e) {
      console.error(e);
      this.lectores = [];
      this.eventos = [];
      await this.alertService.error('Error al cargar lectores o eventos.');
    }
    this.cdr.markForCheck();
  }

  cerrarModal(): void {
    this.showModal = false;
    this.cdr.markForCheck();
  }

  async onEventoCambiado(): Promise<void> {
    this.tiposSeleccionados = new Set();
    this.tiposBoletaEvento = [];
    if (!this.formEventoId) {
      this.cdr.markForCheck();
      return;
    }
    try {
      this.tiposBoletaEvento = await this.boletasService.getTiposBoleta(this.formEventoId);
    } catch (e) {
      console.error(e);
      this.tiposBoletaEvento = [];
      await this.alertService.error('No se pudieron cargar los tipos de boleta del evento.');
    }
    this.cdr.markForCheck();
  }

  toggleTipo(id: number): void {
    if (this.tiposSeleccionados.has(id)) {
      this.tiposSeleccionados.delete(id);
    } else {
      this.tiposSeleccionados.add(id);
    }
    this.tiposSeleccionados = new Set(this.tiposSeleccionados);
    this.cdr.markForCheck();
  }

  isTipoSeleccionado(id: number): boolean {
    return this.tiposSeleccionados.has(id);
  }

  async guardarAsignacion(): Promise<void> {
    if (!this.formUsuarioId || !this.formEventoId) {
      await this.alertService.warning('Selecciona lector y evento.');
      return;
    }
    const ids = [...this.tiposSeleccionados];
    if (!ids.length && !this.formPermitirProductos) {
      await this.alertService.warning('Selecciona al menos un tipo de boleta o habilita productos para el evento.');
      return;
    }
    try {
      const operaciones: Promise<void>[] = [];
      if (ids.length) {
        operaciones.push(
          this.lectorEvtService.crearAsignaciones(
            this.formUsuarioId,
            this.formEventoId,
            ids
          )
        );
      }
      if (this.formPermitirProductos) {
        operaciones.push(
          this.lectorEvtService.crearAsignacionProductos(
            this.formUsuarioId,
            this.formEventoId
          )
        );
      }

      await Promise.all(operaciones);
      await this.alertService.success('Asignación guardada correctamente.');
      this.cerrarModal();
      await this.cargarTabla();
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.message ||
        e?.error_description ||
        'No se pudo guardar. Verifica que el usuario sea Lector y que los tipos pertenezcan al evento.';
      await this.alertService.error(msg);
    }
  }

  async eliminarFila(fila: LectorEventoTipoBoleta): Promise<void> {
    const esPermisoProducto = fila.tipo_boleta_id == null;
    const ok = await this.alertService.confirm(
      esPermisoProducto ? '¿Eliminar permiso de productos?' : '¿Eliminar esta asignación?',
      esPermisoProducto
        ? 'Se quitará el permiso de escaneo de productos para este evento.'
        : 'Se quitará el permiso de escaneo para ese tipo de boleta.'
    );
    if (!ok) {
      return;
    }
    try {
      await this.lectorEvtService.eliminar(fila.id);
      await this.alertService.success('Asignación eliminada.');
      await this.cargarTabla();
    } catch (e) {
      console.error(e);
      await this.alertService.error('No se pudo eliminar.');
    }
  }

  nombreLector(f: LectorEventoTipoBoleta): string {
    const u = f.usuarios;
    if (!u) return `#${f.usuario_id}`;
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return n || u.email || `#${u.id}`;
  }

  tituloEvento(f: LectorEventoTipoBoleta): string {
    return f.eventos?.titulo || `#${f.evento_id}`;
  }

  nombreTipoBoleta(f: LectorEventoTipoBoleta): string {
    if (f.tipo_boleta_id == null) {
      return 'Productos del evento';
    }
    return f.tipos_boleta?.nombre || `#${f.tipo_boleta_id}`;
  }

  get filasBoletas(): LectorEventoTipoBoleta[] {
    return this.filas.filter((f) => f.tipo_boleta_id != null);
  }

  get filasProductos(): LectorEventoTipoBoleta[] {
    return this.filas.filter((f) => f.tipo_boleta_id == null);
  }

  etiquetaLectorEnLista(u: Usuario): string {
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return (n ? `${n} — ` : '') + (u.email || `#${u.id}`);
  }
}
