# 📊 Ejemplos de Uso de Google Analytics

Este documento muestra ejemplos prácticos de cómo usar el servicio de Google Analytics en diferentes componentes de la aplicación.

## Funnel principal (implementado)

Los nombres van **en inglés** (estándar de GA4 y de Meta Pixel). En informes se leen así:

| Evento (código) | Qué significa | Cuándo se dispara |
|---|---|---|
| `view_item` | Vio boletas/productos del evento | Detalle de evento (tras cargar tipos). `item_name` = boleta/producto; `item_category` = título del evento |
| `view_evento` | Abrió un evento sin ítems | Solo si el evento no tiene boletas/productos |
| `add_to_cart` | Agregó algo al carrito | Al sumar boleta, producto o cover (`item_name` = SKU) |
| `begin_checkout` | Tocó Pagar | Al confirmar pago en `/carrito` (líneas del carrito) |
| `purchase` | Pagó de verdad | Pago confirmado en `/pago-resultado` (una vez por transacción) |

**Nombre del artículo en GA (modelo ticketing / Humanitix):**
- `item_name` = tipo de boleta / producto / cover  
- `item_category` = título del evento  
- `item_category2` = `boleta` \| `producto` \| `cover`

Solo se envían en **producción**. En **Informes → Tiempo real** se ven al momento; en **Informes → Eventos** pueden tardar varias horas.

Servicio: `src/app/services/google-analytics.service.ts`.

## Meta Pixel (mismo funnel)

Pixel ID en `environment.prod.ts` → `metaPixelId` (hoy: organizador cliente, global). Vacío en dev/mobile = no carga.

| GA4 | Meta Pixel | Cuándo |
|---|---|---|
| `page_view` (SPA) | `PageView` | Cada navegación |
| `view_item` (boletas) / `view_evento` | `ViewContent` (nombre del evento) | Detalle de evento |
| `add_to_cart` | `AddToCart` | Al sumar al carrito |
| `begin_checkout` | `InitiateCheckout` | Al confirmar pagar |
| `purchase` | `Purchase` | Pago confirmado (misma deduplicación) |

Implementación: `MetaPixelService` + los mismos métodos de `GoogleAnalyticsService` (no hace falta tocar cada página otra vez). Verificar en Meta → Events Manager → Test events / Overview tras desplegar producción.

## 🎯 Ejemplo 1: Trackear Visualización de Evento

Tras cargar tipos de boleta/productos en el detalle:

```typescript
this.gaService.trackEventoView({
  eventoId: evento.id,
  eventoTitulo: evento.titulo,
  items: tiposBoleta.map((t) => ({
    id: t.id,
    name: t.nombre,
    price: t.precio,
    category: 'boleta',
  })),
});
```

GA dispara `view_item` con esos ítems. Meta dispara `ViewContent` con el nombre del evento.

## 🛒 Ejemplo 2: Trackear Compra Completada

En `detalle-evento.ts` o `pago-resultado.ts`, trackear cuando se completa una compra:

```typescript
async procesarCompra() {
  // ... lógica de compra
  
  try {
    const resultado = await this.comprasClienteService.procesarCompra({
      // ... datos de compra
    });
    
    // Trackear compra completada
    this.gaService.trackPurchase(
      resultado.compra.total,
      resultado.compra.numero_transaccion,
      'COP',
      items.map(item => ({
        item_id: item.tipo.evento_id?.toString(),
        item_name: item.tipo.nombre,
        price: item.tipo.precio,
        quantity: item.cantidad
      }))
    );
    
    // ... resto del código
  } catch (err) {
    // ... manejo de errores
  }
}
```

## 🔍 Ejemplo 3: Trackear Búsqueda de Eventos

En `eventos-cliente.ts`, trackear cuando un usuario busca eventos:

```typescript
import { GoogleAnalyticsService } from '../../services/google-analytics.service';

constructor(
  // ... otros servicios
  private gaService: GoogleAnalyticsService
) {}

onSearch(searchTerm: string) {
  // ... lógica de búsqueda
  
  // Trackear búsqueda
  if (searchTerm && searchTerm.trim().length > 0) {
    this.gaService.trackSearch(searchTerm);
  }
}
```

## 🛍️ Ejemplo 4: Trackear Agregar al Carrito

En `detalle-evento.ts`, trackear cuando se agrega una boleta al carrito:

```typescript
agregarAlCarrito(tipo: TipoBoleta) {
  // ... lógica para agregar al carrito
  
  // Trackear agregar al carrito
  if (this.evento) {
    this.gaService.trackAddToCart(
      this.evento.id,
      this.evento.titulo,
      tipo.precio
    );
  }
}
```

## 👤 Ejemplo 5: Trackear Registro de Usuario

En `register.ts`, trackear cuando un usuario se registra:

```typescript
import { GoogleAnalyticsService } from '../../services/google-analytics.service';

constructor(
  // ... otros servicios
  private gaService: GoogleAnalyticsService
) {}

async register() {
  try {
    // ... lógica de registro
    
    await this.authService.register(/* datos */);
    
    // Trackear registro
    this.gaService.trackRegistration('email');
    
    // ... resto del código
  } catch (err) {
    // ... manejo de errores
  }
}
```

## 🔐 Ejemplo 6: Trackear Inicio de Sesión

En `login.ts`, trackear cuando un usuario inicia sesión:

```typescript
import { GoogleAnalyticsService } from '../../services/google-analytics.service';

constructor(
  // ... otros servicios
  private gaService: GoogleAnalyticsService
) {}

async login() {
  try {
    // ... lógica de login
    
    await this.authService.login(/* credenciales */);
    
    // Trackear inicio de sesión
    this.gaService.trackLogin('email');
    
    // ... resto del código
  } catch (err) {
    // ... manejo de errores
  }
}
```

## 🎫 Ejemplo 7: Trackear Inicio de Checkout

En `detalle-evento.ts`, trackear cuando un usuario inicia el proceso de compra:

```typescript
procesarCompra() {
  // Trackear inicio de checkout
  if (this.evento) {
    this.gaService.trackBeginCheckout(
      this.evento.id,
      this.getTotal()
    );
  }
  
  // ... resto de la lógica de compra
}
```

## 📱 Ejemplo 8: Evento Personalizado

Para cualquier evento personalizado que quieras trackear:

```typescript
// Trackear clic en botón específico
onButtonClick() {
  this.gaService.trackEvent('button_click', {
    button_name: 'ver_mas_eventos',
    location: 'homepage'
  });
}

// Trackear descarga de boleta
downloadBoleta(boletaId: number) {
  this.gaService.trackEvent('download_boleta', {
    boleta_id: boletaId,
    format: 'pdf'
  });
}

// Trackear compartir evento
shareEvento(eventoId: number, method: string) {
  this.gaService.trackEvent('share', {
    content_type: 'evento',
    item_id: eventoId.toString(),
    method: method // 'facebook', 'twitter', 'whatsapp', etc.
  });
}
```

## 🎨 Mejores Prácticas

1. **No trackear información sensible**: Nunca envíes datos personales sensibles (contraseñas, números de tarjeta, etc.)

2. **Usar nombres consistentes**: Mantén una convención de nombres para los eventos (snake_case es recomendado)

3. **Agregar contexto**: Siempre que sea posible, agrega parámetros adicionales que den contexto al evento

4. **Trackear solo en producción**: El servicio ya está configurado para solo trackear cuando `environment.production` es `true`

5. **Manejar errores silenciosamente**: El servicio maneja errores internamente, pero asegúrate de no romper la funcionalidad si hay un problema con GA

## Eventos recomendados para Eventum

Funnel (ya en código): `view_item`, `add_to_cart`, `begin_checkout`, `purchase`.

Opcionales (aún no cableados): `search`, `sign_up`, `login`, `share`, `download_boleta`.
