/* ============================================
   REPORTES SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

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
    private supabase: SupabaseService
  ) {}

  /**
   * Obtiene reporte de ventas por día en un rango de fechas
   */
  async getVentasPorDia(fechaDesde?: string, fechaHasta?: string, organizadorId?: number, eventoId?: number): Promise<ReporteVentas[]> {
    try {
      let query = this.supabase
        .from('compras')
        .select('id, total, fecha_compra, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado');

      if (organizadorId) {
        query = query.eq('eventos.organizador_id', organizadorId);
      }

      if (eventoId) {
        query = query.eq('evento_id', eventoId);
      }

      if (fechaDesde) {
        query = query.gte('fecha_compra', fechaDesde);
      }
      if (fechaHasta) {
        query = query.lte('fecha_compra', fechaHasta);
      }

      const { data, error } = await query;

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
        const fecha = new Date(compra.fecha_compra).toISOString().split('T')[0];
        
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
  async getVentasPorMes(organizadorId?: number): Promise<{ mes: string; ventas: number; ingresos: number }[]> {
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
        return [];
      }

      const ventasPorMes: { [key: string]: { ventas: number; ingresos: number } } = {};

      data.forEach(compra => {
        const fecha = new Date(compra.fecha_compra);
        const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

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
        return [];
      }

      const eventosIds = eventos.map(e => e.id);

      // Obtener todos los tipos de boleta de estos eventos en una sola petición
      const { data: tiposBoleta, error: tiposError } = await this.supabase
        .from('tipos_boleta')
        .select('id, evento_id')
        .in('evento_id', eventosIds);

      if (tiposError) {
        console.error('Error obteniendo tipos de boleta:', tiposError);
      }

      // Crear mapa de evento_id -> tipos_boleta_ids
      const tiposPorEvento: { [key: number]: number[] } = {};
      if (tiposBoleta) {
        tiposBoleta.forEach(tipo => {
          if (!tiposPorEvento[tipo.evento_id]) {
            tiposPorEvento[tipo.evento_id] = [];
          }
          tiposPorEvento[tipo.evento_id].push(tipo.id);
        });
      }

      const todosTiposIds = tiposBoleta?.map(t => t.id) || [];

      // Obtener todas las boletas de estos tipos en una sola petición
      let boletasQuery = this.supabase
        .from('boletas_compradas')
        .select('estado, tipo_boleta_id, compras!inner(estado_pago)')
        .eq('compras.estado_pago', 'completado');

      if (todosTiposIds.length > 0) {
        boletasQuery = boletasQuery.in('tipo_boleta_id', todosTiposIds);
      }

      const { data: boletas, error: boletasError } = await boletasQuery;

      if (boletasError) {
        console.error('Error obteniendo boletas:', boletasError);
      }

      // Agrupar boletas por evento
      const boletasPorEvento: { [key: number]: { vendidas: number; usadas: number; pendientes: number } } = {};
      
      if (boletas) {
        boletas.forEach(boleta => {
          // Encontrar el evento_id de este tipo_boleta
          const tipoBoleta = tiposBoleta?.find(t => t.id === boleta.tipo_boleta_id);
          if (tipoBoleta) {
            const eventoId = tipoBoleta.evento_id;
            if (!boletasPorEvento[eventoId]) {
              boletasPorEvento[eventoId] = { vendidas: 0, usadas: 0, pendientes: 0 };
            }
            boletasPorEvento[eventoId].vendidas += 1;
            if (boleta.estado === 'usada') {
              boletasPorEvento[eventoId].usadas += 1;
            } else if (boleta.estado === 'pendiente') {
              boletasPorEvento[eventoId].pendientes += 1;
            }
          }
        });
      }

      // Construir reportes
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

      return reportes.sort((a, b) => b.boletas_vendidas - a.boletas_vendidas);
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
   * Obtiene distribución de métodos de pago
   */
  async getDistribucionMetodoPago(organizadorId?: number): Promise<{ metodo: string; cantidad: number; porcentaje: number }[]> {
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

      // Obtener todas las compras de estos eventos en una sola petición
      let comprasQuery = this.supabase
        .from('compras')
        .select('id, total, evento_id')
        .in('evento_id', eventosIds)
        .eq('estado_pago', 'completado');

      const { data: compras, error: comprasError } = await comprasQuery;

      if (comprasError) {
        console.error('Error obteniendo compras:', comprasError);
      }

      // Obtener todos los tipos de boleta de estos eventos en una sola petición
      const { data: tiposBoleta, error: tiposError } = await this.supabase
        .from('tipos_boleta')
        .select('id, evento_id')
        .in('evento_id', eventosIds);

      if (tiposError) {
        console.error('Error obteniendo tipos de boleta:', tiposError);
      }

      // Crear mapa de evento_id -> tipos_boleta_ids
      const tiposPorEvento: { [key: number]: number[] } = {};
      if (tiposBoleta) {
        tiposBoleta.forEach(tipo => {
          if (!tiposPorEvento[tipo.evento_id]) {
            tiposPorEvento[tipo.evento_id] = [];
          }
          tiposPorEvento[tipo.evento_id].push(tipo.id);
        });
      }

      const todosTiposIds = tiposBoleta?.map(t => t.id) || [];

      // Agrupar compras por evento primero
      const ingresosPorEvento: { [key: number]: number } = {};
      if (compras) {
        compras.forEach(compra => {
          const eventoId = compra.evento_id;
          ingresosPorEvento[eventoId] = (ingresosPorEvento[eventoId] || 0) + Number(compra.total || 0);
        });
      }

      // Obtener todas las boletas de estos tipos en una sola petición
      let boletasQuery = this.supabase
        .from('boletas_compradas')
        .select('tipo_boleta_id, compra_id, compras!inner(estado_pago)')
        .eq('compras.estado_pago', 'completado');

      if (todosTiposIds.length > 0) {
        boletasQuery = boletasQuery.in('tipo_boleta_id', todosTiposIds);
      } else {
        // Si no hay tipos, retornar reportes vacíos
        return eventos.map(evento => ({
          evento_id: evento.id,
          evento_titulo: evento.titulo,
          ingresos: ingresosPorEvento[evento.id] || 0,
          boletas_vendidas: 0
        }));
      }

      const { data: boletas, error: boletasError } = await boletasQuery;

      if (boletasError) {
        console.error('Error obteniendo boletas:', boletasError);
      }

      // Agrupar boletas por evento (usando tipos_boleta como intermediario)
      const boletasPorEvento: { [key: number]: number } = {};
      if (boletas) {
        boletas.forEach(boleta => {
          // Encontrar el evento_id de este tipo_boleta
          const tipoBoleta = tiposBoleta?.find(t => t.id === boleta.tipo_boleta_id);
          if (tipoBoleta) {
            boletasPorEvento[tipoBoleta.evento_id] = (boletasPorEvento[tipoBoleta.evento_id] || 0) + 1;
          }
        });
      }

      // Construir reportes
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

