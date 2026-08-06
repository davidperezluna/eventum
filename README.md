# 🎉 Eventum - Panel de Administración

Panel de administración para la aplicación Eventum, sistema de venta de boletas online.

## 🚀 Características

- **Dashboard** - Vista general con estadísticas de eventos, boletas y ventas
- **Gestión de Eventos** - Crea y administra tus eventos
- **Gestión de Boletas** - Configura y gestiona las boletas de tus eventos
- **Ventas** - Revisa y gestiona todas tus ventas

## 📋 Requisitos

- Node.js 20 o superior
- npm 11 o superior

## 🛠️ Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Inicia el servidor de desarrollo:
```bash
npm start
```

3. Abre tu navegador en `http://localhost:4200`

## 🏗️ Build para Producción

Para construir la aplicación para producción (GitHub Pages):

```bash
npm run build:gh-pages
```

El build se generará en `dist/admin-panel/`

## 📦 Despliegue en GitHub Pages

Este proyecto está configurado para desplegarse automáticamente en GitHub Pages usando GitHub Actions.

### Configuración Inicial

1. **Habilita GitHub Pages en tu repositorio:**
   - Ve a **Settings** > **Pages** en tu repositorio de GitHub
   - En **Source**, selecciona **GitHub Actions**
   - Guarda los cambios

2. **El workflow se ejecutará automáticamente:**
   - Al hacer push a la rama `main` o `master`
   - O manualmente desde la pestaña **Actions** > **Deploy to GitHub Pages** > **Run workflow**

### URL de Despliegue

Una vez desplegado, tu aplicación estará disponible en:
```
https://[tu-usuario].github.io/[nombre-repositorio]/eventum-admin/
```

**Ejemplo:** Si tu usuario es `johndoe` y tu repositorio es `eventum`, la URL será:
```
https://johndoe.github.io/eventum/eventum-admin/
```

### Workflow de GitHub Actions

El workflow (`.github/workflows/deploy-gh-pages.yml`) realiza lo siguiente:

1. ✅ Verifica el código del repositorio
2. ✅ Configura Node.js 20
3. ✅ Instala las dependencias con `npm ci`
4. ✅ Construye la aplicación con `npm run build:gh-pages`
5. ✅ Despliega automáticamente a GitHub Pages

**Nota:** Asegúrate de actualizar el `base-href` en `angular.json` y `package.json` si cambias el nombre del repositorio o la ruta de despliegue.

## 📁 Estructura del Proyecto

```
admin-panel/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   └── layout/          # Componente de layout con sidebar
│   │   ├── pages/
│   │   │   ├── dashboard/       # Página principal
│   │   │   ├── eventos/        # Gestión de eventos
│   │   │   ├── boletas/        # Gestión de boletas
│   │   │   └── ventas/         # Gestión de ventas
│   │   ├── app.routes.ts       # Configuración de rutas
│   │   └── app.ts              # Componente principal
│   └── styles.css              # Estilos globales
├── .github/
│   └── workflows/
│       └── deploy-gh-pages.yml   # Workflow de GitHub Actions para GitHub Pages
└── angular.json                 # Configuración de Angular
```

## 🎨 Tecnologías Utilizadas

- **Angular 21** - Framework principal
- **TypeScript** - Lenguaje de programación
- **CSS3** - Estilos
- **GitHub Actions** - CI/CD

## 📝 Scripts Disponibles

- `npm start` - Inicia el servidor de desarrollo
- `npm run build` - Construye la aplicación para producción
- `npm run build:gh-pages` - Construye para GitHub Pages con base-href configurado
- `npm test` - Ejecuta las pruebas unitarias

## 🔧 Configuración

### Cambiar el base-href

Si necesitas cambiar la ruta base para GitHub Pages, actualiza:

1. `angular.json` - En la configuración de producción:
```json
"baseHref": "/tu-nueva-ruta/"
```

2. `package.json` - En el script `build:gh-pages`:
```json
"build:gh-pages": "ng build --configuration production --base-href /tu-nueva-ruta/"
```

## 📚 Documentación

- **[Flujo de compras y Wompi](FLUJO_COMPRAS_WOMPI.md)** — pagos, webhooks, materialización, reconciliación e idempotencia
- [Supabase setup](SUPABASE_SETUP.md)
- [Deploy producción](DEPLOY_PRODUCTION.md)

## 📄 Licencia

Este proyecto es parte de Eventum.
