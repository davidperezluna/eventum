import { Component, OnInit } from '@angular/core';
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
export class Reportes implements OnInit {
  eventoSeleccionado: number | null = null;
  organizadorFiltro: number | null = null;
  loading = false;
  loadingEventos = false;
  loadingOrganizadores = false;
  
  reporteVentas: any = null;
  reporteEventos: any = null;
  eventos: Evento[] = [];
  organizadores: Usuario[] = [];
  
  esAdministrador = false;
  esOrganizador = false;
  organizadorId: number | null = null;

  constructor(
    private comprasService: ComprasService,
    private eventosService: EventosService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.verificarRol();
  }

  verificarRol() {
    const unsubscribe = this.authService.onAuthStateChange((user, usuario, session) => {
      if (usuario) {
        this.esAdministrador = usuario.tipo_usuario_id === 3;
        this.esOrganizador = usuario.tipo_usuario_id === 2;
        if (this.esOrganizador) {
          this.organizadorId = usuario.id;
          this.organizadorFiltro = usuario.id;
        }
        // Cargar datos después de verificar el rol
        this.cargarOrganizadores();
        this.cargarEventos();
        unsubscribe();
      }
    });
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
      
      // Generar reporte después de cargar eventos
      this.generarReporte();
    } catch (error) {
      console.error('Error cargando eventos:', error);
      this.eventos = [];
    } finally {
      this.loadingEventos = false;
    }
  }

  onOrganizadorChange() {
    // Cuando cambia el organizador, recargar eventos y limpiar evento seleccionado
    this.eventoSeleccionado = null;
    this.cargarEventos();
    this.generarReporte();
  }

  onEventoChange() {
    // Cuando cambia el evento, regenerar reporte
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
      // Preparar filtros base
      const filtersBase: any = {
        limit: 10000
      };

      // Agregar filtro de evento si está seleccionado
      if (this.eventoSeleccionado) {
        filtersBase.evento_id = this.eventoSeleccionado;
      }

      // Obtener todas las compras (para estadísticas generales)
      const response = await this.comprasService.getCompras(filtersBase);
      let compras = response.data || [];
      
      // Filtrar por organizador si está seleccionado (a través de eventos)
      if (this.organizadorFiltro && !this.eventoSeleccionado) {
        // Si hay filtro de organizador pero no evento específico, filtrar por eventos del organizador
        const eventosIds = this.eventos.map(e => e.id);
        compras = compras.filter((c: any) => eventosIds.includes(c.evento_id));
      }
      
      // Obtener solo compras completadas para ingresos y estadísticas principales
      const responseCompletadas = await this.comprasService.getCompras({
        ...filtersBase,
        estado_pago: 'completado'
      });
      let comprasCompletadas = responseCompletadas.data || [];
      
      // Filtrar por organizador si está seleccionado
      if (this.organizadorFiltro && !this.eventoSeleccionado) {
        const eventosIds = this.eventos.map(e => e.id);
        comprasCompletadas = comprasCompletadas.filter((c: any) => eventosIds.includes(c.evento_id));
      }
      
      // Calcular ingresos solo de compras completadas
      const totalIngresos = comprasCompletadas.reduce((sum: number, c: any) => sum + Number(c.total || 0), 0);
      
      this.reporteVentas = {
        totalCompras: compras.length,
        comprasCompletadas: comprasCompletadas.length,
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
