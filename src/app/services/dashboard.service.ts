/* ============================================
   DASHBOARD SERVICE
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
export class DashboardService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Obtiene las estadísticas del dashboard
   */
  async getStats(eventoId?: number): Promise<DashboardStats> {
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

    // Eventos activos: publicados, flag activo, y aún vigentes (sin fecha_fin o fecha_fin >= ahora).
    // Se divide en dos conteos para evitar NULL en comparaciones y alinearse con la zona horaria de la app.
    const eventosActivos = safeExecute(async () => {
      const base = () =>
        withEventFilter(
          this.supabase
          .from('eventos')
          .select('id', { count: 'exact', head: true })
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

    // Boletas vendidas (solo con pago completado)
    const boletasVendidas = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('boletas_compradas')
        .select('*, compras!inner(estado_pago, evento_id)', { count: 'exact' })
        .eq('compras.estado_pago', 'completado'), 'compras.evento_id');
      
      if (response.error) {
        console.error('Error en boletas vendidas:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Unidades de productos vendidas (solo pago completado)
    const productosVendidos = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras_productos_items')
        .select('cantidad, compra:compras_productos!inner(estado_pago, evento_id)')
        .eq('compra.estado_pago', 'completado'), 'compra.evento_id');

      if (response.error) {
        console.error('Error en productos vendidos:', response.error);
        return 0;
      }
      if (!Array.isArray(response.data)) return 0;
      return response.data.reduce((sum: number, item: any) => sum + Number(item.cantidad || 0), 0);
    }, 0);

    // Pedidos de productos completados
    const pedidosProductos = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras_productos')
        .select('id', { count: 'exact', head: true })
        .eq('estado_pago', 'completado'));

      if (response.error) {
        console.error('Error en pedidos de productos:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Disponibilidad de productos configurados en el alcance actual
    const tieneProductos = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true));

      if (response.error) {
        console.error('Error validando productos configurados:', response.error);
        return false;
      }
      return (response.count || 0) > 0;
    }, false);

    // Ingresos y servicio totales
    const ingresosYServicioTotalesPromise = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total, porcentaje_servicio, valor_servicio')
        .eq('estado_pago', 'completado'));
      
      if (response.error) {
        console.error('Error en ingresos totales:', response.error);
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

    // Ingresos y servicio de compras de productos
    const ingresosYServicioProductosPromise = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras_productos')
        .select('total, porcentaje_servicio, valor_servicio')
        .eq('estado_pago', 'completado'));

      if (response.error) {
        console.error('Error en ingresos de productos:', response.error);
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

    // Clientes únicos (solo con pago completado)
    const clientes = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('cliente_id')
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

    // Ventas recientes (últimas 5, solo con pago completado)
    const ventasRecientes = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('*, evento:eventos(id, titulo)')
        .eq('estado_pago', 'completado')
        .order('fecha_compra', { ascending: false })
        .limit(5));
      
      if (response.error) {
        console.error('Error en ventas recientes:', response.error);
        return [];
      }
      return response.data || [];
    }, []);

    // Eventos próximos (próximos 5)
    const eventosProximos = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('eventos')
        .select('*')
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

    // Eventos totales
    const eventosTotales = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('eventos')
        .select('*', { count: 'exact' }), 'id');
      
      return response.error ? 0 : (response.count || 0);
    }, 0);

    // Categorías activas
    const categoriasActivas = safeExecute(async () => {
      const response = await this.supabase
        .from('categorias_evento')
        .select('*', { count: 'exact' })
        .eq('activo', true);
      
      return response.error ? 0 : (response.count || 0);
    }, 0);

    // Lugares activos
    const lugaresActivos = safeExecute(async () => {
      const response = await this.supabase
        .from('lugares')
        .select('*', { count: 'exact' })
        .eq('activo', true);
      
      return response.error ? 0 : (response.count || 0);
    }, 0);

    // Ingresos mes actual
    const ingresosMesActual = safeExecute(async () => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      const response = await withEventFilter(this.supabase
        .from('compras')
        .select('total')
        .eq('estado_pago', 'completado')
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
        .select('total')
        .eq('estado_pago', 'completado')
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
        .select('total')
        .eq('estado_pago', 'completado')
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
        .select('total')
        .eq('estado_pago', 'completado')
        .gte('fecha_compra', DateTimeUtil.dayStartDaysAgo(1))
        .lte('fecha_compra', DateTimeUtil.dayEndDaysAgo(1)));

      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Boletas por estado (solo con pago completado)
    const boletasPorEstado = safeExecute(async () => {
      const response = await withEventFilter(this.supabase
        .from('boletas_compradas')
        .select('estado, compras!inner(estado_pago, evento_id)')
        .eq('compras.estado_pago', 'completado'), 'compras.evento_id');
      
      if (response.error) return [];
      if (response.data) {
        const estados: { [key: string]: number } = {};
        response.data.forEach((boleta: any) => {
          const estado = boleta.estado || 'pendiente';
          estados[estado] = (estados[estado] || 0) + 1;
        });
        return Object.entries(estados).map(([estado, cantidad]) => ({ estado, cantidad }));
      }
      return [];
    }, []);

    // Top eventos (por boletas vendidas con pago completado)
    const topEventos = safeExecute(async () => {
      try {
        if (eventoId) {
          const [{ data: eventoData, error: eventoError }, { count, error: countError }] = await Promise.all([
            this.supabase
              .from('eventos')
              .select('id, titulo, imagen_principal')
              .eq('id', eventoId)
              .maybeSingle(),
            this.supabase
              .from('boletas_compradas')
              .select('id, compras!inner(estado_pago, evento_id)', { count: 'exact', head: true })
              .eq('compras.estado_pago', 'completado')
              .eq('compras.evento_id', eventoId)
          ]);

          if (eventoError || !eventoData || countError) {
            return [];
          }
          return [{
            ...eventoData,
            boletas_vendidas: count || 0
          }];
        }

        // Obtener boletas compradas con información del tipo de boleta, evento y compra (solo con pago completado)
        const { data: boletasData, error: boletasError } = await this.supabase
          .from('boletas_compradas')
          .select('tipo_boleta_id, tipos_boleta!inner(evento_id), compras!inner(estado_pago)')
          .eq('compras.estado_pago', 'completado');
        
        if (boletasError || !boletasData) {
          return [];
        }

        // Contar boletas por evento
        const ventasPorEvento: { [key: number]: number } = {};
        boletasData.forEach((boleta: any) => {
          const eventoId = boleta.tipos_boleta?.evento_id;
          if (eventoId) {
            ventasPorEvento[eventoId] = (ventasPorEvento[eventoId] || 0) + 1;
          }
        });

        // Obtener top 5 eventos
        const eventosIds = Object.entries(ventasPorEvento)
          .map(([id, ventas]) => ({ id: Number(id), ventas: ventas as number }))
          .sort((a, b) => b.ventas - a.ventas)
          .slice(0, 5)
          .map(e => e.id);

        if (eventosIds.length === 0) {
          return [];
        }

        const { data: eventosData, error: eventosError } = await this.supabase
          .from('eventos')
          .select('id, titulo, imagen_principal')
          .in('id', eventosIds);

        if (eventosError || !eventosData) {
          return [];
        }

        return eventosData.map(evento => ({
          ...evento,
          boletas_vendidas: ventasPorEvento[evento.id] || 0
        })).sort((a, b) => b.boletas_vendidas - a.boletas_vendidas);
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
      ingresosYServicioTotales,
      ingresosYServicioProductos,
      clientes_count,
      ventas_recientes,
      eventos_proximos,
      eventos_totales,
      categorias_activas,
      lugares_activos,
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
      ingresosYServicioTotalesPromise,
      ingresosYServicioProductosPromise,
      clientes,
      ventasRecientes,
      eventosProximos,
      eventosTotales,
      categoriasActivas,
      lugaresActivos,
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
      ingresos_totales: ingresosYServicioTotales.ingresos,
      ingresos_productos_totales: ingresosYServicioProductos.ingresos,
      clientes: clientes_count,
      ventas_recientes: ventas_recientes as any[],
      eventos_proximos: eventos_proximos as any[],
      eventos_totales,
      categorias_activas,
      lugares_activos,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      ingresos_dia_actual,
      ingresos_dia_anterior,
      porcentaje_servicio_promedio: ingresosYServicioTotales.porcentajeServicioPromedio,
      valor_servicio_total: ingresosYServicioTotales.valorServicioTotal,
      porcentaje_servicio_productos_promedio: ingresosYServicioProductos.porcentajeServicioPromedio,
      valor_servicio_productos_total: ingresosYServicioProductos.valorServicioTotal,
      ingresos_ventas_bruto_total: ingresosYServicioTotales.ingresosVentasBrutoTotal,
      ingresos_productos_bruto_total: ingresosYServicioProductos.ingresosVentasBrutoTotal,
      wompi_total_estimado: ingresosYServicioTotales.wompiTotalEstimado,
      wompi_productos_total_estimado: ingresosYServicioProductos.wompiTotalEstimado,
      wompi_ventas_total: ingresosYServicioTotales.wompiVentasTotal,
      wompi_productos_ventas_total: ingresosYServicioProductos.wompiVentasTotal,
      wompi_servicio_total: ingresosYServicioTotales.wompiServicioTotal,
      wompi_productos_servicio_total: ingresosYServicioProductos.wompiServicioTotal,
      neto_ventas_post_wompi_total: ingresosYServicioTotales.netoVentasPostWompiTotal,
      neto_productos_ventas_post_wompi_total: ingresosYServicioProductos.netoVentasPostWompiTotal,
      neto_servicio_post_wompi_total: ingresosYServicioTotales.netoServicioPostWompiTotal,
      neto_productos_servicio_post_wompi_total: ingresosYServicioProductos.netoServicioPostWompiTotal,
      neto_total_post_wompi_total:
        ingresosYServicioTotales.ingresos - ingresosYServicioTotales.wompiTotalEstimado,
      neto_productos_total_post_wompi_total:
        ingresosYServicioProductos.ingresos - ingresosYServicioProductos.wompiTotalEstimado,
      boletas_por_estado: boletas_por_estado as any[],
      top_eventos: top_eventos as any[]
    };
  }
}
