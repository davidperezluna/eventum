import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService, RolesPermitidos } from '../../services/auth.service';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { UsuariosService } from '../../services/usuarios.service';
import { LectorEventoTipoBoletaService } from '../../services/lector-evento-tipo-boleta.service';
import { LectorLugarTipoCoverService } from '../../services/lector-lugar-tipo-cover.service';
import { CoversService } from '../../services/covers.service';
import { AlertService } from '../../services/alert.service';
import {
  Evento,
  LectorEventoTipoBoleta,
  LectorLugarTipoCover,
  LugarCoverListado,
  TipoBoleta,
  TipoCover,
  Usuario,
} from '../../types';

type ModalAlcance = 'evento' | 'cover';
type VistaLectores = 'lista' | 'detalle';

@Component({
  selector: 'app-lectores-parametrizacion',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lectores-parametrizacion.html',
  styleUrl: './lectores-parametrizacion.css',
  standalone: true,
})
export class LectoresParametrizacion implements OnInit {
  vista: VistaLectores = 'lista';
  lectorSeleccionado: Usuario | null = null;
  searchTerm = '';

  filas: LectorEventoTipoBoleta[] = [];
  filasCover: LectorLugarTipoCover[] = [];
  lectoresLista: Usuario[] = [];
  loading = false;
  showModal = false;
  modalAlcance: ModalAlcance = 'evento';
  modalLectorFijo = false;

  lectores: Usuario[] = [];
  eventos: Evento[] = [];
  lugaresCover: LugarCoverListado[] = [];
  tiposBoletaEvento: TipoBoleta[] = [];
  tiposCoverLugar: TipoCover[] = [];

  formUsuarioId: number | null = null;
  formEventoId: number | null = null;
  formLugarId: number | null = null;
  tiposSeleccionados: Set<number> = new Set();
  tiposCoverSeleccionados: Set<number> = new Set();
  formPermitirProductos = false;

  constructor(
    private authService: AuthService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private usuariosService: UsuariosService,
    private lectorEvtService: LectorEventoTipoBoletaService,
    private lectorCoverService: LectorLugarTipoCoverService,
    private coversService: CoversService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.cargarDatos();
  }

  async cargarDatos(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();
    try {
      const [eventoFilas, coverFilas, lectRes] = await Promise.all([
        this.lectorEvtService.listar(),
        this.lectorCoverService.listar(),
        this.usuariosService.getUsuarios({
          page: 1,
          limit: 500,
          tipo_usuario_id: RolesPermitidos.LECTOR,
          activo: true,
        }),
      ]);
      this.filas = eventoFilas;
      this.filasCover = coverFilas;
      this.lectoresLista = lectRes.data || [];
      this.lectores = this.lectoresLista;

      if (this.lectorSeleccionado) {
        const actualizado = this.lectoresLista.find((u) => u.id === this.lectorSeleccionado!.id);
        this.lectorSeleccionado = actualizado ?? this.lectorSeleccionado;
      }
    } catch (e) {
      console.error(e);
      this.filas = [];
      this.filasCover = [];
      this.lectoresLista = [];
      await this.alertService.error('No se pudo cargar la parametrización de lectores.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  get lectoresFiltrados(): Usuario[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) {
      return this.lectoresLista;
    }
    return this.lectoresLista.filter((u) => {
      const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return nombre.includes(q) || email.includes(q) || String(u.id).includes(q);
    });
  }

  conteoPermisos(usuarioId: number): number {
    const evento = this.filas.filter((f) => f.usuario_id === usuarioId).length;
    const cover = this.filasCover.filter((f) => f.usuario_id === usuarioId).length;
    return evento + cover;
  }

  abrirDetalleLector(usuario: Usuario): void {
    this.lectorSeleccionado = usuario;
    this.vista = 'detalle';
    this.cdr.markForCheck();
  }

  volverALista(): void {
    this.vista = 'lista';
    this.lectorSeleccionado = null;
    this.cdr.markForCheck();
  }

  async abrirModal(alcance: ModalAlcance = 'evento', usuarioId?: number | null): Promise<void> {
    this.modalAlcance = alcance;
    const lectorId = usuarioId ?? this.lectorSeleccionado?.id ?? null;
    this.formUsuarioId = lectorId;
    this.modalLectorFijo = lectorId != null;
    this.formEventoId = null;
    this.formLugarId = null;
    this.tiposBoletaEvento = [];
    this.tiposCoverLugar = [];
    this.tiposSeleccionados = new Set();
    this.tiposCoverSeleccionados = new Set();
    this.formPermitirProductos = false;
    this.showModal = true;

    try {
      const [lectRes, evRes, lugaresRes] = await Promise.all([
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
        this.coversService.listarLugaresConCovers(200, 0),
      ]);
      this.lectores = lectRes.data || [];
      this.eventos = evRes.data || [];
      this.lugaresCover = lugaresRes || [];
    } catch (e) {
      console.error(e);
      this.lectores = [];
      this.eventos = [];
      this.lugaresCover = [];
      await this.alertService.error('Error al cargar lectores, eventos o lugares.');
    }
    this.cdr.markForCheck();
  }

  setModalAlcance(alcance: ModalAlcance): void {
    this.modalAlcance = alcance;
    this.tiposSeleccionados = new Set();
    this.tiposCoverSeleccionados = new Set();
    this.formPermitirProductos = false;
    this.cdr.markForCheck();
  }

  cerrarModal(): void {
    this.showModal = false;
    this.modalLectorFijo = false;
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

  async onLugarCambiado(): Promise<void> {
    this.tiposCoverSeleccionados = new Set();
    this.tiposCoverLugar = [];
    if (!this.formLugarId) {
      this.cdr.markForCheck();
      return;
    }
    try {
      const config = await this.coversService.obtenerConfigLugar(this.formLugarId);
      this.tiposCoverLugar = (config?.tipos_cover ?? []).filter((t) => t.activo !== false);
    } catch (e) {
      console.error(e);
      this.tiposCoverLugar = [];
      await this.alertService.error('No se pudieron cargar los tipos de cover del lugar.');
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

  toggleTipoCover(id: number): void {
    if (this.tiposCoverSeleccionados.has(id)) {
      this.tiposCoverSeleccionados.delete(id);
    } else {
      this.tiposCoverSeleccionados.add(id);
    }
    this.tiposCoverSeleccionados = new Set(this.tiposCoverSeleccionados);
    this.cdr.markForCheck();
  }

  isTipoSeleccionado(id: number): boolean {
    return this.tiposSeleccionados.has(id);
  }

  isTipoCoverSeleccionado(id: number): boolean {
    return this.tiposCoverSeleccionados.has(id);
  }

  async guardarAsignacion(): Promise<void> {
    if (!this.formUsuarioId) {
      await this.alertService.warning('Selecciona un lector.');
      return;
    }

    if (this.modalAlcance === 'cover') {
      await this.guardarAsignacionCover();
      return;
    }

    await this.guardarAsignacionEvento();
  }

  private async guardarAsignacionEvento(): Promise<void> {
    if (!this.formEventoId) {
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
          this.lectorEvtService.crearAsignaciones(this.formUsuarioId!, this.formEventoId, ids),
        );
      }
      if (this.formPermitirProductos) {
        operaciones.push(
          this.lectorEvtService.crearAsignacionProductos(this.formUsuarioId!, this.formEventoId),
        );
      }
      await Promise.all(operaciones);
      await this.alertService.success('Asignación de evento guardada correctamente.');
      this.cerrarModal();
      await this.cargarDatos();
    } catch (e: unknown) {
      console.error(e);
      const msg =
        (e as { message?: string })?.message ||
        'No se pudo guardar. Verifica que el usuario sea Lector y que los tipos pertenezcan al evento.';
      await this.alertService.error(msg);
    }
  }

  private async guardarAsignacionCover(): Promise<void> {
    if (!this.formLugarId) {
      await this.alertService.warning('Selecciona lector y lugar (club).');
      return;
    }
    const ids = [...this.tiposCoverSeleccionados];
    if (!ids.length) {
      await this.alertService.warning('Selecciona al menos un tipo de cover del lugar.');
      return;
    }
    try {
      await this.lectorCoverService.crearAsignaciones(this.formUsuarioId!, this.formLugarId, ids);
      await this.alertService.success('Asignación de cover guardada correctamente.');
      this.cerrarModal();
      await this.cargarDatos();
    } catch (e: unknown) {
      console.error(e);
      const msg =
        (e as { message?: string })?.message ||
        'No se pudo guardar. Verifica que el usuario sea Lector y que los tipos pertenezcan al lugar.';
      await this.alertService.error(msg);
    }
  }

  async eliminarFila(fila: LectorEventoTipoBoleta): Promise<void> {
    const esPermisoProducto = fila.tipo_boleta_id == null;
    const ok = await this.alertService.confirm(
      esPermisoProducto ? '¿Eliminar permiso de productos?' : '¿Eliminar esta asignación?',
      esPermisoProducto
        ? 'Se quitará el permiso de escaneo de productos para este evento.'
        : 'Se quitará el permiso de escaneo para ese tipo de boleta.',
    );
    if (!ok) return;
    try {
      await this.lectorEvtService.eliminar(fila.id);
      await this.alertService.success('Asignación eliminada.');
      await this.cargarDatos();
    } catch (e) {
      console.error(e);
      await this.alertService.error('No se pudo eliminar.');
    }
  }

  async eliminarFilaCover(fila: LectorLugarTipoCover): Promise<void> {
    const ok = await this.alertService.confirm(
      '¿Eliminar permiso de cover?',
      'Se quitará el permiso de escaneo para ese tipo de cover en el lugar.',
    );
    if (!ok) return;
    try {
      await this.lectorCoverService.eliminar(fila.id);
      await this.alertService.success('Asignación eliminada.');
      await this.cargarDatos();
    } catch (e) {
      console.error(e);
      await this.alertService.error('No se pudo eliminar.');
    }
  }

  nombreLector(f: LectorEventoTipoBoleta | LectorLugarTipoCover): string {
    const u = f.usuarios;
    if (!u) return `#${f.usuario_id}`;
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return n || u.email || `#${u.id}`;
  }

  nombreUsuario(u: Usuario): string {
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return n || u.email || `#${u.id}`;
  }

  tituloEvento(f: LectorEventoTipoBoleta): string {
    return f.eventos?.titulo || `#${f.evento_id}`;
  }

  nombreTipoBoleta(f: LectorEventoTipoBoleta): string {
    if (f.tipo_boleta_id == null) return 'Productos del evento';
    return f.tipos_boleta?.nombre || `#${f.tipo_boleta_id}`;
  }

  tituloLugar(f: LectorLugarTipoCover): string {
    const ciudad = f.lugares?.ciudad ? ` (${f.lugares.ciudad})` : '';
    return (f.lugares?.nombre || `Lugar #${f.lugar_id}`) + ciudad;
  }

  nombreTipoCover(f: LectorLugarTipoCover): string {
    return f.tipos_cover?.nombre || `Cover #${f.tipo_cover_id}`;
  }

  get filasBoletas(): LectorEventoTipoBoleta[] {
    return this.filas.filter((f) => f.tipo_boleta_id != null);
  }

  get filasProductos(): LectorEventoTipoBoleta[] {
    return this.filas.filter((f) => f.tipo_boleta_id == null);
  }

  get filasBoletasLector(): LectorEventoTipoBoleta[] {
    if (!this.lectorSeleccionado) return [];
    return this.filasBoletas.filter((f) => f.usuario_id === this.lectorSeleccionado!.id);
  }

  get filasProductosLector(): LectorEventoTipoBoleta[] {
    if (!this.lectorSeleccionado) return [];
    return this.filasProductos.filter((f) => f.usuario_id === this.lectorSeleccionado!.id);
  }

  get filasCoverLector(): LectorLugarTipoCover[] {
    if (!this.lectorSeleccionado) return [];
    return this.filasCover.filter((f) => f.usuario_id === this.lectorSeleccionado!.id);
  }

  get hayPermisosLector(): boolean {
    return (
      this.filasBoletasLector.length > 0 ||
      this.filasProductosLector.length > 0 ||
      this.filasCoverLector.length > 0
    );
  }

  etiquetaLectorEnLista(u: Usuario): string {
    const n = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return (n ? `${n} — ` : '') + (u.email || `#${u.id}`);
  }

  lectorFormularioLabel(): string {
    if (!this.formUsuarioId) return '';
    if (this.lectorSeleccionado?.id === this.formUsuarioId) {
      return this.etiquetaLectorEnLista(this.lectorSeleccionado);
    }
    const u = this.lectores.find((l) => l.id === this.formUsuarioId);
    return u ? this.etiquetaLectorEnLista(u) : `#${this.formUsuarioId}`;
  }
}
