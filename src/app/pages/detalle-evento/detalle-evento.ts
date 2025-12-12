import { Component, OnInit, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { LugaresService } from '../../services/lugares.service';
import { CategoriasService } from '../../services/categorias.service';
import { WompiService } from '../../services/wompi.service';
import { SupabaseService } from '../../services/supabase.service';
import { Evento, TipoBoleta, Usuario, Lugar, CategoriaEvento } from '../../types';
import { supabaseConfig } from '../../config/supabase.config';

@Component({
  selector: 'app-detalle-evento',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './detalle-evento.html',
  styleUrl: './detalle-evento.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DetalleEvento implements OnInit {
  evento: Evento | null = null;
  tiposBoleta: TipoBoleta[] = [];
  lugar: Lugar | null = null;
  categoria: CategoriaEvento | null = null;
  loading = false;
  loadingBoletas = false;
  loadingLugar = false;
  loadingCategoria = false;
  comprando = false;
  usuario: Usuario | null = null;

  // Datos de compra
  itemsCompra: { tipo: TipoBoleta; cantidad: number; datosAsistente: {
    nombre?: string;
    documento?: string;
    email?: string;
    telefono?: string;
  } }[] = [];

  // Método de pago será determinado por Wompi
  metodoPagoSeleccionado: 'CARD' | 'PSE' | 'NEQUI' | 'BANCOLOMBIA_TRANSFER' | 'BANCOLOMBIA_COLLECT' = 'CARD';

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private comprasClienteService: ComprasClienteService,
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private lugaresService: LugaresService,
    private categoriasService: CategoriasService,
    private wompiService: WompiService,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const eventoId = this.route.snapshot.paramMap.get('id');
    if (eventoId) {
      this.loadEvento(Number(eventoId));
      this.loadTiposBoleta(Number(eventoId));
    }
    this.loadUsuario();
  }

  loadUsuario() {
    const usuarioId = this.authService.getUsuarioId();
    if (usuarioId) {
      this.usuariosService.getUsuarioById(usuarioId).subscribe({
        next: (usuario) => {
          this.usuario = usuario;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error cargando información del usuario:', err);
        }
      });
    }
  }

  getDatosUsuario() {
    if (!this.usuario) return null;
    return {
      nombre: this.usuario.nombre && this.usuario.apellido 
        ? `${this.usuario.nombre} ${this.usuario.apellido}`.trim()
        : this.usuario.nombre || '',
      documento: this.usuario.documento_identidad || '',
      email: this.usuario.email || '',
      telefono: this.usuario.telefono || ''
    };
  }

  usarMisDatos(item: any) {
    const datosUsuario = this.getDatosUsuario();
    if (datosUsuario) {
      item.datosAsistente = { ...datosUsuario };
      this.cdr.detectChanges();
    } else {
      alert('No tienes información guardada en tu perfil. Completa tu perfil primero.');
    }
  }

  loadEvento(id: number) {
    this.loading = true;
    this.eventosService.getEventoById(id).subscribe({
      next: (evento) => {
        this.evento = evento;
        this.loading = false;
        // Cargar lugar si existe
        if (evento.lugar_id) {
          this.loadLugar(evento.lugar_id);
        }
        // Cargar categoría
        if (evento.categoria_id) {
          this.loadCategoria(evento.categoria_id);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando evento:', err);
        this.loading = false;
        this.router.navigate(['/eventos-cliente']);
      }
    });
  }

  loadCategoria(categoriaId: number) {
    this.loadingCategoria = true;
    this.categoriasService.getCategoriaById(categoriaId).subscribe({
      next: (categoria) => {
        this.categoria = categoria;
        this.loadingCategoria = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando categoría:', err);
        this.loadingCategoria = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadLugar(lugarId: number) {
    this.loadingLugar = true;
    this.lugaresService.getLugarById(lugarId).subscribe({
      next: (lugar) => {
        this.lugar = lugar;
        this.loadingLugar = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando lugar:', err);
        this.loadingLugar = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadTiposBoleta(eventoId: number) {
    this.loadingBoletas = true;
    this.boletasService.getTiposBoleta(eventoId).subscribe({
      next: (tipos) => {
        this.tiposBoleta = tipos.filter(t => t.activo && t.cantidad_disponibles > 0);
        this.loadingBoletas = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando tipos de boleta:', err);
        this.loadingBoletas = false;
        this.cdr.detectChanges();
      }
    });
  }

  agregarAlCarrito(tipo: TipoBoleta) {
    const existente = this.itemsCompra.find(item => item.tipo.id === tipo.id);
    if (existente) {
      if (existente.cantidad < tipo.cantidad_disponibles) {
        existente.cantidad++;
      } else {
        alert(`Solo hay ${tipo.cantidad_disponibles} boletas disponibles`);
      }
    } else {
      if (tipo.cantidad_disponibles > 0) {
        // Pre-llenar con datos del usuario si existen
        const datosUsuario = this.getDatosUsuario();
        this.itemsCompra.push({
          tipo,
          cantidad: 1,
          datosAsistente: datosUsuario || {}
        });
      }
    }
    this.cdr.detectChanges();
  }

  quitarDelCarrito(tipo: TipoBoleta) {
    const index = this.itemsCompra.findIndex(item => item.tipo.id === tipo.id);
    if (index !== -1) {
      if (this.itemsCompra[index].cantidad > 1) {
        this.itemsCompra[index].cantidad--;
      } else {
        this.itemsCompra.splice(index, 1);
      }
    }
  }

  eliminarDelCarrito(tipo: TipoBoleta) {
    this.itemsCompra = this.itemsCompra.filter(item => item.tipo.id !== tipo.id);
  }

  getCantidadEnCarrito(tipo: TipoBoleta): number {
    const item = this.itemsCompra.find(i => i.tipo.id === tipo.id);
    return item ? item.cantidad : 0;
  }

  getTotal(): number {
    return this.itemsCompra.reduce((sum, item) => sum + (item.tipo.precio * item.cantidad), 0);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  async procesarCompra() {
    if (!this.evento || this.itemsCompra.length === 0) {
      alert('Debes agregar al menos una boleta al carrito');
      return;
    }

    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      alert('No se pudo identificar el cliente');
      return;
    }

    // Validar datos de asistente para cada boleta
    for (const item of this.itemsCompra) {
      if (!item.datosAsistente.nombre || !item.datosAsistente.documento) {
        alert('Debes completar el nombre y documento del asistente para todas las boletas');
        return;
      }
    }

    // Preparar items para compra
    const items: ItemCompra[] = this.itemsCompra.map(item => ({
      tipo_boleta_id: item.tipo.id,
      cantidad: item.cantidad,
      precio_unitario: item.tipo.precio,
      nombre_asistente: item.datosAsistente.nombre,
      documento_asistente: item.datosAsistente.documento,
      email_asistente: item.datosAsistente.email,
      telefono_asistente: item.datosAsistente.telefono
    }));

    // Validar disponibilidad
    this.comprando = true;
    this.comprasClienteService.validarDisponibilidad(items).subscribe({
      next: (validacion) => {
        if (!validacion.valido) {
          alert('Error de disponibilidad:\n' + validacion.errores.join('\n'));
          this.comprando = false;
          return;
        }

        // Procesar compra
        if (!this.evento) {
          alert('Error: evento no disponible');
          this.comprando = false;
          return;
        }

        // Crear la compra primero
        this.comprasClienteService.procesarCompra({
          evento_id: this.evento.id,
          cliente_id: clienteId,
          items
        }).subscribe({
          next: async (resultado) => {
            console.log('Compra creada:', resultado.compra.id);
            
            // Crear transacción en Wompi usando fetch directo
            const redirectUrl = `${window.location.origin}/pago-resultado?compra_id=${resultado.compra.id}`;
            
            try {
              // Obtener URL de Supabase y token de autenticación
              const supabaseUrl = supabaseConfig.url;
              const { data: { session } } = await this.supabaseService.auth.getSession();
              const accessToken = session?.access_token;
              
              if (!accessToken) {
                throw new Error('No se pudo obtener el token de autenticación');
              }
              
              // Obtener email del cliente
              const customerEmail = this.usuario?.email || items[0]?.email_asistente || '';
              
              // Llamar a la Edge Function con fetch directo
              const response = await fetch(
                `${supabaseUrl}/functions/v1/wompi-payment`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': supabaseConfig.anonKey
                  },
                  body: JSON.stringify({
                    compra_id: resultado.compra.id,
                    amount_in_cents: Math.round(resultado.compra.total * 100),
                    redirect_url: redirectUrl,
                    customer_email: customerEmail
                  })
                }
              );
              
              const responseData = await response.json();
              
              // Verificar si hay error en la respuesta
              if (!response.ok || !responseData.success) {
                throw new Error(responseData.error || 'Error al crear transacción en Wompi');
              }
              
              // La respuesta tiene checkout_url directamente o dentro de transaction
              const checkoutUrl = responseData.checkout_url || responseData.transaction?.checkout_url;
              
              if (checkoutUrl) {
                console.log('Redirigiendo a checkout de Wompi:', checkoutUrl);
                window.location.href = checkoutUrl;
              } else {
                console.error('Respuesta de Wompi:', responseData);
                alert('Error: No se obtuvo la URL de pago de Wompi');
                this.comprando = false;
              }
            } catch (err: any) {
              console.error('Error creando transacción Wompi:', err);
              alert('Error al crear transacción en Wompi: ' + (err.message || 'Error desconocido'));
              this.comprando = false;
            }
          },
          error: (err) => {
            console.error('Error procesando compra:', err);
            alert('Error al procesar la compra: ' + (err.message || 'Error desconocido'));
            this.comprando = false;
          }
        });
      },
      error: (err) => {
        console.error('Error validando disponibilidad:', err);
        alert('Error al validar disponibilidad');
        this.comprando = false;
      }
    });
  }

  getImageUrl(evento: Evento): string {
    if (evento.imagen_principal) {
      if (evento.imagen_principal.startsWith('http')) {
        return evento.imagen_principal;
      }
      return evento.imagen_principal;
    }
    return '/assets/placeholder-event.jpg';
  }

  getTags(): string[] {
    if (!this.evento?.tags) return [];
    return this.evento.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }
}

