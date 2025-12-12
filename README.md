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

### Configuración Manual

1. Ve a la configuración de tu repositorio en GitHub
2. Navega a **Settings** > **Pages**
3. En **Source**, selecciona **GitHub Actions**
4. El workflow se ejecutará automáticamente cuando hagas push a la rama `main` o `master`

### URL de Despliegue

Una vez desplegado, tu aplicación estará disponible en:
```
https://[tu-usuario].github.io/[nombre-repositorio]/eventum-admin/
```

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
│       └── deploy.yml           # Workflow de GitHub Actions
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

## 📄 Licencia

Este proyecto es parte de Eventum.
