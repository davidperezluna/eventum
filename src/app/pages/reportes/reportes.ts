import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComprasService } from '../../services/compras.service';
import { EventosService } from '../../services/eventos.service';
import { AlertService } from '../../services/alert.service';
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
  
  reporteVentas: any = null;
  reporteEventos: any = null;

  constructor(
    private comprasService: ComprasService,
    private eventosService: EventosService,
    private alertService: AlertService
  ) {
    // Establecer fechas por defecto (último mes)
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    this.fechaFin = hoy.toISOString().split('T')[0];
    this.fechaInicio = haceUnMes.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.generarReporte();
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

  exportarReporte() {
    this.alertService.info('Próximamente', 'Funcionalidad de exportación próximamente');
  }
}
