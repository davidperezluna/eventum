# Diálogos del sistema (`ev-dialog`)

Sistema unificado de confirmaciones, alertas y toasts para **toda Eventum** (panel + cliente).

Reemplaza SweetAlert2 y el antiguo `client-confirm-dialog`.

## Arquitectura

```
layout.html
  └── ev-dialog-host          ← único host visual

EvDialogService               ← API programática (open, confirm, toast, presets)
AlertService                  ← wrapper legacy compatible (success, error, confirm…)
ClientConfirmDialogService    ← wrapper cliente → EvDialogService
```

Estilos: `src/styles/ev-dialog-system.css`

## Cuándo usar qué

| Situación | Usar |
|-----------|------|
| Info persistente en pantalla | `ev-notice` |
| Confirmación / eliminar / guardado | `AlertService` o `EvDialogService` |
| Toast no bloqueante | `AlertService.snackbar()` |
| Flujos cliente (carrito, traslados) | `ClientConfirmDialogService.confirm()` |

## API principal

```typescript
// AlertService — compatible con código existente
await this.alertService.success('Guardado', 'El cupón se creó correctamente.');
await this.alertService.error('Error', 'No se pudo guardar.');
await this.alertService.warning('Campo requerido', 'El nombre es obligatorio.');
await this.alertService.confirm('Eliminar cupón', '¿Estás seguro?', 'Sí, eliminar', 'Cancelar');
await this.alertService.confirmDestructive('¿Eliminar evento?', 'Se borrarán los datos asociados.');
await this.alertService.presetConfirm('delete-coupon', { message: 'El código FIESTA20 dejará de funcionar.' });

// EvDialogService — control total
await this.dialog.open({ title: '…', message: '…', tone: 'info' });
await this.dialog.preset('confirm-publish', { message: 'Tu evento quedará visible…' });
```

## Tonos visuales

| Tono | Uso |
|------|-----|
| `neutral` | Avisos simples |
| `confirm` | Decisión con dos caminos |
| `warning` | Validación / precaución |
| `info` | Información |
| `success` | Operación completada |
| `error` | Fallo de red o servidor |
| `destructive` | Acción irreversible |

Cada tono incluye ícono Material minimalista sobre fondo suave (no saturado).

## Presets disponibles

| Preset | Caso |
|--------|------|
| `confirm-publish` | Publicar evento |
| `delete-event` | Eliminar evento |
| `discard-changes` | Salir sin guardar |
| `saved` | Guardado correcto |
| `connection-error` | Sin conexión |
| `server-error` | Error del servidor |
| `warning` | Advertencia genérica |
| `info` | Información genérica |
| `logout` | Cerrar sesión |
| `delete-product` | Eliminar producto |
| `delete-palco` | Eliminar palco |
| `delete-coupon` | Eliminar cupón |
| `delete-ticket` | Eliminar tipo de boleta |

Los presets traen copy en lenguaje humano. Puedes sobreescribir `title`, `message`, `detail`, textos de botones, etc.

## Jerarquía visual

- **Título** grande, tracking negativo.
- **Mensaje** cuerpo legible, color muted.
- **Detail** línea auxiliar (consecuencias, consejo).
- **Botón primario** gradiente violeta (o rojo en destructivo).
- **Botón secundario** ghost casi invisible — no compite con la acción principal.

## Acciones destructivas

Usar `destructive: true`, tono `destructive` o preset `delete-*`:

- Borde y sombra del panel con tinte rojo suave.
- Ícono en fondo rojo pálido.
- Botón primario rojo (no solo el texto).
- `detail` por defecto: "No podrás deshacer esta acción."
- Sin cierre por click fuera (salvo override).

## Accesibilidad

- `role="dialog"` + `aria-modal="true"`.
- Cierre con **ESC** (configurable).
- Click fuera cuando `allowOutsideClick` (false en destructivos).
- Foco inicial en botón primario.
- `aria-busy` en estados de carga.

## Animaciones

- Backdrop: fade + blur progresivo.
- Panel: fade + translate/scale ligero (0.985 → 1).
- Toast: slide desde arriba.
- Respeta `prefers-reduced-motion`.

## Mensajes — tono de voz

Preferir consecuencias claras, no jerga técnica:

- ✅ "Tu evento quedará visible para los compradores."
- ✅ "No podrás deshacer esta acción."
- ❌ "Error 500 en endpoint /api/eventos"

## Host obligatorio

```html
<!-- layout.html -->
<ev-dialog-host />
```

Sin el host, `EvDialogService.open()` no muestra UI.
