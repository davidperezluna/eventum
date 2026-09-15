import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { comprasFantasmaEnabled } from '../core/compras-fantasma-feature';

export interface BoletaEmisionFantasma {
  id: number;
  codigo_qr: string;
  estado: string;
  precio_unitario: number;
  fecha_uso?: string | null;
  tipo: { nombre: string };
}

export interface EmisionFantasma {
  id: number;
  estado: string;
  motivo: string;
  fecha_creacion: string;
  evento: { titulo: string };
  cliente: { nombre: string; apellido: string; email: string };
  boletas: BoletaEmisionFantasma[];
}

@Injectable({ providedIn: 'root' })
export class ComprasFantasmaService {
  constructor(private supabase: SupabaseService) {}

  private verificarEntorno(): void {
    if (!comprasFantasmaEnabled) throw new Error('El módulo no está habilitado en este entorno.');
  }

  async crear(
    solicitud: string,
    evento: number,
    cliente: number,
    items: { tipo_boleta_id: number; cantidad: number }[],
    motivo: string,
  ): Promise<number> {
    this.verificarEntorno();
    const { data, error } = await this.supabase.getClient().rpc('crear_compra_fantasma', {
      p_solicitud_id: solicitud,
      p_evento_id: evento,
      p_cliente_id: cliente,
      p_items: items,
      p_motivo: motivo,
    });
    if (error) throw error;
    return Number(data);
  }

  async listar(page = 0): Promise<EmisionFantasma[]> {
    this.verificarEntorno();
    const { data, error } = await this.supabase
      .from('compras_fantasma')
      .select(
        'id,estado,motivo,fecha_creacion,evento:eventos(titulo),cliente:usuarios!cliente_id(nombre,apellido,email),boletas:boletas_compradas(id,codigo_qr,estado,precio_unitario,fecha_uso,tipo:tipos_boleta(nombre))',
      )
      .order('id', { ascending: false })
      .range(page * 20, page * 20 + 19);
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => this.normalizarEmision(row));
  }

  private normalizarEmision(row: unknown): EmisionFantasma {
    const r = row as Record<string, unknown>;
    const eventoRaw = r['evento'] ?? r['eventos'];
    const clienteRaw = r['cliente'];
    const evento = (Array.isArray(eventoRaw) ? eventoRaw[0] : eventoRaw) as
      | { titulo?: string }
      | null;
    const cliente = (Array.isArray(clienteRaw) ? clienteRaw[0] : clienteRaw) as
      | { nombre?: string; apellido?: string; email?: string }
      | null;
    const boletasRaw = Array.isArray(r['boletas']) ? r['boletas'] : [];
    return {
      id: Number(r['id']),
      estado: String(r['estado'] ?? ''),
      motivo: String(r['motivo'] ?? ''),
      fecha_creacion: String(r['fecha_creacion'] ?? ''),
      evento: { titulo: String(evento?.titulo ?? 'Evento') },
      cliente: {
        nombre: String(cliente?.nombre ?? ''),
        apellido: String(cliente?.apellido ?? ''),
        email: String(cliente?.email ?? ''),
      },
      boletas: boletasRaw.map((b) => {
        const boleta = b as Record<string, unknown>;
        const tipoRaw = boleta['tipo'] ?? boleta['tipos_boleta'];
        const tipo = (Array.isArray(tipoRaw) ? tipoRaw[0] : tipoRaw) as { nombre?: string } | null;
        return {
          id: Number(boleta['id']),
          codigo_qr: String(boleta['codigo_qr'] ?? ''),
          estado: String(boleta['estado'] ?? ''),
          precio_unitario: Number(boleta['precio_unitario'] ?? 0),
          fecha_uso: boleta['fecha_uso'] != null ? String(boleta['fecha_uso']) : null,
          tipo: { nombre: String(tipo?.nombre ?? 'Entrada') },
        };
      }),
    };
  }

  async anular(id: number): Promise<void> {
    this.verificarEntorno();
    const { error } = await this.supabase.getClient().rpc('anular_compra_fantasma', { p_id: id });
    if (error) throw error;
  }
}
