import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComprasService } from '../../services/compras.service';
import { EventosService } from '../../services/eventos.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { Compra, Evento, Usuario } from '../../types';

@Component({
  selector: 'app-reportes',
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes implements OnInit, OnDestroy {
  eventoSeleccionado: number | null = null;
  organizadorFiltro: number | null = null;
  loading = false;
  loadingEventos = false;
  loadingOrganizadores = false;
  
  reporteVentas: any = null;
  reporteEventos: any = null;
  reporteComisiones: any = null;
  eventos: Evento[] = [];
  organizadores: Usuario[] = [];
  
  esAdministrador = false;
  esOrganizador = false;
  organizadorId: number | null = null;
  
  private unsubscribeAuth: (() => void) | null = null;
  private generandoReporte = false;

  constructor(
    private comprasService: ComprasService,
    private eventosService: EventosService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnDestroy() {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
    }
  }

  ngOnInit() {
    this.verificarRol();
  }

  verificarRol() {
    let procesado = false;
    
    const callback = (user: any, usuario: any, session: any) => {
      // Evitar procesamiento múltiple
      if (procesado || !usuario) {
        return;
      }
      
      procesado = true;
      this.esAdministrador = usuario.tipo_usuario_id === 3;
      this.esOrganizador = usuario.tipo_usuario_id === 2;
      
      if (this.esOrganizador) {
        this.organizadorId = usuario.id;
        this.organizadorFiltro = usuario.id;
        // Si es organizador, cargar sus eventos automáticamente
        this.cargarEventos();
      }
      
      // Solo cargar organizadores si es administrador
      if (this.esAdministrador) {
        this.cargarOrganizadores();
      }
      
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

  async cargarOrganizadores() {
    if (!this.esAdministrador) {
      return;
    }
    
    this.loadingOrganizadores = true;
    try {
      const organizadores = await this.usuariosService.getOrganizadores();
      this.organizadores = organizadores || [];
    } catch (error) {
      console.error('Error cargando organizadores:', error);
      this.organizadores = [];
    } finally {
      this.loadingOrganizadores = false;
    }
  }

  async cargarEventos() {
    this.loadingEventos = true;
    try {
      const filters: any = {
        limit: 1000,
        page: 1,
        sortBy: 'fecha_inicio',
        sortOrder: 'desc'
      };

      // Si hay filtro de organizador, aplicarlo
      if (this.organizadorFiltro) {
        filters.organizador_id = this.organizadorFiltro;
      } else if (this.esOrganizador && this.organizadorId) {
        // Si es organizador y no hay filtro, usar su ID
        filters.organizador_id = this.organizadorId;
      }

      const response = await this.eventosService.getEventos(filters);
      this.eventos = response.data || [];
      
      // NO generar reporte automáticamente, solo cargar eventos en el select
    } catch (error) {
      console.error('Error cargando eventos:', error);
      this.eventos = [];
      this.alertService.error('Error', 'No se pudieron cargar los eventos');
    } finally {
      this.loadingEventos = false;
    }
  }

  onOrganizadorChange() {
    // Cuando cambia el organizador, limpiar evento seleccionado y recargar eventos
    this.eventoSeleccionado = null;
    // Limpiar reportes anteriores
    this.reporteVentas = null;
    this.reporteEventos = null;
    this.reporteComisiones = null;
    
    // Si no hay organizador seleccionado, vaciar eventos
    if (!this.organizadorFiltro) {
      this.eventos = [];
      return;
    }
    // Solo cargar eventos en el select, NO generar reporte
    this.cargarEventos();
  }

  onEventoChange() {
    // Solo actualizar la selección; el reporte se genera al dar clic en "Generar Reporte"
    // Limpiar reportes anteriores cuando cambia el evento
    this.reporteVentas = null;
    this.reporteEventos = null;
    this.reporteComisiones = null;
  }

  async generarReporte() {
    // Prevenir llamadas concurrentes
    if (this.generandoReporte || this.loading) {
      return;
    }
    
    this.generandoReporte = true;
    this.loading = true;
    
    // Limpiar reportes anteriores
    this.reporteVentas = null;
    this.reporteEventos = null;
    this.reporteComisiones = null;
    this.cdr.detectChanges();
    
    try {
      // Ejecutar reportes en paralelo cuando sea posible
      const [ventas, eventos, comisiones] = await Promise.allSettled([
        this.loadVentasReporte(),
        this.loadEventosReporte(),
        this.loadComisionesReporte()
      ]);
      
      // Verificar si hubo errores
      if (ventas.status === 'rejected') {
        console.error('Error en reporte de ventas:', ventas.reason);
      }
      if (eventos.status === 'rejected') {
        console.error('Error en reporte de eventos:', eventos.reason);
      }
      if (comisiones.status === 'rejected') {
        console.error('Error en reporte de comisiones:', comisiones.reason);
      }
      
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error generando reportes:', err);
      this.alertService.error('Error', 'No se pudieron generar los reportes');
    } finally {
      this.loading = false;
      this.generandoReporte = false;
      this.cdr.detectChanges();
    }
  }

  private async loadVentasReporte() {
    try {
      // Preparar filtros base - optimizar para obtener solo lo necesario
      const filtersBase: any = {
        limit: 10000
      };

      // Agregar filtro de evento si está seleccionado
      if (this.eventoSeleccionado) {
        filtersBase.evento_id = this.eventoSeleccionado;
      }

      // Si hay filtro de organizador y no evento específico, obtener IDs de eventos primero
      let eventosIds: number[] = [];
      if (this.organizadorFiltro && !this.eventoSeleccionado && this.eventos.length > 0) {
        eventosIds = this.eventos.map(e => e.id);
        if (eventosIds.length === 0) {
          // Si no hay eventos del organizador, retornar reporte vacío
          this.reporteVentas = {
            totalCompras: 0,
            comprasCompletadas: 0,
            totalIngresos: 0,
            comprasPorEstado: {},
            comprasPorMetodo: {}
          };
          return;
        }
      }

      // Obtener todas las compras y completadas en una sola consulta optimizada
      // Primero obtener todas para estadísticas generales
      const response = await this.comprasService.getCompras(filtersBase);
      let compras = response.data || [];
      
      // Filtrar por eventos del organizador si aplica
      if (eventosIds.length > 0) {
        compras = compras.filter((c: any) => eventosIds.includes(c.evento_id));
      }
      
      // Filtrar completadas del mismo conjunto (más eficiente que hacer otra consulta)
      const comprasCompletadas = compras.filter((c: any) => c.estado_pago === 'completado');
      
      // Calcular ingresos solo de compras completadas
      const totalIngresos = comprasCompletadas.reduce((sum: number, c: any) => sum + Number(c.total || 0), 0);
      
      this.reporteVentas = {
        totalCompras: compras.length,
        comprasCompletadas: comprasCompletadas.length,
        totalIngresos: totalIngresos,
        comprasPorEstado: this.agruparPorEstado(compras, 'estado_pago'),
        comprasPorMetodo: this.agruparPorMetodo(comprasCompletadas)
      };
      
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error generando reporte de ventas:', err);
      this.reporteVentas = null;
      throw err;
    }
  }

  private async loadEventosReporte() {
    try {
      const filters: any = {
        limit: 10000
      };

      // Si hay evento seleccionado, solo mostrar ese evento
      if (this.eventoSeleccionado) {
        try {
          const evento = await this.eventosService.getEventoById(this.eventoSeleccionado);
          const eventos = evento ? [evento] : [];
          this.reporteEventos = {
            totalEventos: eventos.length,
            eventosActivos: eventos.filter(e => e.activo).length,
            eventosPorEstado: this.agruparPorEstado(eventos, 'estado'),
            eventosDestacados: eventos.filter(e => e.destacado).length
          };
          return;
        } catch (error) {
          console.error('Error obteniendo evento:', error);
        }
      }

      // Si hay filtro de organizador, aplicarlo
      if (this.organizadorFiltro) {
        filters.organizador_id = this.organizadorFiltro;
      } else if (this.esOrganizador && this.organizadorId) {
        filters.organizador_id = this.organizadorId;
      }

      const response = await this.eventosService.getEventos(filters);
      const eventos = response.data || [];
      this.reporteEventos = {
        totalEventos: eventos.length,
        eventosActivos: eventos.filter(e => e.activo).length,
        eventosPorEstado: this.agruparPorEstado(eventos, 'estado'),
        eventosDestacados: eventos.filter(e => e.destacado).length
      };
      
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error generando reporte de eventos:', err);
      this.reporteEventos = null;
      throw err;
    }
  }

  private async loadComisionesReporte() {
    try {
      const filtersBase: any = {
        limit: 10000,
        estado_pago: 'completado'
      };

      if (this.eventoSeleccionado) {
        filtersBase.evento_id = this.eventoSeleccionado;
      }

      // Si hay filtro de organizador y no evento específico, usar eventos ya cargados
      let eventosIds: number[] = [];
      if (this.organizadorFiltro && !this.eventoSeleccionado && this.eventos.length > 0) {
        eventosIds = this.eventos.map(e => e.id);
        if (eventosIds.length === 0) {
          // Si no hay eventos del organizador, retornar reporte vacío
          this.reporteComisiones = {
            totalBruto: 0,
            totalComision: 0,
            totalIVA: 0,
            totalNeto: 0,
            porEvento: []
          };
          return;
        }
      }

      const response = await this.comprasService.getCompras(filtersBase);
      let compras = response.data || [];

      // Filtrar por eventos del organizador si aplica
      if (eventosIds.length > 0) {
        compras = compras.filter((c: any) => eventosIds.includes(c.evento_id));
      }

      // Acumuladores
      let totalBruto = 0;
      let totalComision = 0;
      let totalIVA = 0;
      let totalNeto = 0;

      const porEventoMap: Record<number, any> = {};

      compras.forEach((c: any) => {
        const bruto = Number(c.total || 0);
        const comisionBase = bruto * 0.0265 + 700;
        const iva = comisionBase * 0.19;
        const comisionTotal = comisionBase + iva;
        const neto = bruto - comisionTotal;

        totalBruto += bruto;
        totalComision += comisionBase;
        totalIVA += iva;
        totalNeto += neto;

        const eventoId = c.evento_id;
        if (!porEventoMap[eventoId]) {
          const eventoInfo = this.eventos.find(e => e.id === eventoId);
          porEventoMap[eventoId] = {
            eventoId,
            eventoTitulo: eventoInfo?.titulo || 'Evento',
            transacciones: 0,
            bruto: 0,
            comision: 0,
            iva: 0,
            neto: 0
          };
        }

        porEventoMap[eventoId].transacciones += 1;
        porEventoMap[eventoId].bruto += bruto;
        porEventoMap[eventoId].comision += comisionBase;
        porEventoMap[eventoId].iva += iva;
        porEventoMap[eventoId].neto += neto;
      });

      this.reporteComisiones = {
        totalBruto,
        totalComision,
        totalIVA,
        totalNeto,
        porEvento: Object.values(porEventoMap).sort((a: any, b: any) => b.bruto - a.bruto)
      };
      
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error generando reporte de comisiones:', error);
      this.reporteComisiones = null;
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
