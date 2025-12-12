import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { Evento, CategoriaEvento, TipoEstadoEvento } from '../../types';

@Component({
  selector: 'app-eventos-cliente',
  imports: [CommonModule, RouterModule, FormsModule],
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

  loadCategorias() {
    this.categoriasService.getCategorias({ limit: 1000, activo: true }).subscribe({
      next: (response) => {
        this.categorias = response.data;
      },
      error: (err) => console.error('Error cargando categorías:', err)
    });
  }

  loadEventos() {
    this.loading = true;
    this.cdr.detectChanges();

    console.log('Cargando eventos para cliente...');
    
    // Primero intentar con estado PUBLICADO, si no hay resultados, intentar sin filtro de estado
    this.eventosService.getEventos({
      activo: true,
      estado: TipoEstadoEvento.PUBLICADO,
      limit: 1000,
      sortBy: 'fecha_inicio',
      sortOrder: 'asc'
    }).subscribe({
      next: (response) => {
        console.log('Eventos recibidos (con filtro PUBLICADO):', response);
        console.log('Total de eventos:', response.data?.length || 0);
        
        let eventos = response.data || [];
        
        // Si no hay eventos con estado PUBLICADO, intentar sin filtro de estado
        if (eventos.length === 0) {
          console.log('No hay eventos con estado PUBLICADO, intentando sin filtro de estado...');
          this.eventosService.getEventos({
            activo: true,
            limit: 1000,
            sortBy: 'fecha_inicio',
            sortOrder: 'asc'
          }).subscribe({
            next: (responseSinEstado) => {
              console.log('Eventos recibidos (sin filtro estado):', responseSinEstado);
              eventos = responseSinEstado.data || [];
              this.procesarEventos(eventos);
            },
            error: (err) => {
              console.error('Error cargando eventos sin filtro:', err);
              this.procesarEventos([]);
            }
          });
        } else {
          this.procesarEventos(eventos);
        }
      },
      error: (err) => {
        console.error('Error cargando eventos:', err);
        console.error('Detalles del error:', JSON.stringify(err, null, 2));
        // Intentar sin filtro de estado si falla
        console.log('Intentando cargar eventos sin filtro de estado...');
        this.eventosService.getEventos({
          activo: true,
          limit: 1000,
          sortBy: 'fecha_inicio',
          sortOrder: 'asc'
        }).subscribe({
          next: (response) => {
            this.procesarEventos(response.data || []);
          },
          error: (err2) => {
            console.error('Error cargando eventos sin filtro:', err2);
            this.procesarEventos([]);
          }
        });
      }
    });
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

