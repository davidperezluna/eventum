import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComprasService } from '../../services/compras.service';
import { EventosService } from '../../services/eventos.service';
import { ReportesService } from '../../services/reportes.service';
import { ExcelExportService } from '../../services/excel-export.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { Compra, Evento } from '../../types';

@Component({
  selector: 'app-reportes',
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes implements OnInit {
  fechaInicio: string = '';
  fechaFin: string = '';
  loading = false;
  exportando = false;
  
  reporteVentas: any = null;
  reporteEventos: any = null;
  
  esAdministrador = false;
  esOrganizador = false;
  organizadorId: number | null = null;

  constructor(
    private comprasService: ComprasService,
    private eventosService: EventosService,
    private reportesService: ReportesService,
    private excelExportService: ExcelExportService,
    private alertService: AlertService,
    private authService: AuthService
  ) {
    // Establecer fechas por defecto (último mes)
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    this.fechaFin = hoy.toISOString().split('T')[0];
    this.fechaInicio = haceUnMes.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.verificarRol();
    this.generarReporte();
  }

  verificarRol() {
    const unsubscribe = this.authService.onAuthStateChange((user, usuario, session) => {
      if (usuario) {
        this.esAdministrador = usuario.tipo_usuario_id === 3;
        this.esOrganizador = usuario.tipo_usuario_id === 2;
        if (this.esOrganizador) {
          this.organizadorId = usuario.id;
        }
        unsubscribe();
      }
    });
  }

  async generarReporte() {
    this.loading = true;
    
    try {
      // Reporte de ventas
      await this.loadVentasReporte();

      // Reporte de eventos
      await this.loadEventosReporte();
    } catch (err) {
      console.error('Error generando reportes:', err);
      this.alertService.error('Error', 'No se pudieron generar los reportes');
    } finally {
      this.loading = false;
    }
  }

  private async loadVentasReporte() {
    try {
      // Obtener todas las compras (para estadísticas generales)
      // Usar un límite alto para obtener todos los registros
      const response = await this.comprasService.getCompras({
        fecha_desde: this.fechaInicio,
        fecha_hasta: this.fechaFin,
        limit: 10000
      });
      const compras = response.data || [];
      
      // Obtener solo compras completadas para ingresos y estadísticas principales
      const responseCompletadas = await this.comprasService.getCompras({
        fecha_desde: this.fechaInicio,
        fecha_hasta: this.fechaFin,
        estado_pago: 'completado',
        limit: 10000
      });
      const comprasCompletadas = responseCompletadas.data || [];
      
      // Calcular ingresos solo de compras completadas
      const totalIngresos = comprasCompletadas.reduce((sum: number, c: any) => sum + Number(c.total || 0), 0);
      
      this.reporteVentas = {
        totalCompras: response.total || compras.length,
        comprasCompletadas: responseCompletadas.total || comprasCompletadas.length,
        totalIngresos: totalIngresos,
        comprasPorEstado: this.agruparPorEstado(compras, 'estado_pago'),
        comprasPorMetodo: this.agruparPorMetodo(comprasCompletadas) // Solo métodos de pago de compras completadas
      };
      
      console.log('Reporte de ventas generado:', this.reporteVentas);
    } catch (err) {
      console.error('Error generando reporte de ventas:', err);
      this.alertService.error('Error', 'No se pudo generar el reporte de ventas');
      this.reporteVentas = null;
      throw err;
    }
  }

  private async loadEventosReporte() {
    try {
      const response = await this.eventosService.getEventos({
        limit: 10000
      });
      const eventos = response.data || [];
      this.reporteEventos = {
        totalEventos: response.total || eventos.length,
        eventosActivos: eventos.filter(e => e.activo).length,
        eventosPorEstado: this.agruparPorEstado(eventos, 'estado'),
        eventosDestacados: eventos.filter(e => e.destacado).length
      };
      
      console.log('Reporte de eventos generado:', this.reporteEventos);
    } catch (err) {
      console.error('Error generando reporte de eventos:', err);
      this.alertService.error('Error', 'No se pudo generar el reporte de eventos');
      this.reporteEventos = null;
      throw err;
    }
  }

  agruparPorEstado(items: any[], campo: string): any {
    const grupos: any = {};
    items.forEach(item => {
      const estado = item[campo] || 'sin_estado';
      grupos[estado] = (grupos[estado] || 0) + 1;
    });
    return grupos;
  }

  agruparPorMetodo(compras: Compra[]): any {
    const grupos: any = {};
    compras.forEach(compra => {
      const metodo = compra.metodo_pago || 'sin_metodo';
      grupos[metodo] = (grupos[metodo] || 0) + 1;
    });
    return grupos;
  }

  async exportarReporte() {
    if (this.loading || this.exportando) {
      return;
    }

    this.exportando = true;
    try {
      if (this.esAdministrador) {
        await this.exportarReporteAdministrador();
      } else if (this.esOrganizador) {
        await this.exportarReporteOrganizador();
      } else {
        this.alertService.warning('Sin permisos', 'No tienes permisos para exportar reportes');
      }
    } catch (error: any) {
      console.error('Error exportando reporte:', error);
      this.alertService.error('Error', 'No se pudo exportar el reporte: ' + (error.message || 'Error desconocido'));
    } finally {
      this.exportando = false;
    }
  }

  async exportarReporteAdministrador() {
    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Administrador_${fechaHoy}`;
    
    const sheets: { name: string; data: any[] }[] = [];

    // 1. Reporte de Ventas
    if (this.reporteVentas) {
      const ventasData = [
        { 'Métrica': 'Total Compras', 'Valor': this.reporteVentas.totalCompras },
        { 'Métrica': 'Compras Completadas', 'Valor': this.reporteVentas.comprasCompletadas },
        { 'Métrica': 'Total Ingresos', 'Valor': this.excelExportService.formatCurrency(this.reporteVentas.totalIngresos) },
      ];
      sheets.push({ name: 'Resumen Ventas', data: ventasData });

      // Compras por Estado
      const comprasPorEstado = Object.entries(this.reporteVentas.comprasPorEstado || {}).map(([estado, cantidad]) => ({
        'Estado': this.excelExportService.getEstadoPagoLabel(estado),
        'Cantidad': cantidad
      }));
      if (comprasPorEstado.length > 0) {
        sheets.push({ name: 'Compras por Estado', data: comprasPorEstado });
      }

      // Compras por Método de Pago
      const comprasPorMetodo = Object.entries(this.reporteVentas.comprasPorMetodo || {}).map(([metodo, cantidad]) => ({
        'Método de Pago': this.excelExportService.getMetodoPagoLabel(metodo),
        'Cantidad': cantidad
      }));
      if (comprasPorMetodo.length > 0) {
        sheets.push({ name: 'Compras por Método', data: comprasPorMetodo });
      }
    }

    // 2. Reporte de Eventos
    if (this.reporteEventos) {
      const eventosData = [
        { 'Métrica': 'Total Eventos', 'Valor': this.reporteEventos.totalEventos },
        { 'Métrica': 'Eventos Activos', 'Valor': this.reporteEventos.eventosActivos },
        { 'Métrica': 'Eventos Destacados', 'Valor': this.reporteEventos.eventosDestacados },
      ];
      sheets.push({ name: 'Resumen Eventos', data: eventosData });

      // Eventos por Estado
      const eventosPorEstado = Object.entries(this.reporteEventos.eventosPorEstado || {}).map(([estado, cantidad]) => ({
        'Estado': this.excelExportService.getEstadoEventoLabel(estado),
        'Cantidad': cantidad
      }));
      if (eventosPorEstado.length > 0) {
        sheets.push({ name: 'Eventos por Estado', data: eventosPorEstado });
      }
    }

    // 3. Ventas por Día
    try {
      const ventasPorDia = await this.reportesService.getVentasPorDia(this.fechaInicio, this.fechaFin);
      if (ventasPorDia.length > 0) {
        const ventasDiaData = ventasPorDia.map(v => ({
          'Fecha': this.excelExportService.formatDate(v.fecha),
          'Ventas': v.ventas,
          'Ingresos': this.excelExportService.formatCurrency(v.ingresos),
          'Boletas Vendidas': v.boletas_vendidas
        }));
        sheets.push({ name: 'Ventas por Día', data: ventasDiaData });
      }
    } catch (error) {
      console.error('Error obteniendo ventas por día:', error);
    }

    // 4. Ingresos por Evento
    try {
      const ingresosPorEvento = await this.reportesService.getIngresosPorEvento();
      if (ingresosPorEvento.length > 0) {
        const ingresosEventoData = ingresosPorEvento.map(i => ({
          'Evento': i.evento_titulo,
          'Ingresos': this.excelExportService.formatCurrency(i.ingresos),
          'Boletas Vendidas': i.boletas_vendidas
        }));
        sheets.push({ name: 'Ingresos por Evento', data: ingresosEventoData });
      }
    } catch (error) {
      console.error('Error obteniendo ingresos por evento:', error);
    }

    // 5. Distribución de Métodos de Pago
    try {
      const distribucionMetodo = await this.reportesService.getDistribucionMetodoPago();
      if (distribucionMetodo.length > 0) {
        const distribucionData = distribucionMetodo.map(d => ({
          'Método de Pago': d.metodo,
          'Cantidad': d.cantidad,
          'Porcentaje': `${d.porcentaje}%`
        }));
        sheets.push({ name: 'Distribución Métodos', data: distribucionData });
      }
    } catch (error) {
      console.error('Error obteniendo distribución métodos:', error);
    }

    // 6. Detalle de Compras
    try {
      const comprasResponse = await this.comprasService.getCompras({
        fecha_desde: this.fechaInicio,
        fecha_hasta: this.fechaFin,
        limit: 10000
      });
      const compras = comprasResponse.data || [];
      if (compras.length > 0) {
        const comprasData = compras.map((c: any) => ({
          'ID': c.id,
          'Número Transacción': c.numero_transaccion,
          'Cliente': c.cliente ? `${c.cliente.nombre || ''} ${c.cliente.apellido || ''}`.trim() : 'N/A',
          'Email Cliente': c.cliente?.email || 'N/A',
          'Evento': c.evento?.titulo || 'N/A',
          'Total': this.excelExportService.formatCurrency(c.total || 0),
          'Método de Pago': this.excelExportService.getMetodoPagoLabel(c.metodo_pago || 'otro'),
          'Estado Pago': this.excelExportService.getEstadoPagoLabel(c.estado_pago || 'pendiente'),
          'Estado Compra': this.excelExportService.getEstadoCompraLabel(c.estado_compra || 'pendiente'),
          'Fecha Compra': this.excelExportService.formatDate(c.fecha_compra)
        }));
        sheets.push({ name: 'Detalle Compras', data: comprasData });
      }
    } catch (error) {
      console.error('Error obteniendo detalle de compras:', error);
    }

    if (sheets.length > 0) {
      await this.excelExportService.exportMultipleSheets(sheets, nombreArchivo);
      this.alertService.success('Exportación exitosa', `Reporte exportado como ${nombreArchivo}.xlsx`);
    } else {
      this.alertService.warning('Sin datos', 'No hay datos para exportar en el rango de fechas seleccionado');
    }
  }

  async exportarReporteOrganizador() {
    if (!this.organizadorId) {
      this.alertService.error('Error', 'No se pudo identificar el organizador');
      return;
    }

    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Organizador_${fechaHoy}`;
    
    const sheets: { name: string; data: any[] }[] = [];

    // 1. Ventas por Día del Organizador
    try {
      const ventasPorDia = await this.reportesService.getVentasPorDia(this.fechaInicio, this.fechaFin, this.organizadorId);
      if (ventasPorDia.length > 0) {
        const ventasDiaData = ventasPorDia.map(v => ({
          'Fecha': this.excelExportService.formatDate(v.fecha),
          'Ventas': v.ventas,
          'Ingresos': this.excelExportService.formatCurrency(v.ingresos),
          'Boletas Vendidas': v.boletas_vendidas
        }));
        sheets.push({ name: 'Ventas por Día', data: ventasDiaData });
      }
    } catch (error) {
      console.error('Error obteniendo ventas por día:', error);
    }

    // 2. Ingresos por Evento del Organizador
    try {
      const ingresosPorEvento = await this.reportesService.getIngresosPorEvento(this.organizadorId);
      if (ingresosPorEvento.length > 0) {
        const ingresosEventoData = ingresosPorEvento.map(i => ({
          'Evento': i.evento_titulo,
          'Ingresos': this.excelExportService.formatCurrency(i.ingresos),
          'Boletas Vendidas': i.boletas_vendidas
        }));
        sheets.push({ name: 'Ingresos por Evento', data: ingresosEventoData });
      }
    } catch (error) {
      console.error('Error obteniendo ingresos por evento:', error);
    }

    // 3. Asistencia por Evento
    try {
      const asistenciaPorEvento = await this.reportesService.getAsistenciaPorEvento(this.organizadorId);
      if (asistenciaPorEvento.length > 0) {
        const asistenciaData = asistenciaPorEvento.map(a => ({
          'Evento': a.evento_titulo,
          'Boletas Vendidas': a.boletas_vendidas,
          'Boletas Usadas': a.boletas_usadas,
          'Boletas Pendientes': a.boletas_pendientes,
          'Tasa de Asistencia': `${a.tasa_asistencia}%`
        }));
        sheets.push({ name: 'Asistencia por Evento', data: asistenciaData });
      }
    } catch (error) {
      console.error('Error obteniendo asistencia:', error);
    }

    // 4. Distribución de Métodos de Pago del Organizador
    try {
      const distribucionMetodo = await this.reportesService.getDistribucionMetodoPago(this.organizadorId);
      if (distribucionMetodo.length > 0) {
        const distribucionData = distribucionMetodo.map(d => ({
          'Método de Pago': d.metodo,
          'Cantidad': d.cantidad,
          'Porcentaje': `${d.porcentaje}%`
        }));
        sheets.push({ name: 'Distribución Métodos', data: distribucionData });
      }
    } catch (error) {
      console.error('Error obteniendo distribución métodos:', error);
    }

    // 5. Ventas por Mes
    try {
      const ventasPorMes = await this.reportesService.getVentasPorMes(this.organizadorId);
      if (ventasPorMes.length > 0) {
        const ventasMesData = ventasPorMes.map(v => ({
          'Mes': v.mes,
          'Ventas': v.ventas,
          'Ingresos': this.excelExportService.formatCurrency(v.ingresos)
        }));
        sheets.push({ name: 'Ventas por Mes', data: ventasMesData });
      }
    } catch (error) {
      console.error('Error obteniendo ventas por mes:', error);
    }

    // 6. Resumen General
    try {
      const ingresosPorEvento = await this.reportesService.getIngresosPorEvento(this.organizadorId);
      const totalIngresos = ingresosPorEvento.reduce((sum, e) => sum + e.ingresos, 0);
      const totalBoletas = ingresosPorEvento.reduce((sum, e) => sum + e.boletas_vendidas, 0);
      
      const resumenData = [
        { 'Métrica': 'Total Ingresos', 'Valor': this.excelExportService.formatCurrency(totalIngresos) },
        { 'Métrica': 'Total Boletas Vendidas', 'Valor': totalBoletas },
        { 'Métrica': 'Total Eventos', 'Valor': ingresosPorEvento.length },
        { 'Métrica': 'Período', 'Valor': `${this.excelExportService.formatDate(this.fechaInicio)} - ${this.excelExportService.formatDate(this.fechaFin)}` }
      ];
      sheets.push({ name: 'Resumen General', data: resumenData });
    } catch (error) {
      console.error('Error generando resumen:', error);
    }

    if (sheets.length > 0) {
      await this.excelExportService.exportMultipleSheets(sheets, nombreArchivo);
      this.alertService.success('Exportación exitosa', `Reporte exportado como ${nombreArchivo}.xlsx`);
    } else {
      this.alertService.warning('Sin datos', 'No hay datos para exportar en el rango de fechas seleccionado');
    }
  }
}
