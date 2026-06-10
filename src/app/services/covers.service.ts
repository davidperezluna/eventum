import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  AforoSesionCover,
  BoletaCoverCliente,
  BoletaCoverEscaneo,
  CompraCoverCliente,
  ConfigCoverLugar,
  DetalleLugarCoverPublico,
  EstadoSesionCover,
  ItemPedidoCover,
  LugarCoverListado,
  PlantillaCover,
  SesionCover,
  TipoCover,
} from '../types/covers';

@Injectable({ providedIn: 'root' })
export class CoversService {
  constructor(private supabase: SupabaseService) {}

  async obtenerConfigLugar(lugarId: number): Promise<ConfigCoverLugar | null> {
    const { data, error } = await this.supabase.getClient().rpc('obtener_config_cover_lugar', {
      p_lugar_id: lugarId,
    });
    if (error) throw error;
    if (!data) return null;
    return this.normalizeConfig(data);
  }

  async configurarLugar(
    lugarId: number,
    coversHabilitado: boolean,
    coversDescripcion?: string | null,
    coversPorcentajeServicio?: number | null,
  ): Promise<void> {
    const { data, error } = await this.supabase.getClient().rpc('configurar_lugar_cover', {
      p_lugar_id: lugarId,
      p_covers_habilitado: coversHabilitado,
      p_covers_descripcion: coversDescripcion ?? null,
      p_covers_porcentaje_servicio: coversPorcentajeServicio ?? null,
    });
    if (error) throw error;
    const res = data as { ok?: boolean };
    if (res?.ok === false) throw new Error('No se pudo guardar la configuración del lugar');
  }

  async upsertTipoCover(params: {
    id?: number | null;
    lugarId?: number;
    nombre?: string;
    descripcion?: string | null;
    precioCop?: number;
    permiteReingreso?: boolean;
    limitePorPersona?: number | null;
    orden?: number;
    activo?: boolean;
    wompiCuentaId?: number | null;
  }): Promise<TipoCover> {
    const { data, error } = await this.supabase.getClient().rpc('upsert_tipo_cover', {
      p_id: params.id ?? null,
      p_lugar_id: params.lugarId ?? null,
      p_nombre: params.nombre ?? null,
      p_descripcion: params.descripcion ?? null,
      p_precio_cop: params.precioCop ?? null,
      p_permite_reingreso: params.permiteReingreso ?? true,
      p_limite_por_persona: params.limitePorPersona ?? null,
      p_orden: params.orden ?? 0,
      p_activo: params.activo ?? true,
      p_wompi_cuenta_id: params.wompiCuentaId ?? null,
    });
    if (error) throw error;
    return data as TipoCover;
  }

  async upsertPlantillaCover(params: {
    id?: number | null;
    tipoCoverId?: number;
    diaSemana?: number;
    horaApertura?: string;
    horaCierre?: string;
    aforoMaximo?: number | null;
    cantidadMaximaVenta?: number | null;
    diasAnticipacion?: number;
    activo?: boolean;
  }): Promise<PlantillaCover> {
    const { data, error } = await this.supabase.getClient().rpc('upsert_plantilla_cover', {
      p_id: params.id ?? null,
      p_tipo_cover_id: params.tipoCoverId ?? null,
      p_dia_semana: params.diaSemana ?? null,
      p_hora_apertura: params.horaApertura ?? null,
      p_hora_cierre: params.horaCierre ?? null,
      p_aforo_maximo: params.aforoMaximo ?? null,
      p_cantidad_maxima_venta: params.cantidadMaximaVenta ?? null,
      p_dias_anticipacion: params.diasAnticipacion ?? 21,
      p_activo: params.activo ?? true,
    });
    if (error) throw error;
    return data as PlantillaCover;
  }

  async generarSesiones(hastaFecha?: string | null): Promise<number> {
    const { data, error } = await this.supabase.getClient().rpc(
      'generar_sesiones_cover_desde_plantillas',
      { p_hasta_fecha: hastaFecha ?? null },
    );
    if (error) throw error;
    return Number((data as Record<string, unknown>)?.['sesiones_creadas'] ?? 0);
  }

  async crearSesionManual(params: {
    tipoCoverId: number;
    fecha: string;
    horaApertura: string;
    horaCierre: string;
    aforoMaximo?: number | null;
    cantidadMaximaVenta?: number | null;
    precioCop?: number | null;
    estado?: 'programada' | 'abierta';
  }): Promise<SesionCover> {
    const { data, error } = await this.supabase.getClient().rpc('crear_sesion_cover_manual', {
      p_tipo_cover_id: params.tipoCoverId,
      p_fecha: params.fecha,
      p_hora_apertura: params.horaApertura,
      p_hora_cierre: params.horaCierre,
      p_aforo_maximo: params.aforoMaximo ?? null,
      p_cantidad_maxima_venta: params.cantidadMaximaVenta ?? null,
      p_precio_cop: params.precioCop ?? null,
      p_estado: params.estado ?? 'programada',
    });
    if (error) throw error;
    return data as SesionCover;
  }

  async cambiarEstadoSesion(sesionId: number, estado: EstadoSesionCover): Promise<void> {
    const { error } = await this.supabase.getClient().rpc('cambiar_estado_sesion_cover', {
      p_sesion_id: sesionId,
      p_estado: estado,
    });
    if (error) throw error;
  }

  async listarLugaresConCovers(limite = 50, offset = 0): Promise<LugarCoverListado[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_lugares_con_covers', {
      p_limite: limite,
      p_offset: offset,
    });
    if (error) throw error;
    return this.normalizeArray<LugarCoverListado>(data);
  }

  async obtenerLugarCoverPublico(lugarId: number): Promise<DetalleLugarCoverPublico | null> {
    const { data, error } = await this.supabase.getClient().rpc('obtener_lugar_cover', {
      p_lugar_id: lugarId,
    });
    if (error) throw error;
    if (!data) return null;
    const raw = data as Record<string, unknown>;
    return {
      lugar: raw['lugar'] as DetalleLugarCoverPublico['lugar'],
      tipos_cover: this.normalizeArray(raw['tipos_cover']),
      sesiones: this.normalizeArray(raw['sesiones']),
    };
  }

  async validarDisponibilidadCover(items: ItemPedidoCover[]): Promise<{ valido: boolean; errores: string[] }> {
    const errores: string[] = [];
    for (const item of items) {
      const aforo = await this.consultarAforo(item.sesion_cover_id);
      if (!aforo) {
        errores.push(`Sesión cover ${item.sesion_cover_id} no disponible`);
        continue;
      }
      if (aforo.cupos_disponibles < item.cantidad) {
        errores.push(`Sin cupo suficiente para la sesión del ${aforo.fecha}`);
      }
    }
    return { valido: errores.length === 0, errores };
  }

  async procesarCompraCover(params: {
    lugar_id: number;
    cliente_id: number;
    items: ItemPedidoCover[];
    subtotal: number;
    descuento_total?: number;
    porcentaje_servicio: number;
    valor_servicio: number;
    total: number;
    cupon_id?: number | null;
    wompi_cuenta_id?: number | null;
    confirmada?: boolean;
  }): Promise<{ compra_cover_id: number }> {
    const validacion = await this.validarDisponibilidadCover(params.items);
    if (!validacion.valido) {
      throw new Error(validacion.errores.join('\n'));
    }

    const { data, error } = await this.supabase.getClient().rpc('crear_compra_cover_desde_pedido', {
      p_cliente_id: params.cliente_id,
      p_lugar_id: params.lugar_id,
      p_items: params.items,
      p_subtotal: params.subtotal,
      p_descuento_total: params.descuento_total ?? 0,
      p_porcentaje_servicio: params.porcentaje_servicio,
      p_valor_servicio: params.valor_servicio,
      p_total: params.total,
      p_cupon_id: params.cupon_id ?? null,
      p_wompi_cuenta_id: params.wompi_cuenta_id ?? null,
      p_transaccion_checkout_id: null,
      p_confirmada: params.confirmada ?? true,
    });
    if (error) throw error;
    const compraCoverId = Number((data as Record<string, unknown>)?.['compra_cover_id'] ?? 0);
    if (!compraCoverId) {
      throw new Error('No se pudo crear la compra cover');
    }
    return { compra_cover_id: compraCoverId };
  }

  async listarComprasCoverCliente(): Promise<CompraCoverCliente[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_compras_cover_cliente');
    if (error) throw error;
    return this.normalizeArray<CompraCoverCliente>(data);
  }

  /**
   * Covers cuya titularidad te fue transferida (no eres el comprador original).
   */
  async getCoversCedidosTitular(
    clienteId: number,
    cached?: BoletaCoverCliente[],
  ): Promise<BoletaCoverCliente[]> {
    const all = cached ?? (await this.listarBoletasCoverCliente());
    return all.filter((b) => {
      const titular = b.titular_cliente_id ?? b.compra_cliente_id ?? 0;
      return titular === clienteId && (b.compra_cliente_id ?? 0) !== clienteId;
    });
  }

  async listarBoletasCoverCliente(): Promise<BoletaCoverCliente[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_boletas_cover_cliente');
    if (error) throw error;
    return this.normalizeArray<BoletaCoverCliente>(data);
  }

  private normalizeBoletaCoverCliente(raw: unknown): BoletaCoverCliente {
    const row = (raw ?? {}) as Record<string, unknown>;
    const compra = (row['compras_cover'] ?? {}) as Record<string, unknown>;
    const sesion = (row['sesiones_cover'] ?? {}) as Record<string, unknown>;
    const tipo = (row['tipos_cover'] ?? {}) as Record<string, unknown>;
    const lugar = (compra['lugares'] ?? {}) as Record<string, unknown>;

    return {
      id: Number(row['id'] ?? 0),
      compra_cover_id: Number(row['compra_cover_id'] ?? compra['id'] ?? 0),
      sesion_cover_id: Number(row['sesion_cover_id'] ?? 0),
      tipo_cover_id: Number(row['tipo_cover_id'] ?? 0),
      codigo_qr: (row['codigo_qr'] as string | null) ?? null,
      precio_unitario: Number(row['precio_unitario'] ?? 0),
      estado: String(row['estado'] ?? 'pendiente'),
      estado_acceso: (row['estado_acceso'] as BoletaCoverCliente['estado_acceso']) ?? 'pendiente',
      titular_cliente_id: row['titular_cliente_id'] != null ? Number(row['titular_cliente_id']) : null,
      fecha_creacion: row['fecha_creacion'] as string | undefined,
      sesion_fecha: String(sesion['fecha'] ?? ''),
      sesion_hora_apertura: String(sesion['hora_apertura'] ?? ''),
      sesion_hora_cierre: String(sesion['hora_cierre'] ?? ''),
      sesion_estado: sesion['estado'] as BoletaCoverCliente['sesion_estado'],
      tipo_cover_nombre: String(tipo['nombre'] ?? 'Cover'),
      permite_reingreso: tipo['permite_reingreso'] as boolean | undefined,
      lugar_id: Number(compra['lugar_id'] ?? 0),
      lugar_nombre: String(lugar['nombre'] ?? ''),
      compra_cliente_id: compra['cliente_id'] != null ? Number(compra['cliente_id']) : undefined,
      compra_numero_transaccion: String(compra['numero_transaccion'] ?? ''),
      compra_estado_pago: String(compra['estado_pago'] ?? ''),
      compra_estado_compra: String(compra['estado_compra'] ?? ''),
      compra_fecha_compra: String(compra['fecha_compra'] ?? ''),
    };
  }

  async consultarAforo(sesionId: number): Promise<AforoSesionCover | null> {
    const { data, error } = await this.supabase.getClient().rpc('consultar_aforo_sesion_cover', {
      p_sesion_id: sesionId,
    });
    if (error) throw error;
    return (data as AforoSesionCover) ?? null;
  }

  async inicializarCoverLugar(params: {
    lugarId: number;
    nombreTipo: string;
    precioCop: number;
    diaSemana: number;
    horaApertura: string;
    horaCierre: string;
    coversDescripcion?: string | null;
    aforoMaximo?: number | null;
    cantidadMaximaVenta?: number | null;
    permiteReingreso?: boolean;
    categoriaId?: number | null;
    wompiCuentaId?: number | null;
    generarSesiones?: boolean;
  }): Promise<ConfigCoverLugar> {
    const { data, error } = await this.supabase.getClient().rpc('inicializar_cover_lugar', {
      p_lugar_id: params.lugarId,
      p_nombre_tipo: params.nombreTipo,
      p_precio_cop: params.precioCop,
      p_dia_semana: params.diaSemana,
      p_hora_apertura: params.horaApertura,
      p_hora_cierre: params.horaCierre,
      p_covers_descripcion: params.coversDescripcion ?? null,
      p_aforo_maximo: params.aforoMaximo ?? null,
      p_cantidad_maxima_venta: params.cantidadMaximaVenta ?? null,
      p_permite_reingreso: params.permiteReingreso ?? true,
      p_categoria_id: params.categoriaId ?? null,
      p_wompi_cuenta_id: params.wompiCuentaId ?? null,
      p_generar_sesiones: params.generarSesiones ?? true,
    });
    if (error) throw error;
    const raw = data as { config?: ConfigCoverLugar };
    if (raw?.config) return this.normalizeConfig(raw.config);
    return (await this.obtenerConfigLugar(params.lugarId))!;
  }

  private normalizeConfig(raw: unknown): ConfigCoverLugar {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      lugar: o['lugar'] as ConfigCoverLugar['lugar'],
      tipos_cover: this.normalizeArray<TipoCover>(o['tipos_cover']),
      plantillas_cover: this.normalizeArray<PlantillaCover>(o['plantillas_cover']),
      sesiones_cover: this.normalizeArray<SesionCover>(o['sesiones_cover']),
    };
  }

  async buscarBoletaCoverParaEscaneo(codigoQr: string): Promise<BoletaCoverEscaneo | null> {
    const { data, error } = await this.supabase.getClient().rpc('buscar_boleta_cover_para_escaneo', {
      p_codigo_qr: codigoQr.trim(),
    });
    if (error) throw error;
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: Number(row['id'] ?? 0),
      codigo_qr: String(row['codigo_qr'] ?? ''),
      estado_acceso: String(row['estado_acceso'] ?? ''),
      entradas_count: Number(row['entradas_count'] ?? 0),
      salidas_count: Number(row['salidas_count'] ?? 0),
      sesion_cover_id: Number(row['sesion_cover_id'] ?? 0),
      tipo_cover_id: Number(row['tipo_cover_id'] ?? 0),
      lugar_id: Number(row['lugar_id'] ?? 0),
      lugar_nombre: String(row['lugar_nombre'] ?? ''),
      tipo_cover_nombre: String(row['tipo_cover_nombre'] ?? ''),
      permite_reingreso: row['permite_reingreso'] !== false,
      sesion_fecha: String(row['sesion_fecha'] ?? ''),
      hora_apertura: String(row['hora_apertura'] ?? ''),
      hora_cierre: String(row['hora_cierre'] ?? ''),
      estado_pago: row['estado_pago'] != null ? String(row['estado_pago']) : undefined,
      estado_compra: row['estado_compra'] != null ? String(row['estado_compra']) : undefined,
      personas_dentro: Number(row['personas_dentro'] ?? 0),
      aforo_maximo: Number(row['aforo_maximo'] ?? 0),
      titular_nombre: row['titular_nombre'] != null ? String(row['titular_nombre']) : undefined,
      titular_documento: row['titular_documento'] != null ? String(row['titular_documento']) : undefined,
    };
  }

  async registrarAccesoCover(
    codigoQr: string,
    tipoMovimiento: 'entrada' | 'salida',
    sesionCoverId?: number | null,
  ): Promise<{ ok: boolean; estado_acceso: string; personas_dentro: number }> {
    const { data, error } = await this.supabase.getClient().rpc('registrar_acceso_cover', {
      p_codigo_qr: codigoQr.trim(),
      p_tipo_movimiento: tipoMovimiento,
      p_sesion_cover_id: sesionCoverId ?? null,
    });
    if (error) throw error;
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: row['ok'] === true,
      estado_acceso: String(row['estado_acceso'] ?? ''),
      personas_dentro: Number(row['personas_dentro'] ?? 0),
    };
  }

  private normalizeArray<T>(raw: unknown): T[] {
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
