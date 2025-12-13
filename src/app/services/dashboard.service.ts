/* ============================================
   DASHBOARD SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { SupabaseObservableHelper } from './supabase-observable.helper';
import { DashboardStats } from '../types';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  constructor(
    private supabase: SupabaseService,
    private supabaseHelper: SupabaseObservableHelper
  ) {}

  /**
   * Obtiene las estadísticas del dashboard
   */
  getStats(): Observable<DashboardStats> {
    const now = new Date().toISOString();

    // Eventos activos
    const eventosActivos$ = this.supabaseHelper.fromSupabase(
      this.supabase
            .from('eventos')
            .select('*', { count: 'exact' })
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

    // Boletas vendidas
    const boletasVendidas$ = this.supabaseHelper.fromSupabase(
      this.supabase
            .from('boletas_compradas')
        .select('*', { count: 'exact' })
    ).pipe(
      map(({ count, error }) => {
            if (error) {
              console.error('Error en boletas vendidas:', error);
          return 0;
        }
        return count || 0;
      }),
      catchError(() => of(0))
    );

    // Ingresos totales
    const ingresosTotales$ = this.supabaseHelper.fromSupabase(
      this.supabase
            .from('compras')
            .select('total')
        .eq('estado_pago', 'completado')
    ).pipe(
      map(({ data, error }) => {
            if (error) {
              console.error('Error en ingresos totales:', error);
          return 0;
        }
        if (data && Array.isArray(data)) {
          return (data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
            }
        return 0;
      }),
      catchError(() => of(0))
    );

    // Clientes únicos
    const clientes$ = this.supabaseHelper.fromSupabase(
      this.supabase
            .from('compras')
        .select('cliente_id')
    ).pipe(
      map(({ data, error }) => {
            if (error) {
              console.error('Error en clientes:', error);
          return 0;
        }
        if (data && Array.isArray(data)) {
              const uniqueClients = new Set((data as any[]).map((c: any) => c.cliente_id));
          return uniqueClients.size;
            }
        return 0;
      }),
      catchError(() => of(0))
    );

    // Ventas recientes (últimas 5)
    const ventasRecientes$ = this.supabaseHelper.fromSupabase(
      this.supabase
            .from('compras')
            .select('*')
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

    // Eventos próximos (próximos 5)
    const eventosProximos$ = this.supabaseHelper.fromSupabase(
      this.supabase
            .from('eventos')
            .select('*')
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

    // Eventos totales
    const eventosTotales$ = this.supabaseHelper.fromSupabase(
      this.supabase
        .from('eventos')
        .select('*', { count: 'exact' })
    ).pipe(
      map(({ count, error }) => error ? 0 : (count || 0)),
      catchError(() => of(0))
    );

    // Categorías activas
    const categoriasActivas$ = this.supabaseHelper.fromSupabase(
      this.supabase
        .from('categorias_evento')
        .select('*', { count: 'exact' })
        .eq('activo', true)
    ).pipe(
      map(({ count, error }) => error ? 0 : (count || 0)),
      catchError(() => of(0))
    );

    // Lugares activos
    const lugaresActivos$ = this.supabaseHelper.fromSupabase(
      this.supabase
        .from('lugares')
        .select('*', { count: 'exact' })
        .eq('activo', true)
    ).pipe(
      map(({ count, error }) => error ? 0 : (count || 0)),
      catchError(() => of(0))
    );

    // Ingresos mes actual
    const ingresosMesActual$ = (() => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      return this.supabaseHelper.fromSupabase(
        this.supabase
          .from('compras')
          .select('total')
          .eq('estado_pago', 'completado')
          .gte('fecha_compra', inicioMes.toISOString())
      ).pipe(
        map(({ data, error }) => {
          if (error) return 0;
          if (data && Array.isArray(data)) {
            return (data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
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
      
      return this.supabaseHelper.fromSupabase(
        this.supabase
          .from('compras')
          .select('total')
          .eq('estado_pago', 'completado')
          .gte('fecha_compra', inicioMesAnterior.toISOString())
          .lte('fecha_compra', finMesAnterior.toISOString())
      ).pipe(
        map(({ data, error }) => {
          if (error) return 0;
          if (data && Array.isArray(data)) {
            return (data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
          }
          return 0;
        }),
        catchError(() => of(0))
      );
    })();

    // Boletas por estado
    const boletasPorEstado$ = from(
      this.supabase
        .from('boletas_compradas')
        .select('estado')
    ).pipe(
      map(({ data, error }) => {
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
      }),
      catchError(() => of([]))
    );

    // Top eventos (por boletas vendidas)
    const topEventos$ = from(
      (async () => {
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
      categorias_activas: categoriasActivas$,
      lugares_activos: lugaresActivos$,
      ingresos_mes_actual: ingresosMesActual$,
      ingresos_mes_anterior: ingresosMesAnterior$,
      boletas_por_estado: boletasPorEstado$,
      top_eventos: topEventos$
    });
  }
}
