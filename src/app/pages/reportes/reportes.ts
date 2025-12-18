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
    
    // Reporte de ventas
    await this.loadVentasReporte();

    // Reporte de eventos
    this.loadEventosReporte();
  }

  private async loadVentasReporte() {
    try {
      const response = await this.comprasService.getCompras({
        fecha_desde: this.fechaInicio,
        fecha_hasta: this.fechaFin,
        limit: 1000
      });
      const compras = response.data;
      const totalVentas = compras.reduce((sum: number, c: any) => sum + Number(c.total || 0), 0);
      const comprasCompletadas = compras.filter((c: any) => c.estado_pago === 'completado');
      
      this.reporteVentas = {
        totalCompras: compras.length,
        comprasCompletadas: comprasCompletadas.length,
        totalIngresos: totalVentas,
        comprasPorEstado: this.agruparPorEstado(compras, 'estado_pago'),
        comprasPorMetodo: this.agruparPorMetodo(compras)
      };
      this.loading = false;
    } catch (err) {
      console.error('Error generando reporte de ventas:', err);
      this.loading = false;
    }
  }

  private async loadEventosReporte() {
    try {
      const response = await this.eventosService.getEventos({
        limit: 1000
      });
      const eventos = response.data;
      this.reporteEventos = {
        totalEventos: eventos.length,
        eventosActivos: eventos.filter(e => e.activo).length,
        eventosPorEstado: this.agruparPorEstado(eventos, 'estado'),
        eventosDestacados: eventos.filter(e => e.destacado).length
      };
    } catch (err) {
      console.error('Error generando reporte de eventos:', err);
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
