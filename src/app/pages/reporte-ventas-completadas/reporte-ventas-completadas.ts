import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { EventosService } from '../../services/eventos.service';
import { ReportesService, VentaCompletadaDetalle } from '../../services/reportes.service';
import { ExcelExportService } from '../../services/excel-export.service';
import { Evento } from '../../types';

type VentaRow = VentaCompletadaDetalle & {
  valor_boleta: number;
  descuento_real_porcentaje: number;
  wompi_descuento: number; // comisión total (incluye IVA)
  neto_cliente: number; // total - wompi_descuento
};

@Component({
  selector: 'app-reporte-ventas-completadas',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reporte-ventas-completadas.html',
  styleUrl: './reporte-ventas-completadas.css',
})
export class ReporteVentasCompletadas implements OnInit, OnDestroy {
  esAdministrador = false;

  loadingEventos = false;
  loading = false;

  eventos: Evento[] = [];
  eventoSeleccionado: number | null = null;

  ventas: VentaRow[] = [];
  resumen = {
    transacciones: 0,
    boletas: 0,
    ingresos: 0,
    wompi: 0,
    neto_cliente: 0,
  };

  private unsubscribeAuth: (() => void) | null = null;
  private generando = false;

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
    private router: Router,
    private eventosService: EventosService,
    private reportesService: ReportesService,
    public excelExportService: ExcelExportService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.verificarAdmin();
  }

  ngOnDestroy() {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
    }
  }

  private verificarAdmin() {
    let procesado = false;

    const callback = (_user: any, usuario: any) => {
      if (procesado || !usuario) return;
      procesado = true;

      this.esAdministrador = usuario.tipo_usuario_id === 3;
      if (!this.esAdministrador) {
        this.alertService.error('Acceso restringido', 'Este reporte es solo para administradores.');
        this.router.navigate(['/dashboard']);
        return;
      }

      this.cargarEventos();
      this.cdr.detectChanges();
    };

    this.unsubscribeAuth = this.authService.onAuthStateChange(callback);

    // Desuscribirse después de procesar
    setTimeout(() => {
      if (this.unsubscribeAuth) {
        this.unsubscribeAuth();
        this.unsubscribeAuth = null;
      }
    }, 500);
  }

  async cargarEventos() {
    this.loadingEventos = true;
    try {
      const response = await this.eventosService.getEventos({
        limit: 1000,
        page: 1,
        sortBy: 'fecha_inicio',
        sortOrder: 'desc',
      } as any);
      this.eventos = response.data || [];
    } catch (error) {
      console.error('Error cargando eventos:', error);
      this.eventos = [];
      this.alertService.error('Error', 'No se pudieron cargar los eventos');
    } finally {
      this.loadingEventos = false;
      this.cdr.detectChanges();
    }
  }

  onEventoChange() {
    this.ventas = [];
    this.resumen = { transacciones: 0, boletas: 0, ingresos: 0, wompi: 0, neto_cliente: 0 };
  }

  private calcularWompiDescuento(total: number): number {
    const bruto = Number(total || 0);
    const comisionBase = bruto * 0.0265 + 700;
    const iva = comisionBase * 0.19;
    return comisionBase + iva;
  }

  async generarReporte() {
    if (this.generando || this.loading) return;
    if (!this.eventoSeleccionado) {
      this.alertService.warning('Selecciona un evento', 'Elige un evento para generar el reporte.');
      return;
    }

    this.generando = true;
    this.loading = true;
    this.ventas = [];
    this.resumen = { transacciones: 0, boletas: 0, ingresos: 0, wompi: 0, neto_cliente: 0 };
    this.cdr.detectChanges();

    try {
      const ventas = await this.reportesService.getVentasCompletadasDetallePorEvento(this.eventoSeleccionado);
      this.ventas = ventas.map((v) => {
        const boletas = Number(v.boletas || 0);
        const subtotal = Number(v.subtotal || 0);
        const descuentoCupon = Number(v.descuento_total || 0);
        const total = Number(v.total || 0);
        const valor_boleta = boletas > 0 ? subtotal / boletas : 0;
        const descuento_real_porcentaje = subtotal > 0 ? (descuentoCupon / subtotal) * 100 : 0;
        const wompi_descuento = this.calcularWompiDescuento(total);
        const neto_cliente = total - wompi_descuento;
        return {
          ...v,
          valor_boleta,
          descuento_real_porcentaje,
          wompi_descuento,
          neto_cliente
        } as VentaRow;
      });

      this.resumen.transacciones = this.ventas.length;
      this.resumen.boletas = this.ventas.reduce((sum, v) => sum + Number(v.boletas || 0), 0);
      this.resumen.ingresos = this.ventas.reduce((sum, v) => sum + Number(v.total || 0), 0);
      this.resumen.wompi = this.ventas.reduce((sum, v) => sum + Number(v.wompi_descuento || 0), 0);
      this.resumen.neto_cliente = this.ventas.reduce((sum, v) => sum + Number(v.neto_cliente || 0), 0);
    } catch (err) {
      console.error('Error generando reporte:', err);
      this.alertService.error('Error', 'No se pudo generar el reporte');
    } finally {
      this.loading = false;
      this.generando = false;
      this.cdr.detectChanges();
    }
  }

  async exportarExcel() {
    if (!this.ventas || this.ventas.length === 0) {
      this.alertService.warning('Sin datos', 'No hay ventas completadas para exportar.');
      return;
    }

    const evento = this.eventos.find(e => e.id === this.eventoSeleccionado);
    const fecha = new Date().toISOString().split('T')[0];
    const safeTitulo = (evento?.titulo || `evento_${this.eventoSeleccionado}`).replace(/[\\/:*?"<>|]/g, '').slice(0, 60);

    const resumenSheet = [
      { Métrica: 'Transacciones', Valor: this.resumen.transacciones },
      { Métrica: 'Boletas', Valor: this.resumen.boletas },
      { Métrica: 'Ingresos', Valor: this.excelExportService.formatCurrency(this.resumen.ingresos) },
      { Métrica: 'Descuento Wompi', Valor: this.excelExportService.formatCurrency(this.resumen.wompi) },
      { Métrica: 'Neto cliente', Valor: this.excelExportService.formatCurrency(this.resumen.neto_cliente) },
    ];

    const detalleSheet = this.ventas.map(v => ({
      'Compra ID': v.compra_id,
      'Fecha compra': this.excelExportService.formatDate(v.fecha_compra),
      'Transacción': v.numero_transaccion,
      'Evento': v.evento_titulo,
      'Cliente': v.cliente_nombre,
      'Email': v.cliente_email,
      'Método pago': this.excelExportService.getMetodoPagoLabel(v.metodo_pago || ''),
      'Cupón': v.cupon_codigo || '',
      '% Descuento real': Number((v.descuento_real_porcentaje || 0).toFixed(2)),
      'Boletas': v.boletas,
      'Valor boleta (promedio)': this.excelExportService.formatCurrency(v.valor_boleta || 0),
      'Subtotal': this.excelExportService.formatCurrency(v.subtotal),
      'Descuento cupón': this.excelExportService.formatCurrency(v.descuento_total),
      'Descuento Wompi (con IVA)': this.excelExportService.formatCurrency(v.wompi_descuento || 0),
      'Neto cliente': this.excelExportService.formatCurrency(v.neto_cliente || 0),
      'Total': this.excelExportService.formatCurrency(v.total),
    }));

    try {
      await this.excelExportService.exportMultipleSheets(
        [
          { name: 'Resumen (Insights)', data: resumenSheet },
          { name: 'Detalle', data: detalleSheet }
        ],
        `ventas_completadas_${safeTitulo}_${fecha}`
      );
      this.alertService.success('Éxito', 'Excel exportado correctamente');
    } catch (error) {
      console.error('Error exportando Excel:', error);
      this.alertService.error('Error', 'No se pudo exportar a Excel');
    }
  }
}

