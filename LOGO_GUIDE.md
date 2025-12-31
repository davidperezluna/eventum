# 🎨 Guía de Logotipos Eventum

## 📁 Archivos Creados

He creado 4 variantes del logotipo de Eventum en formato SVG:

### 1. **logo-eventum.svg** (Versión Completa)
- **Tamaño:** 200x200px
- **Uso:** Favicon, iconos grandes, presentaciones
- **Características:** 
  - Icono circular con "E" central
  - Rayos de luz/fiesta alrededor
  - Gradiente púrpura-azul (#818cf8 a #c084fc)

### 2. **logo-eventum-horizontal.svg** (Versión Horizontal)
- **Tamaño:** 300x80px
- **Uso:** Header, navbar, documentos
- **Características:**
  - Icono circular + texto "Eventum"
  - Diseño horizontal compacto
  - Ideal para barras de navegación

### 3. **logo-eventum-icon.svg** (Icono de App)
- **Tamaño:** 120x120px
- **Uso:** App móvil, iconos de escritorio, favicon
- **Características:**
  - Diseño de calendario/evento estilizado
  - Círculo con gradiente
  - Minimalista y reconocible

### 4. **logo-eventum-minimal.svg** (Versión Minimalista)
- **Tamaño:** 150x150px
- **Uso:** Cuando necesitas algo simple y elegante
- **Características:**
  - Solo la letra "E" estilizada
  - Diseño geométrico moderno
  - Perfecto para espacios pequeños

## 🎨 Paleta de Colores

Los logotipos usan la paleta de colores de tu aplicación:

- **Púrpura claro:** `#818cf8`
- **Púrpura medio:** `#a78bfa`
- **Púrpura oscuro:** `#6366f1`
- **Violeta:** `#c084fc`
- **Violeta oscuro:** `#8b5cf6`

## 📱 Cómo Usar

### En el HTML (como imagen)
```html
<img src="/logo-eventum-horizontal.svg" alt="Eventum" />
```

### En CSS (como background)
```css
.logo {
  background-image: url('/logo-eventum.svg');
  background-size: contain;
  background-repeat: no-repeat;
}
```

### Como Favicon
1. Convierte `logo-eventum-icon.svg` a `.ico` o `.png`
2. Usa herramientas como:
   - [RealFaviconGenerator](https://realfavicongenerator.net/)
   - [Favicon.io](https://favicon.io/)

### En React/Angular
```typescript
<img src="assets/logo-eventum-horizontal.svg" alt="Eventum" />
```

## 🔧 Personalización

### Cambiar Colores

Edita los valores en el SVG:

```xml
<!-- Cambiar estos valores -->
<stop offset="0%" style="stop-color:#818cf8;stop-opacity:1" />
<stop offset="100%" style="stop-color:#c084fc;stop-opacity:1" />
```

### Cambiar Tamaño

Los SVG son escalables, pero puedes ajustar el `viewBox`:

```xml
<!-- Para hacer más grande -->
<svg width="400" height="400" viewBox="0 0 200 200">
```

### Exportar a PNG/JPEG

1. Abre el SVG en un editor (Inkscape, Illustrator, Figma)
2. Exporta en el tamaño que necesites
3. Recomendaciones:
   - Favicon: 32x32, 64x64, 128x128
   - Header: 200-300px de ancho
   - App icon: 512x512, 1024x1024

## 🚀 Integración en la Aplicación

### Actualizar el Favicon

1. Copia `logo-eventum-icon.svg` a `public/favicon.ico` (convertido)
2. O actualiza `index.html`:
```html
<link rel="icon" type="image/svg+xml" href="/logo-eventum-icon.svg" />
```

### Actualizar el Header

En tu componente de layout, reemplaza el logo actual:

```html
<a href="/" class="brand-logo">
  <img src="/logo-eventum-horizontal.svg" alt="Eventum" height="40" />
</a>
```

### Actualizar la Página de Login

```html
<div class="logo-icon">
  <img src="/logo-eventum.svg" alt="Eventum" width="80" />
</div>
```

## 💡 Recomendaciones

1. **Para producción:** Convierte los SVG a PNG en diferentes tamaños para mejor compatibilidad
2. **Optimización:** Usa [SVGO](https://github.com/svg/svgo) para optimizar los SVG
3. **Variantes:** Crea versiones en blanco y negro para fondos oscuros/claros
4. **Marca de agua:** Usa la versión minimalista como marca de agua

## 🎯 Próximos Pasos

1. ✅ Revisa los logotipos y elige tu favorito
2. ✅ Personaliza los colores si es necesario
3. ✅ Integra en la aplicación
4. ✅ Crea variantes (blanco/negro) si lo necesitas
5. ✅ Genera favicons en diferentes tamaños

## 📝 Notas de Diseño

- **Estilo:** Moderno, festivo, vibrante
- **Inspiración:** Eventos, fiestas, celebración
- **Tipografía:** Arial (puedes cambiar a tu fuente preferida)
- **Forma:** Circular, orgánica, con elementos de luz/fiesta

¿Quieres que cree alguna variante adicional o ajuste algún diseño específico?

