import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvSelect } from '../../components/ev-select/ev-select';
import { EvButton } from '../../components/ev-button';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvNotice } from '../../components/ev-notice';
import { EventosService } from '../../services/eventos.service';
import { UsuariosService } from '../../services/usuarios.service';
import { BoletasService } from '../../services/boletas.service';
import {
  BoletaEmisionFantasma,
  ComprasFantasmaService,
  EmisionFantasma,
} from '../../services/compras-fantasma.service';
import { Evento, Usuario, TipoBoleta } from '../../types';

@Component({
  selector: 'app-compras-fantasma',
  imports: [CommonModule, FormsModule, EvSelect, EvButton, EvNumberInput, EvNotice],
  templateUrl: './compras-fantasma.html',
  styleUrls: ['../ventas-manual/ventas-manual.css', './compras-fantasma.css'],
})
export class ComprasFantasma implements OnInit {
  eventos: Evento[] = [];
  clientes: Usuario[] = [];
  tipos: TipoBoleta[] = [];
  eventoId: number | null = null;
  clienteId: number | null = null;
  cantidades: Record<number, number> = {};
  motivo = '';
  historial: EmisionFantasma[] = [];
  pagina = 0;
  guardando = false;
  cargando = false;
  cargandoTipos = false;
  buscando = false;
  error = '';
  mensaje = '';

  private solicitud = crypto.randomUUID();
  private payloadAnterior = '';
  private busqueda = 0;

  constructor(
    private eventosService: EventosService,
    private usuarios: UsuariosService,
    private boletas: BoletasService,
    private emisiones: ComprasFantasmaService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.cargando = true;
    try {
      const [eventos] = await Promise.all([
        this.eventosService.getEventos({ activo: true, limit: 1000 }),
        this.buscarClientes(''),
        this.cargarHistorial(),
      ]);
      this.eventos = eventos.data;
    } catch (e) {
      this.error = this.errorTexto(e);
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  get eventoOptions() {
    return this.eventos.map((e) => ({ value: e.id, label: e.titulo }));
  }

  get clienteOptions() {
    return this.clientes.map((c) => ({
      value: c.id,
      label: `${c.nombre} ${c.apellido ?? ''} · ${c.email}`,
    }));
  }

  get eventoSeleccionado(): Evento | null {
    return this.eventos.find((e) => e.id === this.eventoId) ?? null;
  }

  get clienteSeleccionado(): Usuario | null {
    return this.clientes.find((c) => c.id === this.clienteId) ?? null;
  }

  get clienteChipLabel(): string {
    const c = this.clienteSeleccionado;
    if (!c) return '';
    return `${c.nombre} ${c.apellido ?? ''}`.trim() || c.email;
  }

  get items() {
    return this.tipos
      .filter((t) => Number(this.cantidades[t.id]) > 0)
      .map((t) => ({ tipo_boleta_id: t.id, cantidad: Number(this.cantidades[t.id]) }));
  }

  get total() {
    return this.items.reduce((n, i) => n + i.cantidad, 0);
  }

  get valido() {
    return (
      !!this.eventoId &&
      !!this.clienteId &&
      this.motivo.trim().length >= 3 &&
      this.items.length <= 20 &&
      this.total > 0 &&
      this.total <= 100 &&
      this.items.every((i) => Number.isInteger(i.cantidad))
    );
  }

  get resumenLineas() {
    return this.tipos
      .filter((t) => Number(this.cantidades[t.id]) > 0)
      .map((t) => ({
        id: t.id,
        nombre: t.nombre,
        cantidad: Number(this.cantidades[t.id]),
        precio: Number(t.precio) || 0,
      }));
  }

  async buscarClientes(search: string): Promise<void> {
    const request = ++this.busqueda;
    this.buscando = true;
    try {
      const r = await this.usuarios.getUsuarios({ activo: true, search, limit: 30 });
      if (request !== this.busqueda) return;
      const selected = this.clientes.find((c) => c.id === this.clienteId);
      this.clientes = r.data;
      if (selected && !this.clientes.some((c) => c.id === selected.id)) {
        this.clientes.unshift(selected);
      }
    } catch (e) {
      if (request === this.busqueda) this.error = this.errorTexto(e);
    } finally {
      if (request === this.busqueda) this.buscando = false;
      this.cdr.markForCheck();
    }
  }

  async cambiarEvento(): Promise<void> {
    const id = this.eventoId;
    this.tipos = [];
    this.cantidades = {};
    this.error = '';
    if (!id) return;
    this.cargandoTipos = true;
    try {
      const tipos = await this.boletas.getTiposBoleta(id);
      if (id === this.eventoId) {
        this.tipos = tipos.filter(
          (t) => !t.es_palco && Number(t.personas_por_unidad ?? 1) === 1,
        );
      }
    } catch (e) {
      this.error = this.errorTexto(e);
    } finally {
      this.cargandoTipos = false;
      this.cdr.markForCheck();
    }
  }

  setCantidad(tipoId: number, value: number | null): void {
    const n = Math.max(0, Math.min(100, Math.floor(Number(value) || 0)));
    this.cantidades = { ...this.cantidades, [tipoId]: n };
  }

  async emitir(): Promise<void> {
    if (!this.valido || this.guardando) return;
    this.guardando = true;
    this.error = '';
    this.mensaje = '';
    const payload = JSON.stringify([
      this.eventoId,
      this.clienteId,
      this.items,
      this.motivo.trim(),
    ]);
    if (payload !== this.payloadAnterior) {
      this.solicitud = crypto.randomUUID();
      this.payloadAnterior = payload;
    }
    try {
      const id = await this.emisiones.crear(
        this.solicitud,
        this.eventoId!,
        this.clienteId!,
        this.items,
        this.motivo.trim(),
      );
      this.mensaje = `Emisión ${id} creada. Las entradas ya están disponibles en Mis compras del titular.`;
      this.cantidades = {};
      this.motivo = '';
      this.payloadAnterior = '';
      this.pagina = 0;
      await this.cargarHistorial();
    } catch (e) {
      this.error = this.errorTexto(e);
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async cargarHistorial(pagina = this.pagina): Promise<void> {
    try {
      this.historial = await this.emisiones.listar(pagina);
      this.pagina = pagina;
    } catch (e) {
      this.error = this.errorTexto(e);
    } finally {
      this.cdr.markForCheck();
    }
  }

  async anular(id: number): Promise<void> {
    if (this.guardando) return;
    this.guardando = true;
    this.error = '';
    try {
      await this.emisiones.anular(id);
      await this.cargarHistorial();
      this.mensaje =
        'Se anularon las entradas pendientes y sus transferencias pendientes.';
    } catch (e) {
      this.error = this.errorTexto(e);
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  estadoEmisionLabel(estado: string): string {
    return estado === 'cancelada' ? 'Anulada' : 'Activa';
  }

  estadoBoletaLabel(estado: string): string {
    switch ((estado || '').toLowerCase()) {
      case 'usada':
        return 'Usada';
      case 'cancelada':
        return 'Cancelada';
      case 'reembolsada':
        return 'Reembolsada';
      default:
        return 'Pendiente';
    }
  }

  estadoBoletaClass(estado: string): string {
    switch ((estado || '').toLowerCase()) {
      case 'usada':
        return 'cf-pill cf-pill--used';
      case 'cancelada':
      case 'reembolsada':
        return 'cf-pill cf-pill--cancel';
      default:
        return 'cf-pill cf-pill--pending';
    }
  }

  resumenUso(emision: EmisionFantasma): {
    usadas: number;
    pendientes: number;
    canceladas: number;
  } {
    let usadas = 0;
    let pendientes = 0;
    let canceladas = 0;
    for (const b of emision.boletas || []) {
      const e = (b.estado || '').toLowerCase();
      if (e === 'usada') usadas += 1;
      else if (e === 'cancelada' || e === 'reembolsada') canceladas += 1;
      else pendientes += 1;
    }
    return { usadas, pendientes, canceladas };
  }

  trackTipo(_i: number, tipo: TipoBoleta): number {
    return tipo.id;
  }

  trackEmision(_i: number, emision: EmisionFantasma): number {
    return emision.id;
  }

  trackBoleta(_i: number, boleta: BoletaEmisionFantasma): number {
    return boleta.id;
  }

  private errorTexto(e: unknown): string {
    return (e as { message?: string })?.message || 'No se pudo completar la operación.';
  }
}
