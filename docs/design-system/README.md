# Eventum Design System

Documentación del sistema de diseño compartido para la interfaz de organizadores: drawers, paneles, formularios, avisos y patrones de interacción.

## Alcance actual

El Design System cubre principalmente el **Centro de Operaciones del evento** (`/eventos/:id/operaciones`) y los módulos que se abren como drawers laterales. Las páginas legacy (wizard de eventos, listados antiguos) aún usan estilos propios y se irán migrando progresivamente.

## Índice

| Documento | Contenido |
|-----------|-----------|
| [Visión general](./overview.md) | Principios, archivos CSS, imports y convenciones |
| [Drawers y paneles](./drawers.md) | `ev-drawer`, `DrawerService`, patrón de módulos por evento |
| [Crear un drawer nuevo](./creating-a-drawer.md) | Guía paso a paso con plantillas de código |
| [Componentes](./components.md) | API de `ev-notice`, `ev-badge`, `ev-panel-*`, `ev-button`, etc. |
| [Patrones](./patterns.md) | Footers, alertas modales, formularios, checklist de readiness |

## Documentación de producto

| Documento | Contenido |
|-----------|-----------|
| [Centro de Operaciones](../centro-de-operaciones.md) | Flujos, checklist, lifecycle, reglas de publicación |
| [Centro de Inteligencia (diseño)](../evento-intelligence-dashboard.md) | Wireframes, arquitectura, datos, empty states — **pendiente aprobación** |

## Drawers implementados

| Módulo | Tamaño | Ruta helper | Query param |
|--------|--------|-------------|-------------|
| Boletas | `xl` | `openEventoBoletasDrawer()` | `?open=boletas` |
| Productos | `xl` | `openEventoProductosDrawer()` | `?open=productos` |
| Fechas y lugar | `md` | `openEventoFechasDrawer()` | `?open=fechas` |
| Cobros | `md` | `openEventoCobrosDrawer()` | `?open=cobros` |
| Cupones | `md` | `openEventoCuponesDrawer()` | `?open=cupones` |
| Imagen | `md` | `openEventoImagenDrawer()` | `?open=imagen` |

## Referencia rápida de imports

```typescript
// Componentes de panel (barrel)
import {
  EvNotice,
  EvBadge,
  EvEmptyState,
  EvPanelSummary,
  EvPanelCard,
  EvPanelForm,
} from '../../components/ev-panel';

// Drawer
import { DrawerService, DrawerRef, EV_DRAWER_DATA } from '../../core/drawer';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
```

## CSS global (ya importado en `styles.css`)

```
src/styles/ev-form-system.css    → Formularios (.ev-form, .ev-field, .ev-input)
src/styles/ev-drawer-system.css  → Footer del drawer
src/styles/ev-panel-system.css   → Layout de paneles, overview, listas
src/styles/ev-button-system.css  → Botones compartidos
src/styles/ev-select-theme.css   → Tema ng-select
```

## Estado del roadmap

- ✅ Drawers de operaciones (6 módulos)
- ✅ Componentes DS consolidados (`ev-notice`, `ev-panel-*`, footers unificados)
- 🔜 Wizard reducido → drawers
- 🔜 Mis Eventos → operaciones + drawers
- 🔜 Dashboard organizador
