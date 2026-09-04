# 📊 Guía de Integración de Google Tag Manager

Esta guía te ayudará a integrar Google Tag Manager (GTM) en tu aplicación Angular Eventum. GTM permite gestionar múltiples herramientas de tracking (Google Analytics, Facebook Pixel, etc.) desde un solo lugar.

**Estado actual:** el sitio usa `gtag` (`GT-5TJZWP3P` → GA4 `G-46BBJ0FKE1`), no el snippet GTM. El funnel de compra está en `GOOGLE_ANALYTICS_EJEMPLOS.md` (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`). Meta Pixel del organizador (`metaPixelId` en `environment.prod.ts`) dispara los equivalentes estándar en los mismos puntos.

## 📋 Prerequisitos

1. Tener una cuenta de Google Tag Manager
2. Crear un contenedor de GTM
3. Obtener tu **Container ID** (formato: `GTM-XXXXXXX`)

## 🚀 Pasos de Implementación

### Paso 1: Obtener tu Container ID de Google Tag Manager

1. Ve a [Google Tag Manager](https://tagmanager.google.com/)
2. Selecciona tu cuenta y contenedor
3. En la parte superior verás tu **Container ID** (formato: `GTM-XXXXXXX`)
4. Copia este ID

### Paso 2: Agregar el ID a las Variables de Entorno

Edita los archivos de environment y agrega el ID de Google Tag Manager:

**`src/environments/environment.ts`** (Desarrollo):
```typescript
export const environment = {
  production: false,
  googleTagManagerId: 'GTM-XXXXXXX', // Tu Container ID
  // ... resto de la configuración
};
```

**`src/environments/environment.prod.ts`** (Producción):
```typescript
export const environment = {
  production: true,
  googleTagManagerId: 'GTM-XXXXXXX', // Tu Container ID
  // ... resto de la configuración
};
```

### Paso 3: Agregar el Script de Google Tag Manager en index.html

El código de GTM ya está agregado en `src/index.html`. Asegúrate de que el Container ID en el script coincida con el de tus variables de entorno:

```html
<head>
  <!-- ... otros meta tags ... -->
  
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
  <!-- End Google Tag Manager -->
</head>
<body>
  <!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->
</body>
```

**Nota:** Reemplaza `GTM-XXXXXXX` con tu Container ID real.

### Paso 4: Configurar Google Analytics en GTM

1. Ve a tu contenedor de GTM
2. Crea una nueva etiqueta (Tag) de tipo **Google Analytics: GA4 Configuration**
3. Configura tu Measurement ID de GA4
4. Crea un disparador (Trigger) para activar la etiqueta en todas las páginas
5. Publica los cambios

### Paso 5: El Servicio de Google Tag Manager

El servicio ya está creado en `src/app/services/google-analytics.service.ts`. Este servicio usa `dataLayer` para enviar eventos a GTM. Proporciona métodos para:

- Trackear eventos personalizados
- Trackear navegación de páginas
- Trackear conversiones (compras, registros, etc.)

### Paso 6: Configurar el Tracking de Navegación

El tracking de navegación se configura automáticamente cuando se inicializa el servicio. El servicio detecta cambios de ruta y envía eventos a GTM.

### Paso 6: Usar el Servicio en tus Componentes

Ejemplo de uso en cualquier componente:

```typescript
import { GoogleAnalyticsService } from '../../services/google-analytics.service';

constructor(private gaService: GoogleAnalyticsService) {}

// Trackear un evento personalizado
trackEvent() {
  this.gaService.trackEvent('button_click', {
    button_name: 'comprar_boleta',
    evento_id: 123
  });
}

// Trackear una compra
trackPurchase(total: number, transactionId: string) {
  this.gaService.trackPurchase(total, transactionId);
}
```

## 📈 Eventos Predefinidos

El servicio incluye métodos para trackear eventos comunes:

- `trackEvent()` - Evento personalizado
- `trackPageView()` - Vista de página
- `trackPurchase()` - Compra completada
- `trackRegistration()` - Registro de usuario
- `trackLogin()` - Inicio de sesión
- `trackSearch()` - Búsqueda

## 🔍 Verificar la Instalación

### Verificar GTM

1. Abre tu aplicación en el navegador
2. Abre las herramientas de desarrollador (F12)
3. Ve a la pestaña **Console**
4. Escribe `dataLayer` y presiona Enter
5. Deberías ver un array con eventos si GTM está funcionando

### Verificar en Google Tag Manager

1. Ve a tu contenedor de GTM
2. Haz clic en **Vista previa** (Preview)
3. Ingresa la URL de tu aplicación
4. Deberías ver eventos en tiempo real en la interfaz de vista previa

### Verificar en Google Analytics

1. Ve a Google Analytics → **Informes** → **Tiempo real**
2. Deberías ver actividad en tiempo real si la integración está funcionando

## 🎯 Eventos Recomendados para Trackear

Para tu aplicación Eventum, considera trackear:

- **Compras de boletas**: Cuando un usuario completa una compra
- **Visualizaciones de eventos**: Cuando un usuario ve el detalle de un evento
- **Búsquedas**: Cuando un usuario busca eventos
- **Registros**: Cuando un nuevo usuario se registra
- **Inicios de sesión**: Cuando un usuario inicia sesión
- **Clics en botones importantes**: "Comprar", "Ver más", etc.

## 📝 Notas Importantes

- **Privacidad**: Asegúrate de cumplir con las políticas de privacidad (GDPR, CCPA, etc.)
- **Consentimiento**: Considera implementar un banner de consentimiento de cookies. GTM tiene soporte para consentimiento con Consent Mode v2
- **Desarrollo**: El tracking solo funciona en producción o cuando `environment.production` es `true`
- **Testing**: Usa la extensión [Google Tag Assistant](https://chrome.google.com/webstore/detail/tag-assistant-legacy-by-g/kejbdjndbnbjgmefkgdddjlbokphdefk) para Chrome
- **dataLayer**: Todos los eventos se envían a través de `dataLayer.push()`, que es compatible con GTM

## 🐛 Solución de Problemas

### No veo datos en Google Analytics

1. Verifica que GTM esté correctamente configurado con Google Analytics
2. Verifica que las etiquetas de GA4 estén publicadas en GTM
3. Asegúrate de que estás en modo producción (`environment.production = true`)
4. Espera 24-48 horas para ver datos en los informes estándar (los informes en tiempo real funcionan inmediatamente)
5. Verifica la consola del navegador por errores
6. Usa la vista previa de GTM para verificar que los eventos se están enviando

### El script de GTM no se carga

1. Verifica que el script esté en el `<head>` del `index.html`
2. Verifica que el noscript esté en el `<body>` del `index.html`
3. Verifica que el Container ID sea correcto
4. Verifica que no haya bloqueadores de anuncios activos
5. Verifica la conexión a internet

### Los eventos no se envían

1. Verifica que `dataLayer` esté definido en la consola del navegador
2. Verifica que los eventos se estén enviando con `dataLayer.push()`
3. Usa la vista previa de GTM para verificar los eventos en tiempo real
4. Verifica que las etiquetas en GTM estén configuradas para escuchar los eventos correctos

## 📚 Recursos Adicionales

- [Documentación oficial de Google Tag Manager](https://developers.google.com/tag-manager)
- [Guía de dataLayer](https://developers.google.com/tag-manager/devguide)
- [Documentación oficial de Google Analytics 4](https://developers.google.com/analytics/devguides/collection/ga4)
- [Guía de eventos de GA4](https://developers.google.com/analytics/devguides/collection/ga4/events)
- [Mejores prácticas de GTM](https://support.google.com/tagmanager/answer/6102821)
