/* ============================================
   DASHBOARD ORGANIZADOR SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
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
  getStats(organizadorId: number): Observable<DashboardStats> {
    const now = new Date().toISOString();

    // Eventos activos del organizador
    const eventosActivos$ = from(
      this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .eq('estado', 'publicado')
        .gte('fecha_fin', now)
    ).pipe(
      map(({ count, error }) => {
        if (error) {
          console.error('Error en eventos activos:', error);
          return 0;
        }
        return count || 0;
      }),
      catchError(() => of(0))
    );

    // Boletas vendidas de eventos del organizador
    const boletasVendidas$ = from(
      (async () => {
        try {
          // Obtener todos los tipos de boleta de eventos del organizador
          const { data: tiposData, error: tiposError } = await this.supabase
            .from('tipos_boleta')
            .select('id, evento_id, eventos!inner(organizador_id)')
            .eq('eventos.organizador_id', organizadorId);

          if (tiposError || !tiposData || tiposData.length === 0) {
            return 0;
          }

          const tiposIds = tiposData.map(t => t.id);
          
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
      })()
    ).pipe(
      catchError(() => of(0))
    );

    // Ingresos totales del organizador
    const ingresosTotales$ = from(
      this.supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error en ingresos totales:', error);
          return 0;
        }
        if (data) {
          return data.reduce((sum, compra) => sum + Number(compra.total || 0), 0);
        }
        return 0;
      }),
      catchError(() => of(0))
    );

    // Clientes únicos que compraron eventos del organizador
    const clientes$ = from(
      this.supabase
        .from('compras')
        .select('cliente_id, evento_id, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error en clientes:', error);
          return 0;
        }
        if (data) {
          const uniqueClients = new Set(data.map((c) => c.cliente_id));
          return uniqueClients.size;
        }
        return 0;
      }),
      catchError(() => of(0))
    );

    // Ventas recientes del organizador (últimas 5)
    const ventasRecientes$ = from(
      this.supabase
        .from('compras')
        .select('*, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
        .order('fecha_compra', { ascending: false })
        .limit(5)
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error en ventas recientes:', error);
          return [];
        }
        return data || [];
      }),
      catchError(() => of([]))
    );

    // Eventos próximos del organizador (próximos 5)
    const eventosProximos$ = from(
      this.supabase
        .from('eventos')
        .select('*')
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .gte('fecha_inicio', now)
        .order('fecha_inicio', { ascending: true })
        .limit(5)
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error en eventos próximos:', error);
          return [];
        }
        return data || [];
      }),
      catchError(() => of([]))
    );

    // Eventos totales del organizador
    const eventosTotales$ = from(
      this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('organizador_id', organizadorId)
    ).pipe(
      map(({ count, error }) => error ? 0 : (count || 0)),
      catchError(() => of(0))
    );

    // Ingresos mes actual
    const ingresosMesActual$ = (() => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      return from(
        this.supabase
          .from('compras')
          .select('total, evento_id, eventos!inner(organizador_id)')
          .eq('estado_pago', 'completado')
          .eq('eventos.organizador_id', organizadorId)
          .gte('fecha_compra', inicioMes.toISOString())
      ).pipe(
        map(({ data, error }) => {
          if (error) return 0;
          if (data) {
            return data.reduce((sum, compra) => sum + Number(compra.total || 0), 0);
          }
          return 0;
        }),
        catchError(() => of(0))
      );
    })();

    // Ingresos mes anterior
    const ingresosMesAnterior$ = (() => {
      const inicioMesAnterior = new Date();
      inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
      inicioMesAnterior.setDate(1);
      inicioMesAnterior.setHours(0, 0, 0, 0);
      
      const finMesAnterior = new Date();
      finMesAnterior.setDate(0);
      finMesAnterior.setHours(23, 59, 59, 999);
      
      return from(
        this.supabase
          .from('compras')
          .select('total, evento_id, eventos!inner(organizador_id)')
          .eq('estado_pago', 'completado')
          .eq('eventos.organizador_id', organizadorId)
          .gte('fecha_compra', inicioMesAnterior.toISOString())
          .lte('fecha_compra', finMesAnterior.toISOString())
      ).pipe(
        map(({ data, error }) => {
          if (error) return 0;
          if (data) {
            return data.reduce((sum, compra) => sum + Number(compra.total || 0), 0);
          }
          return 0;
        }),
        catchError(() => of(0))
      );
    })();

    // Boletas por estado del organizador
    const boletasPorEstado$ = from(
      (async () => {
        try {
          // Obtener tipos de boleta de eventos del organizador
          const { data: tiposData, error: tiposError } = await this.supabase
            .from('tipos_boleta')
            .select('id, evento_id, eventos!inner(organizador_id)')
            .eq('eventos.organizador_id', organizadorId);

          if (tiposError || !tiposData || tiposData.length === 0) {
            return [];
          }

          const tiposIds = tiposData.map(t => t.id);
          
          // Obtener boletas compradas
          const { data, error } = await this.supabase
            .from('boletas_compradas')
            .select('estado')
            .in('tipo_boleta_id', tiposIds);

          if (error) return [];
          if (data) {
            const estados: { [key: string]: number } = {};
            data.forEach(boleta => {
              const estado = boleta.estado || 'pendiente';
              estados[estado] = (estados[estado] || 0) + 1;
            });
            return Object.entries(estados).map(([estado, cantidad]) => ({ estado, cantidad }));
          }
          return [];
        } catch (error) {
          return [];
        }
      })()
    ).pipe(
      catchError(() => of([]))
    );

    // Top eventos del organizador (por boletas vendidas)
    const topEventos$ = from(
      (async () => {
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
            eventosData.map(async (evento) => {
              // Obtener tipos de boleta del evento
              const { data: tiposData } = await this.supabase
                .from('tipos_boleta')
                .select('id')
                .eq('evento_id', evento.id);

              if (!tiposData || tiposData.length === 0) {
                return { ...evento, boletas_vendidas: 0 };
              }

              const tiposIds = tiposData.map(t => t.id);
              
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
          eventosConVentas.sort((a, b) => b.boletas_vendidas - a.boletas_vendidas);
          return eventosConVentas.slice(0, 5);
        } catch (error: any) {
          console.error('Error en top eventos:', error);
          return [];
        }
      })()
    ).pipe(
      catchError(() => of([]))
    );

    return forkJoin({
      eventos_activos: eventosActivos$,
      boletas_vendidas: boletasVendidas$,
      ingresos_totales: ingresosTotales$,
      clientes: clientes$,
      ventas_recientes: ventasRecientes$,
      eventos_proximos: eventosProximos$,
      eventos_totales: eventosTotales$,
      categorias_activas: of(0), // No aplica para organizador
      lugares_activos: of(0), // No aplica para organizador
      ingresos_mes_actual: ingresosMesActual$,
      ingresos_mes_anterior: ingresosMesAnterior$,
      boletas_por_estado: boletasPorEstado$,
      top_eventos: topEventos$
    });
  }
}

