import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ChangeDetectorRef,
  afterNextRender,
  Injector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { BoletasService } from '../../services/boletas.service';
import { ComprasProductoService, ItemProductoEscaneo } from '../../services/compras-producto.service';
import { AlertService } from '../../services/alert.service';
import { AuthService, RolesPermitidos } from '../../services/auth.service';
import {
  LectorPermisosService,
  buildPermisoKey,
  PermisoEscaneo,
} from '../../services/lector-permisos.service';
import { SupabaseService } from '../../services/supabase.service';
import { BoletaComprada, TipoEstadoBoleta } from '../../types';
@Component({
  selector: 'app-escanear-qr',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './escanear-qr.html',
  styleUrl: './escanear-qr.css',
})
export class EscanearQr implements OnInit, AfterViewInit, OnDestroy {
  /** scanner = camara QR; manual = busqueda por documento (app movil). */
  modoBusqueda: 'scanner' | 'manual' = 'scanner';
  codigoManual = '';
  documento = '';
  buscando = false;
  validando = false;
  boleta: BoletaComprada | null = null;
  productoItem: ItemProductoEscaneo | null = null;
  boletasEncontradas: BoletaComprada[] = [];
  modalVisible = false;
  nombreTipoBoleta = '';
  tituloEvento = '';
  errorPermiso: string | null = null;

  modoApp: 'admin' | 'lector' = 'admin';
  volverLink = '/lectores-parametrizacion';

  cameraError: string | null = null;
  scannerActivo = false;
  escaneoPausado = false;

  permisos: PermisoEscaneo[] = [];
  permisoKeys = new Set<string>();
  permisoEventoIds = new Set<number>();
  permisoEventoProductoIds = new Set<number>();
  esLector = false;
  cargandoPermisos = true;

  private html5Qr?: Html5Qrcode;
  private ultimoCodigo = '';
  private ultimoEscaneoMs = 0;
  private iniciandoCamara = false;
  private viewReady = false;
  private permisosReady = false;
  private cameraDomRetries = 0;
  private readonly maxCameraDomRetries = 8;

  readonly readerId = 'eventum-qr-reader';

  estados: { value: TipoEstadoBoleta; label: string }[] = [
    { value: TipoEstadoBoleta.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoBoleta.USADA, label: 'Usada' },
    { value: TipoEstadoBoleta.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoBoleta.REEMBOLSADA, label: 'Reembolsada' },
  ];

  constructor(
    private boletasService: BoletasService,
    private comprasProductoService: ComprasProductoService,
    private alertService: AlertService,
    private authService: AuthService,
    private lectorPermisos: LectorPermisosService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private injector: Injector
  ) {}

  get requierePermisosLector(): boolean {
    return this.modoApp === 'lector' || this.esLector;
  }

  async ngOnInit(): Promise<void> {
    this.modoApp = this.route.snapshot.data['modoApp'] === 'lector' ? 'lector' : 'admin';
    this.volverLink =
      this.modoApp === 'lector' ? '/lector/inicio' : '/lectores-parametrizacion';

    const usuario = this.authService.getUsuario();
    this.esLector = usuario?.tipo_usuario_id === RolesPermitidos.LECTOR;

    if (this.requierePermisosLector) {
      try {
        this.permisos = await this.lectorPermisos.fetchMisPermisosEscaneo();
        this.permisoKeys = new Set(
          this.permisos
            .filter((p) => p.tipo_boleta_id != null)
            .map((p) => buildPermisoKey(p.evento_id, p.tipo_boleta_id as number))
        );
        this.permisoEventoIds = new Set(this.permisos.map((p) => p.evento_id));
        this.permisoEventoProductoIds = new Set(
          this.permisos
            .filter((p) => p.categoria === 'producto')
            .map((p) => p.evento_id)
        );
      } catch {
        this.permisos = [];
        this.permisoEventoIds = new Set<number>();
        this.permisoEventoProductoIds = new Set<number>();
        await this.alertService.error(
          'No se pudieron cargar tus permisos de escaneo.'
        );
      }
    }
    this.cargandoPermisos = false;
    this.permisosReady = true;
    this.cdr.detectChanges();
    this.scheduleIniciarCamaraTrasRender();
    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.tryIniciarCamara();
  }

  private tryIniciarCamara(): void {
    if (this.viewReady && this.permisosReady && this.modoBusqueda === 'scanner') {
      void this.iniciarCamara();
    }
  }

  /** Espera a que *ngIf renderice el contenedor #eventum-qr-reader antes de abrir la cámara. */
  private scheduleIniciarCamaraTrasRender(): void {
    afterNextRender(
      () => {
        this.tryIniciarCamara();
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    void this.detenerCamara();
  }

  async cambiarModo(modo: 'scanner' | 'manual'): Promise<void> {
    if (this.modoBusqueda === modo) return;
    this.modoBusqueda = modo;
    this.cerrarModal();
    if (modo === 'scanner') {
      this.cameraDomRetries = 0;
      this.cdr.detectChanges();
      this.scheduleIniciarCamaraTrasRender();
    } else {
      await this.detenerCamara();
    }
    this.cdr.markForCheck();
  }

  private async iniciarCamara(): Promise<void> {
    if (this.iniciandoCamara || this.modoBusqueda !== 'scanner') return;
    if (this.cargandoPermisos) return;
    if (this.requierePermisosLector && this.permisos.length === 0) {
      this.cameraError =
        'No tienes eventos asignados para escanear. Pide al administrador que te asigne permisos.';
      this.cdr.markForCheck();
      return;
    }

    this.iniciandoCamara = true;
    this.cameraError = null;
    this.cdr.markForCheck();

    await this.detenerCamara();

    const el = document.getElementById(this.readerId);
    if (!el) {
      this.iniciandoCamara = false;
      if (
        this.cameraDomRetries < this.maxCameraDomRetries &&
        this.modoBusqueda === 'scanner' &&
        !this.cargandoPermisos
      ) {
        this.cameraDomRetries += 1;
        requestAnimationFrame(() => void this.iniciarCamara());
      }
      return;
    }
    this.cameraDomRetries = 0;

    try {
      this.html5Qr = new Html5Qrcode(this.readerId);
      await this.html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decoded) => void this.onCodigoLeido(decoded),
        () => {}
      );
      this.scannerActivo = true;
    } catch (err: unknown) {
      console.error('Error iniciando cámara:', err);
      const msg =
        err instanceof Error ? err.message : 'No se pudo acceder a la cámara';
      if (/NotAllowed|Permission/i.test(msg)) {
        this.cameraError =
          'Permiso de cámara denegado. Actívalo en el navegador o en Ajustes de la PWA e intenta de nuevo.';
      } else if (/NotFound|Devices/i.test(msg)) {
        this.cameraError =
          'No se encontró cámara en este dispositivo. Usa el modo manual o prueba desde el celular.';
      } else {
        this.cameraError = `No se pudo iniciar la cámara: ${msg}`;
      }
    } finally {
      this.iniciandoCamara = false;
      this.cdr.markForCheck();
    }
  }

  private async detenerCamara(): Promise<void> {
    if (!this.html5Qr) return;
    try {
      const state = this.html5Qr.getState();
      if (state === Html5QrcodeScannerState.SCANNING) {
        await this.html5Qr.stop();
      }
      await this.html5Qr.clear();
    } catch {
      /* ignorar al destruir */
    }
    this.html5Qr = undefined;
    this.scannerActivo = false;
  }

  private async pausarCamara(): Promise<void> {
    if (!this.html5Qr || this.escaneoPausado) return;
    try {
      if (this.html5Qr.getState() === Html5QrcodeScannerState.SCANNING) {
        await this.html5Qr.pause(true);
        this.escaneoPausado = true;
      }
    } catch {
      /* noop */
    }
  }

  private async reanudarCamara(): Promise<void> {
    if (!this.html5Qr || !this.escaneoPausado) return;
    try {
      await this.html5Qr.resume();
      this.escaneoPausado = false;
    } catch {
      await this.iniciarCamara();
    }
  }

  private async onCodigoLeido(codigo: string): Promise<void> {
    const ahora = Date.now();
    if (codigo === this.ultimoCodigo && ahora - this.ultimoEscaneoMs < 2500) {
      return;
    }
    if (this.buscando || this.validando) return;

    this.ultimoCodigo = codigo;
    this.ultimoEscaneoMs = ahora;
    await this.pausarCamara();
    await this.procesarCodigo(codigo);
  }

  async buscarPorDocumento(): Promise<void> {
    const doc = this.documento.trim();
    if (!doc) {
      await this.alertService.warning('Campo requerido', 'Ingresa el numero de documento.');
      return;
    }
    if (this.requierePermisosLector && this.permisos.length === 0) {
      await this.alertService.warning('Sin acceso', 'No tienes eventos asignados para escanear.');
      return;
    }

    this.buscando = true;
    this.boleta = null;
    this.productoItem = null;
    this.boletasEncontradas = [];
    this.modalVisible = false;
    this.cdr.markForCheck();

    try {
      let boletas = await this.boletasService.buscarBoletasPendientesPorDocumento(doc);
      if (this.requierePermisosLector) {
        boletas = await this.lectorPermisos.filtrarBoletasConPermisos(boletas, this.permisoKeys);
      }
      if (boletas.length === 0) {
        await this.alertService.info(
          'Sin entradas',
          'No hay boletas pendientes con ese documento en tus eventos asignados.'
        );
      } else if (boletas.length === 1) {
        await this.mostrarBoletaEnModal(boletas[0]);
      } else {
        this.boletasEncontradas = boletas;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al buscar';
      await this.alertService.error('Error', msg);
    } finally {
      this.buscando = false;
      this.cdr.markForCheck();
    }
  }

  async seleccionarBoletaLista(b: BoletaComprada): Promise<void> {
    await this.mostrarBoletaEnModal(b);
  }

  private async procesarCodigo(codigo: string): Promise<void> {
    if (this.requierePermisosLector && this.permisos.length === 0) {
      await this.alertService.warning(
        'Sin acceso',
        'No tienes eventos asignados para escanear.'
      );
      return;
    }

    this.buscando = true;
    this.boleta = null;
    this.errorPermiso = null;
    this.cdr.markForCheck();

    try {
      const encontrada = await this.boletasService.buscarBoletaPorCodigoQR(codigo.trim());
      if (encontrada) {
        await this.mostrarBoletaEnModal(encontrada);
        return;
      }

      const producto = await this.comprasProductoService.buscarItemPorCodigoQR(codigo.trim());
      const productoPedido = producto || await this.comprasProductoService.buscarCompraPorCodigoQR(codigo.trim());
      if (!productoPedido) {
        await this.alertService.info(
          'No encontrado',
          'No hay ninguna boleta o producto con ese código QR.'
        );
        await this.reiniciarEscaneo();
        return;
      }

      await this.mostrarProductoEnModal(productoPedido);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al buscar', msg);
      await this.reiniciarEscaneo();
    } finally {
      this.buscando = false;
      this.cdr.markForCheck();
    }
  }

  private async mostrarBoletaEnModal(boleta: BoletaComprada): Promise<void> {
    if (this.requierePermisosLector) {
      const ok = await this.verificarPermisoLector(boleta);
      if (!ok) {
        await this.reiniciarEscaneo();
        return;
      }
    }
    const { data: tipoBoleta } = await this.supabase
      .from('tipos_boleta')
      .select('evento_id, nombre, eventos(titulo)')
      .eq('id', boleta.tipo_boleta_id)
      .single();

    const ev = tipoBoleta?.eventos as { titulo?: string } | { titulo?: string }[] | null;
    const eventoTitulo = Array.isArray(ev) ? ev[0]?.titulo : ev?.titulo;

    this.nombreTipoBoleta = (tipoBoleta as { nombre?: string })?.nombre || 'Entrada';
    this.tituloEvento =
      eventoTitulo || boleta.evento?.titulo || `Evento #${tipoBoleta?.evento_id ?? ''}`;
    this.boleta = boleta;
    this.productoItem = null;
    this.modalVisible = true;
    this.cdr.markForCheck();
  }

  private async mostrarProductoEnModal(item: ItemProductoEscaneo): Promise<void> {
    if (this.requierePermisosLector) {
      const eventoId = item.compra?.evento_id;
      if (!eventoId || !this.permisoEventoProductoIds.has(eventoId)) {
        this.errorPermiso = 'Este producto no corresponde a un evento asignado para escanear.';
        await this.alertService.warning('Sin permiso', this.errorPermiso);
        await this.reiniciarEscaneo();
        return;
      }
    }
    this.boleta = null;
    this.productoItem = item;
    this.modalVisible = true;
    this.cdr.markForCheck();
  }

  cerrarModal(mantenerLista = false): void {
    this.modalVisible = false;
    this.boleta = null;
    this.productoItem = null;
    this.nombreTipoBoleta = '';
    this.tituloEvento = '';
    if (!mantenerLista) {
      this.boletasEncontradas = [];
    }
    this.cdr.markForCheck();
  }

  private async verificarPermisoLector(boleta: BoletaComprada): Promise<boolean> {
    try {
      const { data: tipoBoleta, error } = await this.supabase
        .from('tipos_boleta')
        .select('evento_id')
        .eq('id', boleta.tipo_boleta_id)
        .single();

      if (error || !tipoBoleta) {
        this.errorPermiso = 'No se pudo verificar el evento de esta boleta.';
        return false;
      }

      const key = buildPermisoKey(tipoBoleta.evento_id, boleta.tipo_boleta_id);
      if (!this.permisoKeys.has(key)) {
        this.errorPermiso =
          'Esta boleta no corresponde a un evento o tipo que tengas asignado para escanear.';
        await this.alertService.warning('Sin permiso', this.errorPermiso);
        return false;
      }
      return true;
    } catch {
      this.errorPermiso = 'Error al verificar permisos de escaneo.';
      return false;
    }
  }

  async validarBoleta(): Promise<void> {
    if (!this.boleta) return;

    if (this.boleta.estado === 'usada') {
      await this.alertService.warning('Ya validada', 'Esta boleta ya fue validada.');
      return;
    }
    if (this.boleta.estado === 'cancelada' || this.boleta.estado === 'reembolsada') {
      await this.alertService.warning(
        'No se puede validar',
        'No se puede validar una boleta cancelada o reembolsada.'
      );
      return;
    }

    const estadoPago = this.boleta.estado_pago || this.boleta.compra?.estado_pago;
    if (estadoPago !== 'completado') {
      await this.alertService.warning(
        'Pago pendiente',
        'El pago debe estar completado antes de validar la boleta.'
      );
      return;
    }

    const ok = await this.alertService.confirm(
      'Validar boleta',
      `¿Validar la boleta ${this.boleta.codigo_qr}?`
    );
    if (!ok) return;

    this.validando = true;
    this.cdr.markForCheck();
    try {
      await this.boletasService.validarBoleta(this.boleta.id);
      await this.alertService.success('¡Boleta validada!', 'Entrada validada correctamente.');
      this.cerrarModal();
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al validar', msg);
    } finally {
      this.validando = false;
      this.cdr.markForCheck();
    }
  }

  puedeValidarProducto(item: ItemProductoEscaneo): boolean {
    return (
      (item.estado || '').toLowerCase() !== 'entregado' &&
      (item.compra?.estado_pago || '').toLowerCase() === 'completado'
    );
  }

  async validarProducto(): Promise<void> {
    if (!this.productoItem) return;
    if (!this.puedeValidarProducto(this.productoItem)) {
      await this.alertService.warning('No se puede validar', 'Este producto ya fue redimido o no tiene pago completado.');
      return;
    }

    const ok = await this.alertService.confirm(
      'Validar producto',
      `¿Marcar como entregado el QR ${this.productoItem.codigo_qr}?`
    );
    if (!ok) return;

    this.validando = true;
    this.cdr.markForCheck();
    try {
      if (this.productoItem.scope === 'compra') {
        await this.comprasProductoService.validarCompraProductos(this.productoItem.id);
        await this.alertService.success('Pedido validado', 'Todos los productos del pedido quedaron marcados como redimidos.');
      } else {
        await this.comprasProductoService.validarItemProducto(this.productoItem.id);
        await this.alertService.success('Producto validado', 'El producto quedó marcado como redimido.');
      }
      this.cerrarModal();
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al validar', msg);
    } finally {
      this.validando = false;
      this.cdr.markForCheck();
    }
  }

  async reiniciarEscaneo(): Promise<void> {
    this.cerrarModal();
    this.errorPermiso = null;
    this.documento = '';
    this.codigoManual = '';
    this.ultimoCodigo = '';
    this.cdr.markForCheck();

    if (this.modoBusqueda === 'scanner') {
      if (this.escaneoPausado) {
        await this.reanudarCamara();
      } else if (!this.scannerActivo) {
        await this.iniciarCamara();
      }
    }
  }


  puedeValidar(boleta: BoletaComprada): boolean {
    const estadoPago = boleta.estado_pago || boleta.compra?.estado_pago;
    return boleta.estado === 'pendiente' && estadoPago === 'completado';
  }

  getEstadoLabel(estado?: string): string {
    const estadoObj = this.estados.find((e) => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  resumenEntregaProducto(item: ItemProductoEscaneo | null | undefined): string[] {
    if (!item) return [];

    const resumen = (item.productos_resumen || [])
      .map((linea) => String(linea || '').trim())
      .filter((linea) => linea.length > 0);
    if (resumen.length > 0) {
      return resumen;
    }

    if (item.producto?.nombre) {
      return [`${item.producto.nombre} x${item.cantidad || 0}`];
    }

    return [];
  }

  nombreValidador(boleta: BoletaComprada | null | undefined): string {
    if (!boleta) return '—';
    const v = boleta.validado_por;
    if (!v) {
      return boleta.validado_por_usuario_id != null
        ? `Usuario #${boleta.validado_por_usuario_id}`
        : '—';
    }
    const nombre = [v.nombre, v.apellido].filter(Boolean).join(' ').trim();
    if (nombre) return nombre;
    if (v.email) return v.email;
    return `Usuario #${v.id}`;
  }
}
