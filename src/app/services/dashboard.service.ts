/* ============================================
   DASHBOARD SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { DashboardStats } from '../types';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Obtiene las estadísticas del dashboard
   */
  async getStats(): Promise<DashboardStats> {
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

    // Eventos activos
    const eventosActivos = safeExecute(async () => {
      const response = await this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('activo', true)
        .eq('estado', 'publicado')
        .gte('fecha_fin', now);
      
      if (response.error) {
        console.error('Error en eventos activos:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Boletas vendidas
    const boletasVendidas = safeExecute(async () => {
      const response = await this.supabase
        .from('boletas_compradas')
        .select('*', { count: 'exact' });
      
      if (response.error) {
        console.error('Error en boletas vendidas:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Ingresos totales
    const ingresosTotales = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('total')
        .eq('estado_pago', 'completado');
      
      if (response.error) {
        console.error('Error en ingresos totales:', response.error);
        return 0;
      }
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Clientes únicos
    const clientes = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('cliente_id');
      
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

    // Ventas recientes (últimas 5)
    const ventasRecientes = safeExecute(async () => {
      const response = await this.supabase
        .from('compras')
        .select('*')
        .order('fecha_compra', { ascending: false })
        .limit(5);
      
      if (response.error) {
        console.error('Error en ventas recientes:', response.error);
        return [];
      }
      return response.data || [];
    }, []);

    // Eventos próximos (próximos 5)
    const eventosProximos = safeExecute(async () => {
      const response = await this.supabase
        .from('eventos')
        .select('*')
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

    // Eventos totales
    const eventosTotales = safeExecute(async () => {
      const response = await this.supabase
        .from('eventos')
        .select('*', { count: 'exact' });
      
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
      
      const response = await this.supabase
        .from('compras')
        .select('total')
        .eq('estado_pago', 'completado')
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
        .select('total')
        .eq('estado_pago', 'completado')
        .gte('fecha_compra', inicioMesAnterior.toISOString())
        .lte('fecha_compra', finMesAnterior.toISOString());
      
      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Boletas por estado
    const boletasPorEstado = safeExecute(async () => {
      const response = await this.supabase
        .from('boletas_compradas')
        .select('estado');
      
      if (response.error) return [];
      if (response.data) {
        const estados: { [key: string]: number } = {};
        response.data.forEach(boleta => {
          const estado = boleta.estado || 'pendiente';
          estados[estado] = (estados[estado] || 0) + 1;
        });
        return Object.entries(estados).map(([estado, cantidad]) => ({ estado, cantidad }));
      }
      return [];
    }, []);

    // Top eventos (por boletas vendidas)
    const topEventos = safeExecute(async () => {
      try {
        // Obtener boletas compradas con información del tipo de boleta y evento
        const { data: boletasData, error: boletasError } = await this.supabase
          .from('boletas_compradas')
          .select('tipo_boleta_id, tipos_boleta!inner(evento_id)');
        
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
      ingresos_totales,
      clientes_count,
      ventas_recientes,
      eventos_proximos,
      eventos_totales,
      categorias_activas,
      lugares_activos,
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
      categoriasActivas,
      lugaresActivos,
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
      categorias_activas,
      lugares_activos,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      boletas_por_estado: boletas_por_estado as any[],
      top_eventos: top_eventos as any[]
    };
  }
}
