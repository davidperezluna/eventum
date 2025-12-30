import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { Evento, CategoriaEvento, TipoEstadoEvento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-eventos-cliente',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './eventos-cliente.html',
  styleUrl: './eventos-cliente.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class EventosCliente implements OnInit, OnDestroy {
  @ViewChild('carouselTrack') carouselTrack!: ElementRef;

  eventos: Evento[] = [];
  eventosFiltrados: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  loading = false;
  searchTerm = '';
  categoriaFiltro: number | null = null;

  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  currentYear = new Date().getFullYear();

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadCategorias();
    this.loadEventos();

    // Configurar búsqueda con debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500), // Esperar 500ms después de que el usuario deje de escribir
      distinctUntilChanged() // Solo buscar si el término cambió
    ).subscribe(term => {
      this.loadEventos(term);
    });
  }

  ngOnDestroy() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  async loadCategorias() {
    try {
      const response = await this.categoriasService.getCategorias({ limit: 100, activo: true });
      this.categorias = response.data || [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando categorías:', err);
      this.categorias = [];
      this.cdr.detectChanges();
    }
  }

  async loadEventos(searchTerm?: string) {
    this.loading = true;
    this.cdr.detectChanges();

    console.log('Cargando eventos. Búsqueda:', searchTerm);

    const loadEventosWithFallback = async (filters: any) => {
      try {
        return await this.eventosService.getEventos({
          ...filters,
          limit: 100,
          sortBy: 'fecha_inicio',
          sortOrder: 'asc'
        });
      } catch (err) {
        return { data: [], total: 0, page: 1, limit: 100, totalPages: 0 };
      }
    };

    try {
      // Filtros base
      const filters: any = {
        activo: true,
        estado: TipoEstadoEvento.PUBLICADO
      };

      // Agregar término de búsqueda si existe
      if (searchTerm) {
        filters.search = searchTerm;
      }

      let response = await loadEventosWithFallback(filters);
      let eventos = response.data || [];

      // Fallback si no hay eventos PUBLICADOS (solo para carga inicial sin búsqueda, opcional)
      // Si estamos buscando, queremos resultados exactos, no fallbacks extraños.
      if (eventos.length === 0 && !searchTerm) {
        const fallbackFilters: any = { activo: true };
        response = await loadEventosWithFallback(fallbackFilters);
        eventos = response.data || [];
      }

      this.procesarEventos(eventos);
    } catch (err) {
      console.error('Error cargando eventos:', err);
      this.procesarEventos([]);
    }
  }

  procesarEventos(eventos: Evento[]) {
    this.eventos = eventos.filter(e => e.activo === true);
    // Ya no filtramos localmente por search, el servidor ya lo hizo
    this.aplicarFiltrosLocales();
    this.loading = false;
    this.cdr.detectChanges();
  }

  aplicarFiltrosLocales() {
    let filtrados = [...this.eventos];

    // Solo filtrar por categoría localmente si no filtramos en servidor (que no lo estamos haciendo ahora, solo search)
    // Nota: Podríamos mover también el filtro de categoría al servidor, pero por ahora local está bien si cargamos pocos
    if (this.categoriaFiltro) {
      filtrados = filtrados.filter(e => e.categoria_id === this.categoriaFiltro);
    }

    this.eventosFiltrados = filtrados;
  }

  get eventosDestacados(): Evento[] {
    // Si hay búsqueda activa, no mostramos destacados separados
    if (this.searchTerm) return [];
    return this.eventos.filter(e => e.destacado);
  }

  get eventosRegulares(): Evento[] {
    return this.eventosFiltrados;
  }

  setCategoria(id: number | null) {
    this.categoriaFiltro = id;
    this.aplicarFiltrosLocales();
  }

  onSearchChange() {
    // Emitir al subject en lugar de filtrar inmediatamente
    this.searchSubject.next(this.searchTerm);
  }

  getCategoryIcon(cat: CategoriaEvento): string {
    if (cat.icono && cat.icono.trim().length > 1) {
      return cat.icono;
    }
    return 'pricetag';
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
    return evento.imagen_principal || '/assets/placeholder-event.jpg';
  }

  scrollLeft() {
    if (this.carouselTrack) {
      this.carouselTrack.nativeElement.scrollBy({ left: -250, behavior: 'smooth' });
    }
  }

  scrollRight() {
    if (this.carouselTrack) {
      this.carouselTrack.nativeElement.scrollBy({ left: 250, behavior: 'smooth' });
    }
  }
}
