/* ============================================
   DASHBOARD ORGANIZADOR SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { DashboardStats } from '../types';

@Injectable({
  providedIn: 'root'
})
export class DashboardOrganizadorService {
  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Obtiene las estadísticas del dashboard para un organizador específico
   */
  async getStats(organizadorId: number): Promise<DashboardStats> {
    const now = new Date().toISOString();

    // Función helper para manejar errores
    const safeExecute = async <T>(fn: () => Promise<T>, defaultValue: T): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        console.error('Error en consulta:', error);
        return defaultValue;
      }
    };

    // Eventos activos del organizador
    const eventosActivos = safeExecute(async () => {
      const response = await this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .eq('estado', 'publicado')
        .gte('fecha_fin', now);
      
      if (response.error) {
        console.error('Error en eventos activos:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Boletas vendidas de eventos del organizador
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
        
        // Contar boletas compradas de esos tipos
        const { count, error } = await this.supabase
          .from('boletas_compradas')
          .select('*', { count: 'exact' })
          .in('tipo_boleta_id', tiposIds);

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

    // Ingresos totales del organizador
    const ingresosTotales = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId);
      
      if (response.error) {
        console.error('Error en ingresos totales:', response.error);
        return 0;
      }
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Clientes únicos que compraron eventos del organizador
    const clientes = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('cliente_id, evento_id, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId);
      
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

    // Ventas recientes del organizador (últimas 5)
    const ventasRecientes = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('*, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
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

    // Boletas por estado del organizador
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
        
        // Obtener boletas compradas
        const { data, error } = await this.supabase
          .from('boletas_compradas')
          .select('estado')
          .in('tipo_boleta_id', tiposIds);

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
            
            // Contar boletas vendidas
            const { count } = await this.supabase
              .from('boletas_compradas')
              .select('*', { count: 'exact' })
              .in('tipo_boleta_id', tiposIds);

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
      ingresos_totales,
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
      ingresosTotales,
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
      ingresos_totales,
      clientes: clientes_count,
      ventas_recientes: ventas_recientes as any[],
      eventos_proximos: eventos_proximos as any[],
      eventos_totales,
      categorias_activas: 0, // No aplica para organizador
      lugares_activos: 0, // No aplica para organizador
      ingresos_mes_actual,
      ingresos_mes_anterior,
      boletas_por_estado: boletas_por_estado as any[],
      top_eventos: top_eventos as any[]
    };
  }
}

