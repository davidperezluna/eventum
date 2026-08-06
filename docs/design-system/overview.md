# Visión general

## Principios

1. **Consistencia sobre creatividad local** — Los drawers de operaciones comparten la misma anatomía: lead, resumen, aviso opcional, formulario, footer fijo.
2. **Un scroll, un propósito** — El drawer bloquea el scroll de la página; solo el área de contenido del panel scrollea (`ev-panel__body` o `ev-panel__scroll`).
3. **Feedback claro** — Avisos inline con `ev-notice`; confirmaciones y errores de acción con `AlertService` (SweetAlert2).
4. **Cambios sin guardar** — Los paneles con formulario implementan `EvDrawerContent` para interceptar el cierre.
5. **Mobile-first** — Drawers a pantalla completa en ≤768px; footers apilados; grids de formulario en 1 columna.

## Arquitectura de capas

```
ev-drawer (shell)
  └── app-evento-*-panel (:host flex column, height 100%)
        └── .ev-panel
              ├── .ev-panel__scroll | .ev-panel__body  ← único scroll
              │     ├── .ev-panel__lead
              │     ├── ev-panel-summary
              │     ├── ev-notice
              │     └── ev-panel-form → .ev-form
              └── ev-drawer-footer
```

## Archivos clave

| Ruta | Rol |
|------|-----|
| `src/app/components/ev-drawer/` | Shell lateral, host, skeleton, footer |
| `src/app/core/drawer/` | `DrawerService`, `DrawerRef`, tokens |
| `src/app/panels/evento-*/` | Módulos de operaciones por evento |
| `src/app/components/ev-panel/` | Barrel de componentes de panel |
| `src/app/components/ev-notice/` | Banners informativos unificados |
| `src/styles/ev-panel-system.css` | Clases de layout compartidas |
| `src/app/core/evento-readiness.ts` | Checklist de pasos del evento |

## Convenciones de nomenclatura

- **Componentes DS:** prefijo `ev-` (`ev-notice`, `ev-button`, `ev-panel-summary`).
- **Clases CSS:** BEM con prefijo de módulo (`.ev-panel__scroll`, `.ev-notice--warning`).
- **Paneles de evento:** carpeta `src/app/panels/evento-{modulo}/` con:
  - `evento-{modulo}-panel.ts|html|css`
  - `evento-{modulo}.types.ts`
  - `open-evento-{modulo}-drawer.ts`
  - `index.ts`

## Tipografía y color (drawers)

Los paneles usan la escala del form system:

| Elemento | Tamaño | Peso |
|----------|--------|------|
| Título drawer | 1.05rem | 700 |
| Lead del panel | 0.875rem | 400, muted |
| Título de sección (`ev-form-section`) | 0.9375rem | 700 |
| Labels de campo | 0.8125rem | 600 |
| Texto de aviso | 0.8125rem | 500 |
| Métricas resumen (valor) | 1.375rem | 800 |
| Métricas resumen (texto largo) | 0.9375rem | 600 |

Colores semánticos alineados con variantes de `ev-notice` y `ev-badge`:

- **Accent / info:** `#7c3aed` (primary)
- **Success:** `#059669`
- **Warning:** `#d97706`
- **Danger:** `#dc2626`
- **Muted:** `#64748b`

## Host del drawer

`ev-drawer-host` debe estar montado en el layout raíz (`layout.html`). Sin él, `DrawerService.open()` lanza error en consola.

```html
<!-- layout.html -->
<ev-drawer-host />
```

## Scrollbars

Los contenedores de scroll del panel usan scrollbars finos (4px) y baja opacidad. Al abrir un drawer se bloquean `html` y `body` con la clase `ev-drawer-open`.
