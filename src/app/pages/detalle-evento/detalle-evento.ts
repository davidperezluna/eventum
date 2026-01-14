import { Component, OnInit, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { CuponesService } from '../../services/cupones.service';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { LugaresService } from '../../services/lugares.service';
import { CategoriasService } from '../../services/categorias.service';
import { WompiService } from '../../services/wompi.service';
import { SupabaseService } from '../../services/supabase.service';
import { AlertService } from '../../services/alert.service';
import { Evento, TipoBoleta, Usuario, Lugar, CategoriaEvento, TipoEstadoEvento, CuponDescuento } from '../../types';
import { supabaseConfig } from '../../config/supabase.config';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-detalle-evento',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
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

  // Cupones
  codigoCupon: string = '';
  cuponAplicado: CuponDescuento | null = null;
  validandoCupon = false;

  // Datos de compra
  itemsCompra: {
    tipo: TipoBoleta; cantidad: number; datosAsistente: {
      nombre?: string;
      documento?: string;
      email?: string;
      telefono?: string;
    }
  }[] = [];

  // Método de pago será determinado por Wompi
  metodoPagoSeleccionado: 'CARD' | 'PSE' | 'NEQUI' | 'BANCOLOMBIA_TRANSFER' | 'BANCOLOMBIA_COLLECT' | 'DAVIPLATA' = 'CARD';

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private cuponesService: CuponesService,
    private comprasClienteService: ComprasClienteService,
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private lugaresService: LugaresService,
    private categoriasService: CategoriasService,
    private wompiService: WompiService,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const eventoId = this.route.snapshot.paramMap.get('id');
    if (eventoId) {
      this.loadEvento(Number(eventoId));
    }
    this.loadUsuario();
  }

  loadUsuario() {
    const usuarioId = this.authService.getUsuarioId();
    if (usuarioId) {
      this.loadUsuarioById(usuarioId);
    } else {
      // Si no hay usuario autenticado, no cargar datos del usuario
      this.usuario = null;
    }
  }

  async loadUsuarioById(usuarioId: number) {
    try {
      const usuario = await this.usuariosService.getUsuarioById(usuarioId);
      this.usuario = usuario;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando información del usuario:', err);
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
      this.alertService.warning('Perfil incompleto', 'No tienes información guardada en tu perfil. Completa tu perfil primero.');
    }
  }

  async loadEvento(id: number) {
    this.loading = true;
    try {
      // Cargar evento primero
      const evento = await this.eventosService.getEventoById(id);
      
      // Verificar si el evento ha finalizado y actualizar su estado solo si es cliente o no está logueado (versión pública)
      const esCliente = this.authService.isCliente();
      const noLogueado = !this.authService.getUsuarioId();
      
      if (esCliente || noLogueado) {
        await this.eventosService.verificarEventoFinalizado(id, true);
        // Recargar el evento para obtener el estado actualizado
        const eventoActualizado = await this.eventosService.getEventoById(id);
        this.evento = eventoActualizado;
      } else {
        this.evento = evento;
      }

      // Preparar promesas para carga en paralelo
      const promesas: Promise<any>[] = [];

      // Agregar carga de lugar si existe
      if (evento.lugar_id) {
        promesas.push(this.loadLugar(evento.lugar_id));
      }

      // Agregar carga de categoría si existe
      if (evento.categoria_id) {
        promesas.push(this.loadCategoria(evento.categoria_id));
      }

      // Agregar carga de tipos de boleta solo si el evento no está finalizado
      const ahora = new Date();
      const fechaFin = new Date(this.evento.fecha_fin);
      const estaFinalizado = this.evento.estado === TipoEstadoEvento.FINALIZADO || 
                            this.evento.estado === TipoEstadoEvento.CANCELADO ||
                            fechaFin < ahora;
      
      if (!estaFinalizado) {
        promesas.push(this.loadTiposBoleta(id));
      } else {
        // Si está finalizado, asegurar que no hay boletas
        this.tiposBoleta = [];
        this.loadingBoletas = false;
      }

      // Esperar a que todas las cargas terminen en paralelo
      await Promise.all(promesas);

      // Actualizar estado y vista después de que todo esté cargado
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando evento:', err);
      this.loading = false;
      this.router.navigate(['/eventos-cliente']);
    }
  }

  async loadCategoria(categoriaId: number) {
    this.loadingCategoria = true;
    try {
      const categoria = await this.categoriasService.getCategoriaById(categoriaId);
      this.categoria = categoria;
      this.loadingCategoria = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando categoría:', err);
      this.categoria = null;
      this.loadingCategoria = false;
      this.cdr.detectChanges();
      // No lanzar el error para que no rompa la carga del evento
    }
  }

  async loadLugar(lugarId: number) {
    this.loadingLugar = true;
    try {
      const lugar = await this.lugaresService.getLugarById(lugarId);
      this.lugar = lugar;
      this.loadingLugar = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando lugar:', err);
      this.lugar = null;
      this.loadingLugar = false;
      this.cdr.detectChanges();
      // No lanzar el error para que no rompa la carga del evento
    }
  }

  async loadTiposBoleta(eventoId: number) {
    this.loadingBoletas = true;
    try {
      const tipos = await this.boletasService.getTiposBoleta(eventoId);
      this.tiposBoleta = tipos.filter(t => t.activo && (t.cantidad_disponibles ?? 0) > 0);
      this.loadingBoletas = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando tipos de boleta:', err);
      this.tiposBoleta = [];
      this.loadingBoletas = false;
      this.cdr.detectChanges();
      // No lanzar el error para que no rompa la carga del evento
    }
  }

  isEventoFinalizado(): boolean {
    if (!this.evento) return false;
    const ahora = new Date();
    const fechaFin = new Date(this.evento.fecha_fin);
    return this.evento.estado === TipoEstadoEvento.FINALIZADO || 
           this.evento.estado === TipoEstadoEvento.CANCELADO ||
           fechaFin < ahora;
  }

  agregarAlCarrito(tipo: TipoBoleta) {
    const existente = this.itemsCompra.find(item => item.tipo.id === tipo.id);
    if (existente) {
      if (existente.cantidad < tipo.cantidad_disponibles) {
        existente.cantidad++;
      } else {
        this.alertService.warning('Stock limitado', `Solo hay ${tipo.cantidad_disponibles} boletas disponibles`);
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
    const subtotal = this.itemsCompra.reduce((sum, item) => sum + (item.tipo.precio * item.cantidad), 0);
    if (this.cuponAplicado) {
      const descuento = (subtotal * this.cuponAplicado.porcentaje_descuento) / 100;
      return subtotal - descuento;
    }
    return subtotal;
  }

  getSubtotal(): number {
    return this.itemsCompra.reduce((sum, item) => sum + (item.tipo.precio * item.cantidad), 0);
  }

  getDescuento(): number {
    if (!this.cuponAplicado) return 0;
    const subtotal = this.getSubtotal();
    return (subtotal * this.cuponAplicado.porcentaje_descuento) / 100;
  }

  async aplicarCupon() {
    if (!this.codigoCupon || !this.evento) return;

    this.validandoCupon = true;
    try {
      const cupon = await this.cuponesService.validarCupon(this.codigoCupon, this.evento.id);
      if (cupon) {
        this.cuponAplicado = cupon;
        this.alertService.success('¡Cupón aplicado!', `Se ha aplicado un descuento del ${cupon.porcentaje_descuento}%`);
      } else {
        this.alertService.error('Cupón inválido', 'El código ingresado no existe, ya expiró o alcanzó su límite de usos');
        this.cuponAplicado = null;
      }
    } catch (err) {
      console.error('Error aplicando cupón:', err);
      this.alertService.error('Error', 'Hubo un error al validar el cupón');
    } finally {
      this.validandoCupon = false;
      this.cdr.detectChanges();
    }
  }

  quitarCupon() {
    this.cuponAplicado = null;
    this.codigoCupon = '';
    this.cdr.detectChanges();
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
      this.alertService.warning('Carrito vacío', 'Debes agregar al menos una boleta al carrito');
      return;
    }

    // Validar que el evento no haya finalizado (solo para clientes - versión pública)
    const ahora = new Date();
    const fechaFin = new Date(this.evento.fecha_fin);
    
    if (fechaFin < ahora) {
      // El evento ya finalizó, actualizar estado solo si es cliente y no permitir compra
      const esCliente = this.authService.isCliente();
      
      if (esCliente) {
        try {
          await this.eventosService.updateEvento(this.evento.id, {
            estado: TipoEstadoEvento.FINALIZADO,
            activo: false
          });
          this.alertService.error(
            'Evento finalizado', 
            'Este evento ya finalizó. No se pueden comprar más boletas.'
          );
          // Recargar el evento para reflejar el cambio de estado
          await this.loadEvento(this.evento.id);
        } catch (err) {
          console.error('Error actualizando estado del evento:', err);
          this.alertService.error(
            'Evento finalizado', 
            'Este evento ya finalizó. No se pueden comprar más boletas.'
          );
        }
      } else {
        // Si no es cliente, solo mostrar el error sin actualizar
        this.alertService.error(
          'Evento finalizado', 
          'Este evento ya finalizó. No se pueden comprar más boletas.'
        );
      }
      return;
    }

    // Verificar autenticación antes de comprar
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      this.alertService.warning('Inicia sesión para continuar', 'Debes iniciar sesión para comprar boletas');
      this.router.navigate(['/login'], { queryParams: { returnUrl: `/detalle-evento/${this.evento.id}` } });
      return;
    }

    // Validar datos de asistente para cada boleta
    for (const item of this.itemsCompra) {
      if (!item.datosAsistente.nombre || !item.datosAsistente.documento) {
        this.alertService.warning('Datos incompletos', 'Debes completar el nombre y documento del asistente para todas las boletas');
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
    try {
      const validacion = await this.comprasClienteService.validarDisponibilidad(items);

      if (!validacion.valido) {
        this.alertService.error('Error de disponibilidad', validacion.errores.join('\n'));
        this.comprando = false;
        return;
      }

      // Procesar compra
      if (!this.evento) {
        this.alertService.error('Error', 'Error: evento no disponible');
        this.comprando = false;
        return;
      }

      // Crear la compra primero
      const resultado = await this.comprasClienteService.procesarCompra({
        evento_id: this.evento.id,
        cliente_id: clienteId,
        items,
        cupon_id: this.cuponAplicado?.id,
        descuento_total: this.getDescuento(),
        subtotal: this.getSubtotal(),
        total: this.getTotal()
      });

      console.log('Compra creada:', resultado.compra.id);

      // CASO ESPECIAL: 100% DESCUENTO (Total $0)
      if (resultado.compra.total === 0) {
        console.log('Compra gratuita detectada, confirmando directamente...');
        try {
          // Confirmar el pago directamente en la base de datos (omitiendo pasarela)
          await this.comprasClienteService.confirmarPago(resultado.compra.id);
          
          // También debemos actualizar los estados de las boletas a 'activo'
          // El trigger de la base de datos se encarga de esto al detectar el cambio en la compra
          
          this.alertService.success('¡Compra Exitosa!', 'Tu reserva se ha completado correctamente de forma gratuita.');
          this.router.navigate(['/pago-resultado'], { 
            queryParams: { 
              compra_id: resultado.compra.id,
              status: 'APPROVED'
            } 
          });
          return;
        } catch (confirmError) {
          console.error('Error confirmando compra gratuita:', confirmError);
          this.alertService.error('Error', 'Hubo un problema al procesar tu cupón del 100%');
          this.comprando = false;
          return;
        }
      }

      // Crear transacción en Wompi usando fetch directo (SOLO SI EL TOTAL > 0)
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
          this.alertService.error('Error de pago', 'Error: No se obtuvo la URL de pago de Wompi');
          this.comprando = false;
        }
      } catch (err: any) {
        console.error('Error creando transacción Wompi:', err);
        this.alertService.error('Error de pago', 'Error al crear transacción en Wompi: ' + (err.message || 'Error desconocido'));
        this.comprando = false;
      }
    } catch (err: any) {
      console.error('Error procesando compra:', err);
      this.alertService.error('Error al procesar compra', 'Error al procesar la compra: ' + (err.message || 'Error desconocido'));
      this.comprando = false;
    }
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

  getCategoryIcon(cat: CategoriaEvento): string {
    if (cat.icono && cat.icono.trim().length > 1) {
      return cat.icono;
    }
    return 'pricetag';
  }
}

