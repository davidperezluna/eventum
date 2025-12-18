import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { Evento, CategoriaEvento, TipoEstadoEvento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-eventos-cliente',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './eventos-cliente.html',
  styleUrl: './eventos-cliente.css',
})
export class EventosCliente implements OnInit {
  eventos: Evento[] = [];
  eventosFiltrados: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  loading = false;
  searchTerm = '';
  categoriaFiltro: number | null = null;

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategorias();
    this.loadEventos();
  }

  async loadCategorias() {
    // Reducir límite para evitar timeouts - normalmente no hay más de 100 categorías
    try {
      const response = await this.categoriasService.getCategorias({ limit: 200, activo: true });
      this.categorias = response.data || [];
    } catch (err) {
      console.error('Error cargando categorías:', err);
      this.categorias = [];
    }
  }

  async loadEventos() {
    this.loading = true;
    this.cdr.detectChanges();

    console.log('Cargando eventos para cliente...');
    
    // Reducir el límite para evitar timeouts - 500 eventos deberían ser suficientes
    // Si necesitan más, pueden usar paginación
    const loadEventosWithFallback = async (filters: any) => {
      try {
        return await this.eventosService.getEventos({
          ...filters,
          limit: 500, // Reducido de 1000
          sortBy: 'fecha_inicio',
          sortOrder: 'asc'
        });
      } catch (err) {
        console.error('Error cargando eventos:', err);
        // Si falla con 500, intentar con 200
        if (filters.limit !== 200) {
          try {
            return await this.eventosService.getEventos({
              ...filters,
              limit: 200,
              sortBy: 'fecha_inicio',
              sortOrder: 'asc'
            });
          } catch {
            return { data: [], total: 0, page: 1, limit: 200, totalPages: 0 };
          }
        }
        return { data: [], total: 0, page: 1, limit: 200, totalPages: 0 };
      }
    };
    
    try {
      // Primero intentar con estado PUBLICADO
      const response = await loadEventosWithFallback({
        activo: true,
        estado: TipoEstadoEvento.PUBLICADO
      });
      
      console.log('Eventos recibidos (con filtro PUBLICADO):', response);
      let eventos = response.data || [];
      
      // Si no hay eventos con estado PUBLICADO, intentar sin filtro de estado
      if (eventos.length === 0) {
        console.log('No hay eventos con estado PUBLICADO, intentando sin filtro de estado...');
        try {
          const responseSinEstado = await loadEventosWithFallback({
            activo: true
          });
          console.log('Eventos recibidos (sin filtro estado):', responseSinEstado);
          eventos = responseSinEstado.data || [];
        } catch (err) {
          console.error('Error cargando eventos sin filtro:', err);
        }
      }
      
      this.procesarEventos(eventos);
    } catch (err) {
      console.error('Error final cargando eventos:', err);
      this.procesarEventos([]);
    }
  }

  procesarEventos(eventos: Evento[]) {
    // Solo filtrar eventos activos - mostrar todos los que vengan del backend
    // El backend ya filtra por activo=true y estado=publicado
    this.eventos = eventos.filter(evento => {
      // Solo asegurar que esté activo
      return evento.activo === true;
    });
    
    console.log('Eventos procesados:', this.eventos.length);
    console.log('Eventos después de filtrar:', this.eventos);
    this.aplicarFiltros();
    this.loading = false;
    this.cdr.detectChanges();
  }

  aplicarFiltros() {
    let filtrados = [...this.eventos];

    // Filtro por búsqueda
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtrados = filtrados.filter(evento =>
        evento.titulo?.toLowerCase().includes(term) ||
        evento.descripcion_corta?.toLowerCase().includes(term) ||
        evento.descripcion?.toLowerCase().includes(term)
      );
    }

    // Filtro por categoría
    if (this.categoriaFiltro) {
      filtrados = filtrados.filter(evento => evento.categoria_id === this.categoriaFiltro);
    }

    this.eventosFiltrados = filtrados;
  }

  onSearchChange() {
    this.aplicarFiltros();
  }

  onCategoriaChange() {
    this.aplicarFiltros();
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return 'Gratis';
    return new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getImageUrl(evento: Evento): string {
    if (evento.imagen_principal) {
      // Si es una URL completa, retornarla
      if (evento.imagen_principal.startsWith('http')) {
        return evento.imagen_principal;
      }
      // Si es una ruta de Supabase Storage
      return evento.imagen_principal;
    }
    return '/assets/placeholder-event.jpg';
  }
}

