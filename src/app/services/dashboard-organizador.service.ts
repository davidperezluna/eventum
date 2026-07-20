/* ============================================
   DASHBOARD ORGANIZADOR SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { DashboardStats } from '../types';
import { agregarFinanzasDesdeComprasCompletadas } from '../utils/wompi-finanzas';
import { DateTimeUtil } from '../utils/date-time.util';

@Injectable({
  providedIn: 'root'
})
export class DashboardOrganizadorService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Obtiene las estadísticas del dashboard para un organizador específico
   */
  async getStats(organizadorId: number, eventoId?: number): Promise<DashboardStats> {
    const now = this.timezoneService.getCurrentDateISO();

    // Función helper para manejar errores
    const safeExecute = async <T>(fn: () => Promise<T>, defaultValue: T): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        console.error('Error en consulta:', error);
        return defaultValue;
      }
    };

    const withEventFilter = (query: any, column = 'evento_id') =>
      eventoId ? query.eq(column, eventoId) : query;

    // Eventos activos del organizador (misma regla que dashboard admin)
    const eventosActivos = safeExecute(async () => {
      const base = () =>
        withEventFilter(
          this.supabase
          .from('eventos')
          .select('id', { count: 'exact', head: true })
          .eq('organizador_id', organizadorId)
          .eq('activo', true)
          .eq('estado', 'publicado'),
          'id'
        );

      const [sinFechaFin, conFechaFinVigente] = await Promise.all([
        base().is('fecha_fin', null),
        base().gte('fecha_fin', now)
      ]);

      if (sinFechaFin.error) {
        console.error('Error en eventos activos (sin fecha_fin):', sinFechaFin.error);
        return 0;
      }
      if (conFechaFinVigente.error) {
        console.error('Error en eventos activos (fecha_fin vigente):', conFechaFinVigente.error);
        return 0;
      }
      return (sinFechaFin.count ?? 0) + (conFechaFinVigente.count ?? 0);
    }, 0);

    // Boletas vendidas de eventos del organizador (solo con pago completado)
    const boletasVendidas = safeExecute(async () => {
      try {
        // Obtener todos los tipos de boleta de eventos del organizador
        const { data: tiposData, error: tiposError } = await withEventFilter(this.supabase
          .from('tipos_boleta')
          .select('id, evento_id, eventos!inner(organizador_id)')
          .eq('eventos.organizador_id', organizadorId));

        if (tiposError || !tiposData || tiposData.length === 0) {
          return 0;
        }

        const tiposIds = tiposData.map((t: any) => t.id);
        
        // Contar boletas compradas de esos tipos con pago completado
        const { count, error } = await this.supabase
          .from('boletas_compradas')
          .select('*, compras!inner(estado_pago)', { count: 'exact' })
          .in('tipo_boleta_id', tiposIds)
          .eq('compras.estado_pago', 'completado');

        if (error) {
          console.error('Error en boletas vendidas:', error);
          return 0;
        }
        return count || 0;
      } catch (error) {
        console.error('Error en boletas vendidas:', error);
        return 0;
      }
    }, 0);

    const eventosDelOrganizadorIds = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('eventos')
        .select('id')
        .eq('organizador_id', organizadorId), 'id');

      if (response.error || !Array.isArray(response.data)) {
        return [] as number[];
      }
      return response.data
        .map((e: any) => Number(e.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    }, [] as number[]);

    // Unidades de productos vendidas de eventos del organizador (solo pago completado)
    const productosVendidos = safeExecute(async () => {
      const eventosIds = await eventosDelOrganizadorIds;
      if (eventosIds.length === 0) return 0;

      const response = await withEventFilter(this.supabase
        .from('compras_productos_items')
        .select('cantidad, compra:compras_productos!inner(estado_pago, evento_id)')
        .eq('compra.estado_pago', 'completado')
        .in('compra.evento_id', eventosIds), 'compra.evento_id');

      if (response.error) {
        console.error('Error en productos vendidos del organizador:', response.error);
        return 0;
      }
      if (!Array.isArray(response.data)) return 0;
      return response.data.reduce((sum: number, item: any) => sum + Number(item.cantidad || 0), 0);
    }, 0);

    // Pedidos de productos completados del organizador
    const pedidosProductos = safeExecute(async () => {
      const eventosIds = await eventosDelOrganizadorIds;
      if (eventosIds.length === 0) return 0;

      const response = await withEventFilter(this.supabase
        .from('compras_productos')
        .select('id', { count: 'exact', head: true })
        .eq('estado_pago', 'completado')
        .in('evento_id', eventosIds));

      if (response.error) {
        console.error('Error en pedidos de productos del organizador:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Disponibilidad de productos configurados en los eventos del organizador
    const tieneProductos = safeExecute(async () => {
      const eventosIds = await eventosDelOrganizadorIds;
      if (eventosIds.length === 0) return false;

      const response = await withEventFilter(this.supabase
        .from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)
        .in('evento_id', eventosIds));

      if (response.error) {
        console.error('Error validando productos configurados del organizador:', response.error);
        return false;
      }
      return (response.count || 0) > 0;
    }, false);

    // Ingresos, servicio y estimación Wompi (misma lógica que dashboard admin)
    const ingresosYServicioTotales = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total, valor_servicio, porcentaje_servicio, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId));

      if (response.error) {
        console.error('Error en ingresos/agregados financieros:', response.error);
        return {
          ingresos: 0,
          valorServicioTotal: 0,
          porcentajeServicioPromedio: 0,
          wompiTotalEstimado: 0,
          wompiVentasTotal: 0,
          wompiServicioTotal: 0,
          netoVentasPostWompiTotal: 0,
          netoServicioPostWompiTotal: 0,
          ingresosVentasBrutoTotal: 0,
        };
      }
      if (response.data && Array.isArray(response.data)) {
        const filas = response.data as any[];
        const a = agregarFinanzasDesdeComprasCompletadas(filas);
        return {
          ingresos: a.ingresos,
          valorServicioTotal: a.valorServicioTotal,
          porcentajeServicioPromedio: a.porcentajeServicioPromedio,
          wompiTotalEstimado: a.wompi_total_estimado,
          wompiVentasTotal: a.wompi_ventas_total,
          wompiServicioTotal: a.wompi_servicio_total,
          netoVentasPostWompiTotal: a.neto_ventas_post_wompi_total,
          netoServicioPostWompiTotal: a.neto_servicio_post_wompi_total,
          ingresosVentasBrutoTotal: a.ingresos_ventas_bruto_total,
        };
      }
      return {
        ingresos: 0,
        valorServicioTotal: 0,
        porcentajeServicioPromedio: 0,
        wompiTotalEstimado: 0,
        wompiVentasTotal: 0,
        wompiServicioTotal: 0,
        netoVentasPostWompiTotal: 0,
        netoServicioPostWompiTotal: 0,
        ingresosVentasBrutoTotal: 0,
      };
    }, {
      ingresos: 0,
      valorServicioTotal: 0,
      porcentajeServicioPromedio: 0,
      wompiTotalEstimado: 0,
      wompiVentasTotal: 0,
      wompiServicioTotal: 0,
      netoVentasPostWompiTotal: 0,
      netoServicioPostWompiTotal: 0,
      ingresosVentasBrutoTotal: 0,
    });

    // Ingresos, servicio y Wompi para compras de productos del organizador
    const ingresosYServicioProductos = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras_productos')
        .select('total, valor_servicio, porcentaje_servicio, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId));

      if (response.error) {
        console.error('Error en ingresos/agregados de productos:', response.error);
        return {
          ingresos: 0,
          valorServicioTotal: 0,
          porcentajeServicioPromedio: 0,
          wompiTotalEstimado: 0,
          wompiVentasTotal: 0,
          wompiServicioTotal: 0,
          netoVentasPostWompiTotal: 0,
          netoServicioPostWompiTotal: 0,
          ingresosVentasBrutoTotal: 0,
        };
      }
      if (Array.isArray(response.data)) {
        const a = agregarFinanzasDesdeComprasCompletadas(response.data as any[]);
        return {
          ingresos: a.ingresos,
          valorServicioTotal: a.valorServicioTotal,
          porcentajeServicioPromedio: a.porcentajeServicioPromedio,
          wompiTotalEstimado: a.wompi_total_estimado,
          wompiVentasTotal: a.wompi_ventas_total,
          wompiServicioTotal: a.wompi_servicio_total,
          netoVentasPostWompiTotal: a.neto_ventas_post_wompi_total,
          netoServicioPostWompiTotal: a.neto_servicio_post_wompi_total,
          ingresosVentasBrutoTotal: a.ingresos_ventas_bruto_total,
        };
      }
      return {
        ingresos: 0,
        valorServicioTotal: 0,
        porcentajeServicioPromedio: 0,
        wompiTotalEstimado: 0,
        wompiVentasTotal: 0,
        wompiServicioTotal: 0,
        netoVentasPostWompiTotal: 0,
        netoServicioPostWompiTotal: 0,
        ingresosVentasBrutoTotal: 0,
      };
    }, {
      ingresos: 0,
      valorServicioTotal: 0,
      porcentajeServicioPromedio: 0,
      wompiTotalEstimado: 0,
      wompiVentasTotal: 0,
      wompiServicioTotal: 0,
      netoVentasPostWompiTotal: 0,
      netoServicioPostWompiTotal: 0,
      ingresosVentasBrutoTotal: 0,
    });

    // Clientes únicos que compraron eventos del organizador (solo con pago completado)
    const clientes = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('cliente_id, evento_id, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
        .eq('estado_pago', 'completado'));
      
      if (response.error) {
        console.error('Error en clientes:', response.error);
        return 0;
      }
      if (response.data && Array.isArray(response.data)) {
        const uniqueClients = new Set((response.data as any[]).map((c: any) => c.cliente_id));
        return uniqueClients.size;
      }
      return 0;
    }, 0);

    // Ventas recientes del organizador (boletas + productos)
    const ventasRecientes = safeExecute(async () => {
      const [comprasRes, comprasProductosRes] = await Promise.all([
        withEventFilter(this.supabase
          .from('compras')
          .select('id, cliente_id, evento_id, numero_transaccion, total, estado_pago, fecha_compra, evento:eventos!inner(id, titulo, organizador_id)')
          .eq('evento.organizador_id', organizadorId)
          .eq('estado_pago', 'completado')
          .order('fecha_compra', { ascending: false })
          .limit(20)),
        withEventFilter(this.supabase
          .from('compras_productos')
          .select('id, cliente_id, evento_id, numero_pedido, total, estado_pago, fecha_compra, evento:eventos!inner(id, titulo, organizador_id)')
          .eq('evento.organizador_id', organizadorId)
          .eq('estado_pago', 'completado')
          .order('fecha_compra', { ascending: false })
          .limit(20))
      ]);

      if (comprasRes.error) {
        console.error('Error en ventas recientes (boletas):', comprasRes.error);
      }
      if (comprasProductosRes.error) {
        console.error('Error en ventas recientes (productos):', comprasProductosRes.error);
      }

      const boletas = Array.isArray(comprasRes.data) ? comprasRes.data : [];
      const productos = Array.isArray(comprasProductosRes.data) ? comprasProductosRes.data : [];

      const normalizarFecha = (v: any): number => {
        const t = new Date(v || 0).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      const extractSeed = (value: unknown): number => {
        const raw = String(value || '');
        const m = raw.match(/(\d{10,})/);
        if (!m) return 0;
        const n = Number(m[1]);
        return Number.isFinite(n) ? n : 0;
      };
      const pickEvent = (raw: any): any => Array.isArray(raw) ? (raw[0] || null) : raw;

      const rows = [
        ...boletas.map((c: any) => ({
          source: 'ventas' as const,
          id: c.id,
          cliente_id: c.cliente_id,
          evento_id: c.evento_id,
          fecha_compra: c.fecha_compra,
          total: Number(c.total || 0),
          estado_pago: c.estado_pago || 'completado',
          numero_transaccion: String(c.numero_transaccion || `COMP-${c.id}`),
          seed: extractSeed(c.numero_transaccion),
          evento: pickEvent(c.evento)
        })),
        ...productos.map((c: any) => ({
          source: 'productos' as const,
          id: c.id,
          cliente_id: c.cliente_id,
          evento_id: c.evento_id,
          fecha_compra: c.fecha_compra,
          total: Number(c.total || 0),
          estado_pago: c.estado_pago || 'completado',
          numero_transaccion: String(c.numero_pedido || `PROD-${c.id}`),
          seed: extractSeed(c.numero_pedido),
          evento: pickEvent(c.evento)
        }))
      ];

      const merged: any[] = [];
      const sorted = [...rows].sort((a, b) => normalizarFecha(b.fecha_compra) - normalizarFecha(a.fecha_compra));
      const used = new Array(sorted.length).fill(false);
      const mergeWindowMs = 2 * 60 * 1000; // 2 minutos

      for (let i = 0; i < sorted.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const base = sorted[i];
        const arr = [base];
        const baseTs = normalizarFecha(base.fecha_compra);
        const baseCliente = Number(base.cliente_id || 0);
        const baseEvento = Number(base.evento_id || 0);

        for (let j = i + 1; j < sorted.length; j++) {
          if (used[j]) continue;
          const cand = sorted[j];
          if (Number(cand.evento_id || 0) !== baseEvento) continue;
          const candTs = normalizarFecha(cand.fecha_compra);
          const sameCliente = baseCliente > 0 && Number(cand.cliente_id || 0) === baseCliente;
          const sameTimeWindow = Math.abs(baseTs - candTs) <= mergeWindowMs;
          const sameSeedWindow =
            Number(base.seed || 0) > 0 &&
            Number(cand.seed || 0) > 0 &&
            Math.abs(Number(base.seed || 0) - Number(cand.seed || 0)) <= mergeWindowMs;
          if (!((sameCliente && sameTimeWindow) || sameSeedWindow)) continue;
          used[j] = true;
          arr.push(cand);
        }

        const hasVentas = arr.some((r) => r.source === 'ventas');
        const hasProductos = arr.some((r) => r.source === 'productos');
        const latest = [...arr].sort((a, b) => normalizarFecha(b.fecha_compra) - normalizarFecha(a.fecha_compra))[0];
        if (hasVentas && hasProductos) {
          const ventaBase = arr.find((r) => r.source === 'ventas') || latest;
          merged.push({
            ...latest,
            numero_transaccion: ventaBase.numero_transaccion || latest.numero_transaccion,
            total: arr.reduce((sum, r) => sum + Number(r.total || 0), 0),
            tipo_venta: 'mixta'
          });
        } else {
          merged.push({
            ...latest,
            tipo_venta: hasProductos ? 'productos' : 'ventas'
          });
        }
      }

      return merged
        .filter((v) => !(Number(v.cliente_id) === 5 && Number(v.total || 0) === 0))
        .sort((a, b) => normalizarFecha(b.fecha_compra) - normalizarFecha(a.fecha_compra))
        .slice(0, 5);
    }, []);

    // Eventos próximos del organizador (próximos 5)
    const eventosProximos = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('eventos')
        .select('*')
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .gte('fecha_inicio', now)
        .order('fecha_inicio', { ascending: true })
        .limit(5), 'id');
      
      if (response.error) {
        console.error('Error en eventos próximos:', response.error);
        return [];
      }
      return response.data || [];
    }, []);

    // Eventos totales del organizador
    const eventosTotales = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('organizador_id', organizadorId), 'id');
      
      return response.error ? 0 : (response.count || 0);
    }, 0);

    // Ingresos mes actual
    const ingresosMesActual = safeExecute(async () => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', inicioMes.toISOString()));
      
      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Ingresos mes anterior
    const ingresosMesAnterior = safeExecute(async () => {
      const inicioMesAnterior = new Date();
      inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
      inicioMesAnterior.setDate(1);
      inicioMesAnterior.setHours(0, 0, 0, 0);
      
      const finMesAnterior = new Date();
      finMesAnterior.setDate(0);
      finMesAnterior.setHours(23, 59, 59, 999);
      
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', inicioMesAnterior.toISOString())
        .lte('fecha_compra', finMesAnterior.toISOString()));
      
      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    const ingresosDiaActual = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', DateTimeUtil.dayStartDaysAgo(0))
        .lte('fecha_compra', DateTimeUtil.dayEndDaysAgo(0)));

      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    const ingresosDiaAnterior = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', DateTimeUtil.dayStartDaysAgo(1))
        .lte('fecha_compra', DateTimeUtil.dayEndDaysAgo(1)));

      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Boletas por estado del organizador (solo con pago completado)
    const boletasPorEstado = safeExecute(async () => {
      try {
        // Obtener tipos de boleta de eventos del organizador
        const { data: tiposData, error: tiposError } = await withEventFilter(this.supabase
          .from('tipos_boleta')
          .select('id, evento_id, eventos!inner(organizador_id)')
          .eq('eventos.organizador_id', organizadorId));

        if (tiposError || !tiposData || tiposData.length === 0) {
          return [];
        }

        const tiposIds = tiposData.map((t: any) => t.id);
        
        // Obtener boletas compradas (solo con pago completado)
        const { data, error } = await this.supabase
          .from('boletas_compradas')
          .select('estado, compras!inner(estado_pago)')
          .in('tipo_boleta_id', tiposIds)
          .eq('compras.estado_pago', 'completado');

        if (error) return [];
        if (data) {
          const estados: { [key: string]: number } = {};
          data.forEach((boleta: any) => {
            const estado = boleta.estado || 'pendiente';
            estados[estado] = (estados[estado] || 0) + 1;
          });
          return Object.entries(estados).map(([estado, cantidad]) => ({ estado, cantidad }));
        }
        return [];
      } catch (error) {
        return [];
      }
    }, []);

    // Top eventos del organizador (por boletas vendidas)
    const topEventos = safeExecute(async () => {
      try {
        // Obtener eventos del organizador
        const { data: eventosData, error: eventosError } = await withEventFilter(this.supabase
          .from('eventos')
          .select('id, titulo, imagen_principal')
          .eq('organizador_id', organizadorId)
          .eq('activo', true), 'id');

        if (eventosError || !eventosData || eventosData.length === 0) {
          return [];
        }

        // Para cada evento, contar boletas vendidas
        const eventosConVentas = await Promise.all(
          eventosData.map(async (evento: any) => {
            // Obtener tipos de boleta del evento
            const { data: tiposData } = await this.supabase
              .from('tipos_boleta')
              .select('id')
              .eq('evento_id', evento.id);

            if (!tiposData || tiposData.length === 0) {
              return { ...evento, boletas_vendidas: 0 };
            }

            const tiposIds = tiposData.map((t: any) => t.id);
            
            // Contar boletas vendidas (solo con pago completado)
            const { count } = await this.supabase
              .from('boletas_compradas')
              .select('*, compras!inner(estado_pago)', { count: 'exact' })
              .in('tipo_boleta_id', tiposIds)
              .eq('compras.estado_pago', 'completado');

            return {
              ...evento,
              boletas_vendidas: count || 0
            };
          })
        );

        // Ordenar por boletas vendidas y tomar top 5
        eventosConVentas.sort((a: any, b: any) => b.boletas_vendidas - a.boletas_vendidas);
        return eventosConVentas.slice(0, 5);
      } catch (error: any) {
        console.error('Error en top eventos:', error);
        return [];
      }
    }, []);

    // Ejecutar todas las consultas en paralelo
    const [
      eventos_activos,
      boletas_vendidas,
      productos_vendidos,
      pedidos_productos,
      tiene_productos,
      ingresos_agg,
      ingresos_productos_agg,
      clientes_count,
      ventas_recientes,
      eventos_proximos,
      eventos_totales,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      ingresos_dia_actual,
      ingresos_dia_anterior,
      boletas_por_estado,
      top_eventos
    ] = await Promise.all([
      eventosActivos,
      boletasVendidas,
      productosVendidos,
      pedidosProductos,
      tieneProductos,
      ingresosYServicioTotales,
      ingresosYServicioProductos,
      clientes,
      ventasRecientes,
      eventosProximos,
      eventosTotales,
      ingresosMesActual,
      ingresosMesAnterior,
      ingresosDiaActual,
      ingresosDiaAnterior,
      boletasPorEstado,
      topEventos
    ]);

    return {
      eventos_activos,
      boletas_vendidas,
      productos_vendidos,
      pedidos_productos,
      tiene_productos,
      ingresos_totales: ingresos_agg.ingresos,
      ingresos_productos_totales: ingresos_productos_agg.ingresos,
      clientes: clientes_count,
      ventas_recientes: ventas_recientes as any[],
      eventos_proximos: eventos_proximos as any[],
      eventos_totales,
      categorias_activas: 0,
      lugares_activos: 0,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      ingresos_dia_actual,
      ingresos_dia_anterior,
      porcentaje_servicio_promedio: ingresos_agg.porcentajeServicioPromedio,
      valor_servicio_total: ingresos_agg.valorServicioTotal,
      porcentaje_servicio_productos_promedio: ingresos_productos_agg.porcentajeServicioPromedio,
      valor_servicio_productos_total: ingresos_productos_agg.valorServicioTotal,
      ingresos_ventas_bruto_total: ingresos_agg.ingresosVentasBrutoTotal,
      ingresos_productos_bruto_total: ingresos_productos_agg.ingresosVentasBrutoTotal,
      wompi_total_estimado: ingresos_agg.wompiTotalEstimado,
      wompi_productos_total_estimado: ingresos_productos_agg.wompiTotalEstimado,
      wompi_ventas_total: ingresos_agg.wompiVentasTotal,
      wompi_productos_ventas_total: ingresos_productos_agg.wompiVentasTotal,
      wompi_servicio_total: ingresos_agg.wompiServicioTotal,
      wompi_productos_servicio_total: ingresos_productos_agg.wompiServicioTotal,
      neto_ventas_post_wompi_total: ingresos_agg.netoVentasPostWompiTotal,
      neto_productos_ventas_post_wompi_total: ingresos_productos_agg.netoVentasPostWompiTotal,
      neto_servicio_post_wompi_total: ingresos_agg.netoServicioPostWompiTotal,
      neto_productos_servicio_post_wompi_total: ingresos_productos_agg.netoServicioPostWompiTotal,
      neto_total_post_wompi_total: ingresos_agg.ingresos - ingresos_agg.wompiTotalEstimado,
      neto_productos_total_post_wompi_total:
        ingresos_productos_agg.ingresos - ingresos_productos_agg.wompiTotalEstimado,
      boletas_por_estado: boletas_por_estado as any[],
      top_eventos: top_eventos as any[]
    };
  }
}

