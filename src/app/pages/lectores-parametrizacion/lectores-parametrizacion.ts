import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService, RolesPermitidos } from '../../services/auth.service';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { UsuariosService } from '../../services/usuarios.service';
import { LectorEventoTipoBoletaService } from '../../services/lector-evento-tipo-boleta.service';
import { LectorEventoProductoService } from '../../services/lector-evento-producto.service';
import { AlertService } from '../../services/alert.service';
import {
  Evento,
  LectorEventoProducto,
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
  filasProductos: LectorEventoProducto[] = [];
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
    private lectorEventoProductoService: LectorEventoProductoService,
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
      const [filasBoletas, filasProductos] = await Promise.all([
        this.lectorEvtService.listar(),
        this.lectorEventoProductoService.listar(),
      ]);
      this.filas = filasBoletas;
      this.filasProductos = filasProductos;
    } catch (e) {
      console.error(e);
      this.filas = [];
      this.filasProductos = [];
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
          this.lectorEventoProductoService.crearAsignacion(
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
    const ok = await this.alertService.confirm(
      '¿Eliminar esta asignación?',
      'Se quitará el permiso de escaneo para ese tipo de boleta.'
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

  async eliminarFilaProducto(fila: LectorEventoProducto): Promise<void> {
    const ok = await this.alertService.confirm(
      '¿Eliminar permiso de productos?',
      'Se quitará el permiso de escaneo de productos para este evento.'
    );
    if (!ok) {
      return;
    }
    try {
      await this.lectorEventoProductoService.eliminar(fila.id);
      await this.alertService.success('Permiso eliminado.');
      await this.cargarTabla();
    } catch (e) {
      console.error(e);
      await this.alertService.error('No se pudo eliminar.');
    }
  }

  nombreLector(f: LectorEventoTipoBoleta | LectorEventoProducto): string {
    const u = f.usuarios;
    if (!u) return `#${f.usuario_id}`;
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return n || u.email || `#${u.id}`;
  }

  tituloEvento(f: LectorEventoTipoBoleta | LectorEventoProducto): string {
    return f.eventos?.titulo || `#${f.evento_id}`;
  }

  nombreTipoBoleta(f: LectorEventoTipoBoleta): string {
    return f.tipos_boleta?.nombre || `#${f.tipo_boleta_id}`;
  }

  etiquetaLectorEnLista(u: Usuario): string {
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return (n ? `${n} — ` : '') + (u.email || `#${u.id}`);
  }
}
