/* ============================================
   DASHBOARD ORGANIZADOR SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { DashboardStats } from '../types';
import { agregarFinanzasDesdeComprasCompletadas } from '../utils/wompi-finanzas';

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
  async getStats(organizadorId: number): Promise<DashboardStats> {
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

    // Eventos activos del organizador (misma regla que dashboard admin)
    const eventosActivos = safeExecute(async () => {
      const base = () =>
        this.supabase
          .from('eventos')
          .select('id', { count: 'exact', head: true })
          .eq('organizador_id', organizadorId)
          .eq('activo', true)
          .eq('estado', 'publicado');

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
        const { data: tiposData, error: tiposError } = await this.supabase
          .from('tipos_boleta')
          .select('id, evento_id, eventos!inner(organizador_id)')
          .eq('eventos.organizador_id', organizadorId);

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

    // Ingresos, servicio y estimación Wompi (misma lógica que dashboard admin)
    const ingresosYServicioTotales = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('total, valor_servicio, porcentaje_servicio, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId);

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

    // Clientes únicos que compraron eventos del organizador (solo con pago completado)
    const clientes = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('cliente_id, evento_id, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
        .eq('estado_pago', 'completado');
      
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

    // Ventas recientes del organizador (últimas 5, solo con pago completado)
    const ventasRecientes = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('*, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
        .eq('estado_pago', 'completado')
        .order('fecha_compra', { ascending: false })
        .limit(5);
      
      if (response.error) {
        console.error('Error en ventas recientes:', response.error);
        return [];
      }
      return response.data || [];
    }, []);

    // Eventos próximos del organizador (próximos 5)
    const eventosProximos = safeExecute(async () => {
      const response = await this.supabase
        .from('eventos')
        .select('*')
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .gte('fecha_inicio', now)
        .order('fecha_inicio', { ascending: true })
        .limit(5);
      
      if (response.error) {
        console.error('Error en eventos próximos:', response.error);
        return [];
      }
      return response.data || [];
    }, []);

    // Eventos totales del organizador
    const eventosTotales = safeExecute(async () => {
      const response = await this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('organizador_id', organizadorId);
      
      return response.error ? 0 : (response.count || 0);
    }, 0);

    // Ingresos mes actual
    const ingresosMesActual = safeExecute(async () => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      const response = await this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', inicioMes.toISOString());
      
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
      
      const response = await this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', inicioMesAnterior.toISOString())
        .lte('fecha_compra', finMesAnterior.toISOString());
      
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
        const { data: tiposData, error: tiposError } = await this.supabase
          .from('tipos_boleta')
          .select('id, evento_id, eventos!inner(organizador_id)')
          .eq('eventos.organizador_id', organizadorId);

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
        const { data: eventosData, error: eventosError } = await this.supabase
          .from('eventos')
          .select('id, titulo, imagen_principal')
          .eq('organizador_id', organizadorId)
          .eq('activo', true);

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
      ingresos_agg,
      clientes_count,
      ventas_recientes,
      eventos_proximos,
      eventos_totales,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      boletas_por_estado,
      top_eventos
    ] = await Promise.all([
      eventosActivos,
      boletasVendidas,
      ingresosYServicioTotales,
      clientes,
      ventasRecientes,
      eventosProximos,
      eventosTotales,
      ingresosMesActual,
      ingresosMesAnterior,
      boletasPorEstado,
      topEventos
    ]);

    return {
      eventos_activos,
      boletas_vendidas,
      ingresos_totales: ingresos_agg.ingresos,
      clientes: clientes_count,
      ventas_recientes: ventas_recientes as any[],
      eventos_proximos: eventos_proximos as any[],
      eventos_totales,
      categorias_activas: 0,
      lugares_activos: 0,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      porcentaje_servicio_promedio: ingresos_agg.porcentajeServicioPromedio,
      valor_servicio_total: ingresos_agg.valorServicioTotal,
      ingresos_ventas_bruto_total: ingresos_agg.ingresosVentasBrutoTotal,
      wompi_total_estimado: ingresos_agg.wompiTotalEstimado,
      wompi_ventas_total: ingresos_agg.wompiVentasTotal,
      wompi_servicio_total: ingresos_agg.wompiServicioTotal,
      neto_ventas_post_wompi_total: ingresos_agg.netoVentasPostWompiTotal,
      neto_servicio_post_wompi_total: ingresos_agg.netoServicioPostWompiTotal,
      neto_total_post_wompi_total: ingresos_agg.ingresos - ingresos_agg.wompiTotalEstimado,
      boletas_por_estado: boletas_por_estado as any[],
      top_eventos: top_eventos as any[]
    };
  }
}

