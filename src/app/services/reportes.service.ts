/* ============================================
   REPORTES SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { DateTimeUtil } from '../utils/date-time.util';

export interface ReporteVentas {
  fecha: string;
  ventas: number;
  ingresos: number;
  boletas_vendidas: number;
}

export interface ReporteAsistencia {
  evento_id: number;
  evento_titulo: string;
  boletas_vendidas: number;
  boletas_usadas: number;
  boletas_pendientes: number;
  tasa_asistencia: number;
}

export interface ReporteEvento {
  evento_id: number;
  evento_titulo: string;
  ingresos: number;
  boletas_vendidas: number;
  boletas_usadas: number;
  clientes_unicos: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface VentaCompletadaDetalle {
  compra_id: number;
  fecha_compra: string;
  numero_transaccion: string;
  evento_id: number;
  evento_titulo: string;
  cliente_id: number;
  cliente_nombre: string;
  cliente_email: string;
  metodo_pago?: string;
  cupon_codigo?: string;
  cupon_porcentaje?: number;
  subtotal: number;
  descuento_total: number;
  porcentaje_servicio: number;
  valor_servicio: number;
  total: number;
  boletas: number;
}

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  /** PostgREST devuelve como máximo 1000 filas por petición. */
  private readonly supabasePageSize = 1000;

  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Recorre páginas de una consulta Supabase hasta agotar resultados.
   */
  private async fetchAllPages<T>(
    buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
  ): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += this.supabasePageSize) {
      const { data, error } = await buildQuery(from, from + this.supabasePageSize - 1);
      if (error) {
        throw error;
      }
      const batch = data || [];
      all.push(...batch);
      if (batch.length < this.supabasePageSize) {
        break;
      }
    }
    return all;
  }

  private compraEventoId(compra: unknown): number | null {
    const row = Array.isArray(compra) ? compra[0] : compra;
    const eventoId = Number((row as { evento_id?: number | string } | null)?.evento_id);
    return Number.isFinite(eventoId) && eventoId > 0 ? eventoId : null;
  }

  /**
   * Obtiene reporte de ventas por día en un rango de fechas
   */
  async getVentasPorDia(fechaDesde?: string, fechaHasta?: string, organizadorId?: number, eventoId?: number): Promise<ReporteVentas[]> {
    try {
      type CompraVentaDia = { id: number; total: number; fecha_compra: string; evento_id: number };

      let data: CompraVentaDia[] | null = null;
      let error: { message: string } | null = null;

      if (organizadorId != null) {
        let query = this.supabase
          .from('compras')
          .select('id, total, fecha_compra, evento_id, eventos!inner(organizador_id)')
          .eq('estado_pago', 'completado')
          .eq('eventos.organizador_id', organizadorId);

        if (eventoId) {
          query = query.eq('evento_id', eventoId);
        }
        if (fechaDesde) {
          query = query.gte('fecha_compra', fechaDesde);
        }
        if (fechaHasta) {
          query = query.lte('fecha_compra', fechaHasta);
        }

        const response = await query;
        data = response.data as CompraVentaDia[] | null;
        error = response.error;
      } else {
        let query = this.supabase
          .from('compras')
          .select('id, total, fecha_compra, evento_id')
          .eq('estado_pago', 'completado');

        if (eventoId) {
          query = query.eq('evento_id', eventoId);
        }
        if (fechaDesde) {
          query = query.gte('fecha_compra', fechaDesde);
        }
        if (fechaHasta) {
          query = query.lte('fecha_compra', fechaHasta);
        }

        const response = await query;
        data = response.data;
        error = response.error;
      }

      if (error || !data) {
        return [];
      }

      // Obtener todos los IDs de compras
      const compraIds = data.map(c => c.id);

      // Obtener todas las boletas de estas compras en una sola petición
      const { data: boletas, error: boletasError } = await this.supabase
        .from('boletas_compradas')
        .select('compra_id')
        .in('compra_id', compraIds);

      if (boletasError) {
        console.error('Error obteniendo boletas:', boletasError);
      }

      // Crear un mapa de compra_id -> cantidad de boletas
      const boletasPorCompra: { [key: number]: number } = {};
      if (boletas) {
        boletas.forEach(boleta => {
          boletasPorCompra[boleta.compra_id] = (boletasPorCompra[boleta.compra_id] || 0) + 1;
        });
      }

      // Agrupar por día
      const ventasPorDia: { [key: string]: { ventas: number; ingresos: number; boletas: number } } = {};

      for (const compra of data) {
        const fecha = DateTimeUtil.toCalendarDateKey(compra.fecha_compra);
        if (!fecha) {
          continue;
        }
        
        if (!ventasPorDia[fecha]) {
          ventasPorDia[fecha] = { ventas: 0, ingresos: 0, boletas: 0 };
        }

        ventasPorDia[fecha].ventas += 1;
        ventasPorDia[fecha].ingresos += Number(compra.total || 0);
        ventasPorDia[fecha].boletas += boletasPorCompra[compra.id] || 0;
      }

      return Object.entries(ventasPorDia)
        .map(([fecha, datos]) => ({
          fecha,
          ventas: datos.ventas,
          ingresos: datos.ingresos,
          boletas_vendidas: datos.boletas
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    } catch (error) {
      console.error('Error en getVentasPorDia:', error);
      return [];
    }
  }

  /**
   * Obtiene reporte de ventas por mes
   */
  async getVentasPorMes(organizadorId?: number, eventoId?: number): Promise<{ mes: string; ventas: number; ingresos: number }[]> {
    try {
      type CompraVentaMes = { total: number; fecha_compra: string; evento_id: number };

      let data: CompraVentaMes[] | null = null;
      let error: { message: string } | null = null;

      if (organizadorId != null) {
        let query = this.supabase
          .from('compras')
          .select('total, fecha_compra, evento_id, eventos!inner(organizador_id)')
          .eq('estado_pago', 'completado')
          .eq('eventos.organizador_id', organizadorId);
        if (eventoId) {
          query = query.eq('evento_id', eventoId);
        }
        const response = await query;
        data = response.data as CompraVentaMes[] | null;
        error = response.error;
      } else {
        let query = this.supabase
          .from('compras')
          .select('total, fecha_compra, evento_id')
          .eq('estado_pago', 'completado');
        if (eventoId) {
          query = query.eq('evento_id', eventoId);
        }
        const response = await query;
        data = response.data;
        error = response.error;
      }

      if (error || !data) {
        return [];
      }

      const ventasPorMes: { [key: string]: { ventas: number; ingresos: number } } = {};

      data.forEach(compra => {
        const mes = DateTimeUtil.toCalendarMonthKey(compra.fecha_compra);
        if (!mes) {
          return;
        }

        if (!ventasPorMes[mes]) {
          ventasPorMes[mes] = { ventas: 0, ingresos: 0 };
        }

        ventasPorMes[mes].ventas += 1;
        ventasPorMes[mes].ingresos += Number(compra.total || 0);
      });

      return Object.entries(ventasPorMes)
        .map(([mes, datos]) => ({
          mes,
          ventas: datos.ventas,
          ingresos: datos.ingresos
        }))
        .sort((a, b) => a.mes.localeCompare(b.mes));
    } catch (error) {
      console.error('Error en getVentasPorMes:', error);
      return [];
    }
  }

  /**
   * Obtiene reporte de asistencia por evento
   */
  async getAsistenciaPorEvento(organizadorId?: number, eventoId?: number): Promise<ReporteAsistencia[]> {
    try {
      let eventosQuery = this.supabase
        .from('eventos')
        .select('id, titulo');

      if (organizadorId) {
        eventosQuery = eventosQuery.eq('organizador_id', organizadorId);
      }
      if (eventoId) {
        eventosQuery = eventosQuery.eq('id', eventoId);
      }

      const { data: eventos, error: eventosError } = await eventosQuery;

      if (eventosError || !eventos || eventos.length === 0) {
        return [];
      }

      const eventosIds = eventos.map(e => e.id);

      const boletas = await this.fetchAllPages<{
        estado: string;
        compras: { evento_id: number } | { evento_id: number }[];
      }>((from, to) =>
        this.supabase
          .from('boletas_compradas')
          .select('estado, compras!inner(estado_pago, evento_id)')
          .eq('compras.estado_pago', 'completado')
          .in('compras.evento_id', eventosIds)
          .range(from, to)
      );

      const boletasPorEvento: { [key: number]: { vendidas: number; usadas: number; pendientes: number } } = {};

      for (const boleta of boletas) {
        const evId = this.compraEventoId(boleta.compras);
        if (evId == null) {
          continue;
        }
        if (!boletasPorEvento[evId]) {
          boletasPorEvento[evId] = { vendidas: 0, usadas: 0, pendientes: 0 };
        }
        boletasPorEvento[evId].vendidas += 1;
        if (boleta.estado === 'usada') {
          boletasPorEvento[evId].usadas += 1;
        } else if (boleta.estado === 'pendiente') {
          boletasPorEvento[evId].pendientes += 1;
        }
      }

      const reportes: ReporteAsistencia[] = eventos.map(evento => {
        const stats = boletasPorEvento[evento.id] || { vendidas: 0, usadas: 0, pendientes: 0 };
        const tasa_asistencia = stats.vendidas > 0
          ? Math.round((stats.usadas / stats.vendidas) * 100)
          : 0;

        return {
          evento_id: evento.id,
          evento_titulo: evento.titulo,
          boletas_vendidas: stats.vendidas,
          boletas_usadas: stats.usadas,
          boletas_pendientes: stats.pendientes,
          tasa_asistencia
        };
      });

      return reportes
        .filter(r => r.boletas_vendidas > 0)
        .sort((a, b) => b.boletas_vendidas - a.boletas_vendidas);
    } catch (error) {
      console.error('Error en getAsistenciaPorEvento:', error);
      return [];
    }
  }

  /**
   * Obtiene reporte detallado de un evento específico
   */
  async getReporteEvento(eventoId: number): Promise<ReporteEvento | null> {
    try {
      // Obtener evento
      const { data: evento, error: eventoError } = await this.supabase
        .from('eventos')
        .select('id, titulo, fecha_inicio, fecha_fin')
        .eq('id', eventoId)
        .single();

      if (eventoError || !evento) {
        return null;
      }

      // Obtener tipos de boleta
      const { data: tipos } = await this.supabase
        .from('tipos_boleta')
        .select('id')
        .eq('evento_id', eventoId);

      if (!tipos || tipos.length === 0) {
        return {
          evento_id: evento.id,
          evento_titulo: evento.titulo,
          ingresos: 0,
          boletas_vendidas: 0,
          boletas_usadas: 0,
          clientes_unicos: 0,
          fecha_inicio: evento.fecha_inicio,
          fecha_fin: evento.fecha_fin
        };
      }

      const tiposIds = tipos.map(t => t.id);

      // Obtener compras del evento
      const { data: compras } = await this.supabase
        .from('compras')
        .select('id, total, cliente_id')
        .eq('evento_id', eventoId)
        .eq('estado_pago', 'completado');

      const ingresos = compras?.reduce((sum, c) => sum + Number(c.total || 0), 0) || 0;
      const clientes_unicos = new Set(compras?.map(c => c.cliente_id) || []).size;

      // Obtener boletas (solo con pago completado)
      const { data: boletas } = await this.supabase
        .from('boletas_compradas')
        .select('estado, compras!inner(estado_pago)')
        .in('tipo_boleta_id', tiposIds)
        .eq('compras.estado_pago', 'completado');

      const boletas_vendidas = boletas?.length || 0;
      const boletas_usadas = boletas?.filter(b => b.estado === 'usada').length || 0;

      return {
        evento_id: evento.id,
        evento_titulo: evento.titulo,
        ingresos,
        boletas_vendidas,
        boletas_usadas,
        clientes_unicos,
        fecha_inicio: evento.fecha_inicio,
        fecha_fin: evento.fecha_fin
      };
    } catch (error) {
      console.error('Error en getReporteEvento:', error);
      return null;
    }
  }

  /**
   * Obtiene distribución de métodos de pago (por cantidad de compras completadas).
   */
  async getDistribucionMetodoPago(organizadorId?: number, eventoId?: number): Promise<{ metodo: string; cantidad: number; porcentaje: number }[]> {
    try {
      type CompraMetodo = { metodo_pago: string | null };

      let data: CompraMetodo[] | null = null;
      let error: { message: string } | null = null;

      if (organizadorId != null) {
        let query = this.supabase
          .from('compras')
          .select('metodo_pago, evento_id, eventos!inner(organizador_id)')
          .eq('estado_pago', 'completado')
          .eq('eventos.organizador_id', organizadorId);
        if (eventoId) {
          query = query.eq('evento_id', eventoId);
        }
        const response = await query;
        data = response.data as CompraMetodo[] | null;
        error = response.error;
      } else {
        let query = this.supabase
          .from('compras')
          .select('metodo_pago, evento_id')
          .eq('estado_pago', 'completado');
        if (eventoId) {
          query = query.eq('evento_id', eventoId);
        }
        const response = await query;
        data = response.data;
        error = response.error;
      }

      if (error || !data) {
        return [];
      }

      const distribucion: { [key: string]: number } = {};
      const total = data.length;

      data.forEach(compra => {
        const metodo = compra.metodo_pago || 'otro';
        distribucion[metodo] = (distribucion[metodo] || 0) + 1;
      });

      return Object.entries(distribucion)
        .map(([metodo, cantidad]) => ({
          metodo: this.getMetodoPagoLabel(metodo),
          cantidad,
          porcentaje: total > 0 ? Math.round((cantidad / total) * 100) : 0
        }))
        .sort((a, b) => b.cantidad - a.cantidad);
    } catch (error) {
      console.error('Error en getDistribucionMetodoPago:', error);
      return [];
    }
  }

  /**
   * Obtiene distribución por tipo de boleta (por cantidad de boletas vendidas con pago completado).
   */
  async getDistribucionTipoBoleta(organizadorId?: number, eventoId?: number): Promise<{ tipo: string; cantidad: number; porcentaje: number }[]> {
    try {
      type BoletaTipo = {
        tipo_boleta_id: number;
        tipos_boleta: { nombre: string } | { nombre: string }[];
      };

      let eventosIds: number[] | null = null;
      if (organizadorId != null || eventoId != null) {
        let eventosQuery = this.supabase.from('eventos').select('id');
        if (organizadorId != null) {
          eventosQuery = eventosQuery.eq('organizador_id', organizadorId);
        }
        if (eventoId != null) {
          eventosQuery = eventosQuery.eq('id', eventoId);
        }
        const { data: eventos, error: eventosError } = await eventosQuery;
        if (eventosError || !eventos?.length) {
          return [];
        }
        eventosIds = eventos.map((e) => e.id);
      }

      const boletas = await this.fetchAllPages<BoletaTipo>((from, to) => {
        let query = this.supabase
          .from('boletas_compradas')
          .select('tipo_boleta_id, tipos_boleta!inner(nombre), compras!inner(estado_pago, evento_id)')
          .eq('compras.estado_pago', 'completado');
        if (eventosIds) {
          query = query.in('compras.evento_id', eventosIds);
        }
        return query.range(from, to);
      });

      const distribucion: { [key: string]: number } = {};
      const total = boletas.length;

      for (const boleta of boletas) {
        const label = this.getTipoBoletaLabel(boleta);
        distribucion[label] = (distribucion[label] || 0) + 1;
      }

      return Object.entries(distribucion)
        .map(([tipo, cantidad]) => ({
          tipo,
          cantidad,
          porcentaje: total > 0 ? Math.round((cantidad / total) * 100) : 0,
        }))
        .sort((a, b) => b.cantidad - a.cantidad);
    } catch (error) {
      console.error('Error en getDistribucionTipoBoleta:', error);
      return [];
    }
  }

  /**
   * Obtiene ingresos por evento
   */
  async getIngresosPorEvento(organizadorId?: number, eventoId?: number): Promise<{ evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[]> {
    try {
      let eventosQuery = this.supabase
        .from('eventos')
        .select('id, titulo');

      if (organizadorId) {
        eventosQuery = eventosQuery.eq('organizador_id', organizadorId);
      }

      if (eventoId) {
        eventosQuery = eventosQuery.eq('id', eventoId);
      }

      const { data: eventos, error: eventosError } = await eventosQuery;

      if (eventosError || !eventos || eventos.length === 0) {
        return [];
      }

      const eventosIds = eventos.map(e => e.id);

      const compras = await this.fetchAllPages<{ id: number; total: number; evento_id: number }>(
        (from, to) =>
          this.supabase
            .from('compras')
            .select('id, total, evento_id')
            .in('evento_id', eventosIds)
            .eq('estado_pago', 'completado')
            .range(from, to)
      );

      const ingresosPorEvento: { [key: number]: number } = {};
      for (const compra of compras) {
        const eventoIdCompra = compra.evento_id;
        ingresosPorEvento[eventoIdCompra] =
          (ingresosPorEvento[eventoIdCompra] || 0) + Number(compra.total || 0);
      }

      const boletas = await this.fetchAllPages<{
        compras: { evento_id: number } | { evento_id: number }[];
      }>((from, to) =>
        this.supabase
          .from('boletas_compradas')
          .select('compras!inner(estado_pago, evento_id)')
          .eq('compras.estado_pago', 'completado')
          .in('compras.evento_id', eventosIds)
          .range(from, to)
      );

      const boletasPorEvento: { [key: number]: number } = {};
      for (const boleta of boletas) {
        const evId = this.compraEventoId(boleta.compras);
        if (evId == null) {
          continue;
        }
        boletasPorEvento[evId] = (boletasPorEvento[evId] || 0) + 1;
      }

      const reportes = eventos.map(evento => ({
        evento_id: evento.id,
        evento_titulo: evento.titulo,
        ingresos: ingresosPorEvento[evento.id] || 0,
        boletas_vendidas: boletasPorEvento[evento.id] || 0
      }));

      return reportes
        .filter(r => r.ingresos > 0 || r.boletas_vendidas > 0)
        .sort((a, b) => b.ingresos - a.ingresos);
    } catch (error) {
      console.error('Error en getIngresosPorEvento:', error);
      return [];
    }
  }

  private getTipoBoletaLabel(boleta: {
    tipo_boleta_id: number;
    tipos_boleta?: { nombre: string; eventos?: { titulo: string } | { titulo: string }[] } | { nombre: string; eventos?: { titulo: string } | { titulo: string }[] }[];
  }): string {
    const tipoRaw = boleta.tipos_boleta;
    const tipo = Array.isArray(tipoRaw) ? tipoRaw[0] : tipoRaw;
    const nombre = tipo?.nombre?.trim() || `Tipo #${boleta.tipo_boleta_id}`;
    const eventoRaw = tipo?.eventos;
    const evento = Array.isArray(eventoRaw) ? eventoRaw[0] : eventoRaw;
    const titulo = evento?.titulo?.trim();
    return titulo ? `${nombre} (${titulo})` : nombre;
  }

  private getMetodoPagoLabel(metodo: string): string {
    const labels: { [key: string]: string } = {
      'tarjeta_credito': 'Tarjeta de Crédito',
      'tarjeta_debito': 'Tarjeta de Débito',
      'transferencia': 'Transferencia',
      'efectivo': 'Efectivo',
      'pse': 'PSE',
      'nequi': 'Nequi',
      'daviplata': 'Daviplata',
      'puntos_colombia': 'Puntos Colombia',
      'bnpl_bancolombia': 'BNPL Bancolombia',
      'su_plus': 'SU Plus',
      'otro': 'Otro'
    };
    return labels[metodo] || metodo;
  }

  /**
   * Reporte DETALLADO de ventas completadas por evento (para Admin).
   * Retorna una fila por compra (estado_pago = 'completado'), incluyendo cantidad de boletas por compra.
   */
  async getVentasCompletadasDetallePorEvento(eventoId: number): Promise<VentaCompletadaDetalle[]> {
    try {
      const { data: compras, error } = await this.supabase
        .from('compras')
        .select(`
          id,
          fecha_compra,
          numero_transaccion,
          metodo_pago,
          subtotal,
          descuento_total,
          porcentaje_servicio,
          valor_servicio,
          total,
          cliente_id,
          evento_id,
          cliente:usuarios(id, nombre, apellido, email),
          evento:eventos(id, titulo),
          cupon:cupones_descuento!compras_cupon_id_fkey(id, codigo, porcentaje_descuento)
        `)
        .eq('estado_pago', 'completado')
        .eq('evento_id', eventoId)
        .order('fecha_compra', { ascending: false });

      if (error || !compras || compras.length === 0) {
        return [];
      }

      const compraIds = compras.map((c: any) => c.id).filter(Boolean);
      const boletasPorCompra: Record<number, number> = {};

      if (compraIds.length > 0) {
        const { data: boletas, error: boletasError } = await this.supabase
          .from('boletas_compradas')
          .select('compra_id')
          .in('compra_id', compraIds);

        if (boletasError) {
          console.error('Error obteniendo boletas por compra:', boletasError);
        }

        (boletas || []).forEach((b: any) => {
          const id = Number(b.compra_id);
          if (!Number.isNaN(id)) {
            boletasPorCompra[id] = (boletasPorCompra[id] || 0) + 1;
          }
        });
      }

      return compras.map((c: any) => {
        const clienteNombre = `${c?.cliente?.nombre || ''} ${c?.cliente?.apellido || ''}`.trim() || 'Cliente';
        return {
          compra_id: Number(c.id),
          fecha_compra: c.fecha_compra,
          numero_transaccion: c.numero_transaccion || '',
          evento_id: Number(c.evento_id),
          evento_titulo: c?.evento?.titulo || 'Evento',
          cliente_id: Number(c.cliente_id),
          cliente_nombre: clienteNombre,
          cliente_email: c?.cliente?.email || '',
          metodo_pago: c.metodo_pago || '',
          cupon_codigo: c?.cupon?.codigo || '',
          cupon_porcentaje: c?.cupon?.porcentaje_descuento ? Number(c.cupon.porcentaje_descuento) : 0,
          subtotal: Number(c.subtotal || 0),
          descuento_total: Number(c.descuento_total || 0),
          porcentaje_servicio: Number(c.porcentaje_servicio || 0),
          valor_servicio: Number(c.valor_servicio || 0),
          total: Number(c.total || 0),
          boletas: boletasPorCompra[Number(c.id)] || 0
        } as VentaCompletadaDetalle;
      });
    } catch (err) {
      console.error('Error en getVentasCompletadasDetallePorEvento:', err);
      return [];
    }
  }

  /**
   * Ingresos netos por tipo de boleta (después de descuentos/cupones/venta manual),
   * prorrateados desde cada compra completada. No incluye cargo de servicio.
   */
  async getIngresosNetosPorTipoBoleta(
    eventoId: number
  ): Promise<Map<number, { vendidas: number; ingresosNetos: number }>> {
    const result = new Map<number, { vendidas: number; ingresosNetos: number }>();
    try {
      type Row = {
        tipo_boleta_id: number;
        precio_unitario: number | null;
        compra_id: number;
        compras:
          | {
              estado_pago: string;
              evento_id: number;
              subtotal: number | null;
              descuento_total: number | null;
            }
          | {
              estado_pago: string;
              evento_id: number;
              subtotal: number | null;
              descuento_total: number | null;
            }[];
      };

      const rows = await this.fetchAllPages<Row>((from, to) =>
        this.supabase
          .from('boletas_compradas')
          .select(
            'tipo_boleta_id, precio_unitario, compra_id, compras!inner(estado_pago, evento_id, subtotal, descuento_total)'
          )
          .eq('compras.estado_pago', 'completado')
          .eq('compras.evento_id', eventoId)
          .range(from, to)
      );

      const porCompra = new Map<number, Row[]>();
      for (const row of rows) {
        const list = porCompra.get(row.compra_id) ?? [];
        list.push(row);
        porCompra.set(row.compra_id, list);
      }

      for (const boletas of porCompra.values()) {
        const compraRaw = boletas[0]?.compras;
        const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;
        const brutoLineas = boletas.reduce(
          (sum, b) => sum + Math.max(0, Number(b.precio_unitario ?? 0)),
          0
        );
        const subtotal = Math.max(0, Number(compra?.subtotal ?? brutoLineas));
        const descuento = Math.min(Math.max(0, Number(compra?.descuento_total ?? 0)), subtotal);
        const neto = Math.max(0, subtotal - descuento);
        const factor = subtotal > 0 ? neto / subtotal : 0;

        for (const b of boletas) {
          const tipoId = Number(b.tipo_boleta_id);
          if (!Number.isFinite(tipoId) || tipoId <= 0) continue;
          const prev = result.get(tipoId) ?? { vendidas: 0, ingresosNetos: 0 };
          prev.vendidas += 1;
          prev.ingresosNetos += Math.max(0, Number(b.precio_unitario ?? 0)) * factor;
          result.set(tipoId, prev);
        }
      }

      for (const [tipoId, stats] of result) {
        result.set(tipoId, {
          vendidas: stats.vendidas,
          ingresosNetos: Math.round(stats.ingresosNetos),
        });
      }
    } catch (err) {
      console.error('Error en getIngresosNetosPorTipoBoleta:', err);
    }
    return result;
  }
}

