/* ============================================
   REPORTES SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { SupabaseObservableHelper } from './supabase-observable.helper';

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

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  constructor(
    private supabase: SupabaseService,
    private supabaseHelper: SupabaseObservableHelper
  ) {}

  /**
   * Obtiene reporte de ventas por día en un rango de fechas
   */
  getVentasPorDia(fechaDesde?: string, fechaHasta?: string, organizadorId?: number): Observable<ReporteVentas[]> {
    return this.supabaseHelper.fromSupabase(
      (async () => {
        try {
          let query = this.supabase
            .from('compras')
            .select('id, total, fecha_compra, evento_id, eventos!inner(organizador_id)')
            .eq('estado_pago', 'completado');

          if (organizadorId) {
            query = query.eq('eventos.organizador_id', organizadorId);
          }

          if (fechaDesde) {
            query = query.gte('fecha_compra', fechaDesde);
          }
          if (fechaHasta) {
            query = query.lte('fecha_compra', fechaHasta);
          }

          const { data, error } = await query;

          if (error || !data) {
            return { data: [], error: null };
          }

          // Agrupar por día
          const ventasPorDia: { [key: string]: { ventas: number; ingresos: number; boletas: number } } = {};

          for (const compra of data) {
            const fecha = new Date(compra.fecha_compra).toISOString().split('T')[0];
            
            if (!ventasPorDia[fecha]) {
              ventasPorDia[fecha] = { ventas: 0, ingresos: 0, boletas: 0 };
            }

            ventasPorDia[fecha].ventas += 1;
            ventasPorDia[fecha].ingresos += Number(compra.total || 0);

            // Contar boletas de esta compra
            const { count } = await this.supabase
              .from('boletas_compradas')
              .select('*', { count: 'exact' })
              .eq('compra_id', compra.id);

            ventasPorDia[fecha].boletas += count || 0;
          }

          return {
            data: Object.entries(ventasPorDia)
              .map(([fecha, datos]) => ({
                fecha,
                ventas: datos.ventas,
                ingresos: datos.ingresos,
                boletas_vendidas: datos.boletas
              }))
              .sort((a, b) => a.fecha.localeCompare(b.fecha)),
            error: null
          };
        } catch (error) {
          console.error('Error en getVentasPorDia:', error);
          return { data: [], error: null };
        }
      })()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return (response.data as ReporteVentas[]) || [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene reporte de ventas por mes
   */
  getVentasPorMes(organizadorId?: number): Observable<{ mes: string; ventas: number; ingresos: number }[]> {
    return this.supabaseHelper.fromSupabase(
      (async () => {
        try {
          let query = this.supabase
            .from('compras')
            .select('total, fecha_compra, evento_id, eventos!inner(organizador_id)')
            .eq('estado_pago', 'completado');

          if (organizadorId) {
            query = query.eq('eventos.organizador_id', organizadorId);
          }

          const { data, error } = await query;

          if (error || !data) {
            return { data: [], error: null };
          }

          const ventasPorMes: { [key: string]: { ventas: number; ingresos: number } } = {};

          data.forEach(compra => {
            const fecha = new Date(compra.fecha_compra);
            const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
            const mesLabel = fecha.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });

            if (!ventasPorMes[mes]) {
              ventasPorMes[mes] = { ventas: 0, ingresos: 0 };
            }

            ventasPorMes[mes].ventas += 1;
            ventasPorMes[mes].ingresos += Number(compra.total || 0);
          });

          return {
            data: Object.entries(ventasPorMes)
              .map(([mes, datos]) => ({
                mes,
                ventas: datos.ventas,
                ingresos: datos.ingresos
              }))
              .sort((a, b) => a.mes.localeCompare(b.mes)),
            error: null
          };
        } catch (error) {
          console.error('Error en getVentasPorMes:', error);
          return { data: [], error: null };
        }
      })()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return (response.data as { mes: string; ventas: number; ingresos: number }[]) || [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene reporte de asistencia por evento
   */
  getAsistenciaPorEvento(organizadorId?: number, eventoId?: number): Observable<ReporteAsistencia[]> {
    return this.supabaseHelper.fromSupabase(
      (async () => {
        try {
          // Obtener eventos
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
            return { data: [], error: null };
          }

          const reportes: ReporteAsistencia[] = [];

          for (const evento of eventos) {
            // Obtener tipos de boleta del evento
            const { data: tipos } = await this.supabase
              .from('tipos_boleta')
              .select('id')
              .eq('evento_id', evento.id);

            if (!tipos || tipos.length === 0) {
              reportes.push({
                evento_id: evento.id,
                evento_titulo: evento.titulo,
                boletas_vendidas: 0,
                boletas_usadas: 0,
                boletas_pendientes: 0,
                tasa_asistencia: 0
              });
              continue;
            }

            const tiposIds = tipos.map(t => t.id);

            // Contar boletas por estado
            const { data: boletas } = await this.supabase
              .from('boletas_compradas')
              .select('estado')
              .in('tipo_boleta_id', tiposIds);

            const boletas_vendidas = boletas?.length || 0;
            const boletas_usadas = boletas?.filter(b => b.estado === 'usada').length || 0;
            const boletas_pendientes = boletas?.filter(b => b.estado === 'pendiente').length || 0;
            const tasa_asistencia = boletas_vendidas > 0 
              ? Math.round((boletas_usadas / boletas_vendidas) * 100) 
              : 0;

            reportes.push({
              evento_id: evento.id,
              evento_titulo: evento.titulo,
              boletas_vendidas,
              boletas_usadas,
              boletas_pendientes,
              tasa_asistencia
            });
          }

          return {
            data: reportes.sort((a, b) => b.boletas_vendidas - a.boletas_vendidas),
            error: null
          };
        } catch (error) {
          console.error('Error en getAsistenciaPorEvento:', error);
          return { data: [], error: null };
        }
      })()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return (response.data as ReporteAsistencia[]) || [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene reporte detallado de un evento específico
   */
  getReporteEvento(eventoId: number): Observable<ReporteEvento | null> {
    return this.supabaseHelper.fromSupabase(
      (async () => {
        try {
          // Obtener evento
          const { data: evento, error: eventoError } = await this.supabase
            .from('eventos')
            .select('id, titulo, fecha_inicio, fecha_fin')
            .eq('id', eventoId)
            .single();

          if (eventoError || !evento) {
            return { data: null, error: null };
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

          // Obtener boletas
          const { data: boletas } = await this.supabase
            .from('boletas_compradas')
            .select('estado')
            .in('tipo_boleta_id', tiposIds);

          const boletas_vendidas = boletas?.length || 0;
          const boletas_usadas = boletas?.filter(b => b.estado === 'usada').length || 0;

          return {
            data: {
              evento_id: evento.id,
              evento_titulo: evento.titulo,
              ingresos,
              boletas_vendidas,
              boletas_usadas,
              clientes_unicos,
              fecha_inicio: evento.fecha_inicio,
              fecha_fin: evento.fecha_fin
            },
            error: null
          };
        } catch (error) {
          console.error('Error en getReporteEvento:', error);
          return { data: null, error: null };
        }
      })()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as ReporteEvento | null;
      }),
      catchError(() => of(null))
    );
  }

  /**
   * Obtiene distribución de métodos de pago
   */
  getDistribucionMetodoPago(organizadorId?: number): Observable<{ metodo: string; cantidad: number; porcentaje: number }[]> {
    return this.supabaseHelper.fromSupabase(
      (async () => {
        try {
          let query = this.supabase
            .from('compras')
            .select('metodo_pago, evento_id, eventos!inner(organizador_id)')
            .eq('estado_pago', 'completado');

          if (organizadorId) {
            query = query.eq('eventos.organizador_id', organizadorId);
          }

          const { data, error } = await query;

          if (error || !data) {
            return { data: [], error: null };
          }

          const distribucion: { [key: string]: number } = {};
          const total = data.length;

          data.forEach(compra => {
            const metodo = compra.metodo_pago || 'otro';
            distribucion[metodo] = (distribucion[metodo] || 0) + 1;
          });

          return {
            data: Object.entries(distribucion)
              .map(([metodo, cantidad]) => ({
                metodo: this.getMetodoPagoLabel(metodo),
                cantidad,
                porcentaje: total > 0 ? Math.round((cantidad / total) * 100) : 0
              }))
              .sort((a, b) => b.cantidad - a.cantidad),
            error: null
          };
        } catch (error) {
          console.error('Error en getDistribucionMetodoPago:', error);
          return { data: [], error: null };
        }
      })()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return (response.data as { metodo: string; cantidad: number; porcentaje: number }[]) || [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene ingresos por evento
   */
  getIngresosPorEvento(organizadorId?: number): Observable<{ evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[]> {
    return this.supabaseHelper.fromSupabase(
      (async () => {
        try {
          let eventosQuery = this.supabase
            .from('eventos')
            .select('id, titulo');

          if (organizadorId) {
            eventosQuery = eventosQuery.eq('organizador_id', organizadorId);
          }

          const { data: eventos, error: eventosError } = await eventosQuery;

          if (eventosError || !eventos) {
            return { data: [], error: null };
          }

          const reportes = await Promise.all(
            eventos.map(async (evento) => {
              const { data: compras } = await this.supabase
                .from('compras')
                .select('total')
                .eq('evento_id', evento.id)
                .eq('estado_pago', 'completado');

              const ingresos = compras?.reduce((sum: number, c: any) => sum + Number(c.total || 0), 0) || 0;

              // Contar boletas vendidas
              const { data: tipos } = await this.supabase
                .from('tipos_boleta')
                .select('id')
                .eq('evento_id', evento.id);

              if (!tipos || tipos.length === 0) {
                return {
                  evento_id: evento.id,
                  evento_titulo: evento.titulo,
                  ingresos,
                  boletas_vendidas: 0
                };
              }

              const tiposIds = tipos.map(t => t.id);
              const { count } = await this.supabase
                .from('boletas_compradas')
                .select('*', { count: 'exact' })
                .in('tipo_boleta_id', tiposIds);

              return {
                evento_id: evento.id,
                evento_titulo: evento.titulo,
                ingresos,
                boletas_vendidas: count || 0
              };
            })
          );

          return {
            data: reportes
              .filter(r => r.ingresos > 0 || r.boletas_vendidas > 0)
              .sort((a, b) => b.ingresos - a.ingresos),
            error: null
          };
        } catch (error) {
          console.error('Error en getIngresosPorEvento:', error);
          return { data: [], error: null };
        }
      })()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return (response.data as { evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[]) || [];
      }),
      catchError(() => of([]))
    );
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
}

