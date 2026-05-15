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
  eventosFinalizados: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  loading = false;
  loadingFinalizados = false;
  /** Oculta el carrusel (incl. «Todo») hasta terminar la primera carga completa */
  initialBootstrapLoading = true;
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
    void this.loadEventos();

    // Configurar búsqueda con debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500), // Esperar 500ms después de que el usuario deje de escribir
      distinctUntilChanged() // Solo buscar si el término cambió
    ).subscribe(term => {
      void this.loadEventos(term);
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

    try {
      // Carga inicial: categorías y eventos en paralelo (solo la primera vez, searchTerm === undefined)
      if (searchTerm === undefined) {
        await Promise.all([this.loadCategorias(), this.executeLoadEventos(searchTerm)]);
      } else {
        await this.executeLoadEventos(searchTerm);
      }
      // Esperar finalizados antes de quitar el loader (misma vista inicial / sin búsqueda ni categoría)
      if (!this.searchTerm?.trim() && !this.categoriaFiltro) {
        await this.loadEventosFinalizados();
      } else {
        this.eventosFinalizados = [];
      }
    } finally {
      this.loading = false;
      if (searchTerm === undefined) {
        this.initialBootstrapLoading = false;
      }
      this.cdr.detectChanges();
    }
  }

  private async executeLoadEventos(searchTerm?: string) {
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
      const filters: any = {
        activo: true,
        estado: TipoEstadoEvento.PUBLICADO
      };

      if (searchTerm) {
        filters.search = searchTerm;
      }

      let response = await loadEventosWithFallback(filters);
      let eventos = response.data || [];

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
    const ahora = new Date();
    // Filtrar eventos activos y que no hayan finalizado (fecha_fin aún no ha pasado)
    this.eventos = eventos.filter(e => {
      if (e.activo !== true) return false;

      // Excluir eventos cuya fecha de finalización ya pasó
      if (e.fecha_fin) {
        const fechaFin = new Date(e.fecha_fin);
        if (fechaFin < ahora) return false;
      }

      return true;
    });

    // Ya no filtramos localmente por search, el servidor ya lo hizo
    this.aplicarFiltrosLocales();
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
    
    // Si se cambia la categoría, ocultar eventos finalizados
    if (id !== null) {
      this.eventosFinalizados = [];
    } else {
      this.loadEventosFinalizados();
    }
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm);

    if (this.searchTerm) {
      this.eventosFinalizados = [];
    }
    // Si se limpia la búsqueda, loadEventos('') (tras debounce) recarga lista + finalizados
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

  scrollCategories(direction: -1 | 1) {
    const el = this.carouselTrack?.nativeElement as HTMLElement | undefined;
    if (!el) return;
    const step = Math.min(320, Math.max(180, el.clientWidth * 0.45));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  async loadEventosFinalizados() {
    // Solo cargar eventos finalizados si no hay búsqueda activa ni filtro de categoría
    if (this.searchTerm?.trim() || this.categoriaFiltro) {
      this.eventosFinalizados = [];
      return;
    }

    this.loadingFinalizados = true;
    this.cdr.detectChanges();

    try {
      // Cargar eventos finalizados (estado finalizado)
      const response = await this.eventosService.getEventos({
        estado: TipoEstadoEvento.FINALIZADO,
        limit: 50,
        sortBy: 'fecha_fin',
        sortOrder: 'desc'
      });

      let eventos = response.data || [];
      
      // También incluir eventos cuya fecha_fin ya pasó pero aún no están marcados como finalizados
      // Solo buscar entre eventos publicados y activos
      const responseNoFinalizados = await this.eventosService.getEventos({
        activo: true,
        estado: TipoEstadoEvento.PUBLICADO,
        limit: 50,
        sortBy: 'fecha_fin',
        sortOrder: 'desc'
      });

      const ahoraDate = new Date();
      const eventosConFechaPasada = (responseNoFinalizados.data || []).filter(e => {
        if (e.fecha_fin) {
          const fechaFin = new Date(e.fecha_fin);
          return fechaFin < ahoraDate;
        }
        return false;
      });

      // Combinar y eliminar duplicados
      const todosEventos = [...eventos, ...eventosConFechaPasada];
      const eventosUnicos = todosEventos.filter((evento, index, self) =>
        index === self.findIndex(e => e.id === evento.id)
      );

      // Ordenar por fecha_fin descendente (más recientes primero)
      this.eventosFinalizados = eventosUnicos.sort((a, b) => {
        const fechaA = new Date(a.fecha_fin || 0).getTime();
        const fechaB = new Date(b.fecha_fin || 0).getTime();
        return fechaB - fechaA;
      }).slice(0, 20); // Limitar a 20 eventos

      this.loadingFinalizados = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando eventos finalizados:', err);
      this.eventosFinalizados = [];
      this.loadingFinalizados = false;
      this.cdr.detectChanges();
    }
  }
}
