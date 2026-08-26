# Auditoría CSS de `/eventos-cliente`

## Objetivo

Ordenar la cascada sin modificar el resultado visual en desktop o móvil. Esta auditoría trata la apariencia actual como contrato y evita consolidaciones masivas sin comparación visual automatizada.

## Orden de la cascada

Las hojas se cargan deliberadamente en este orden:

1. `eventos-cliente.css`: base histórica del componente, estados y tarjetas.
2. `eventos-cliente-fanpage-terminal.css`: overrides terminales extraídos mecánicamente del final de la base.
3. `eventos-cliente-fanpage.css`: composición general de fanpage y adaptación desktop.
4. `eventos-cliente-fanpage-final.css`: overrides compartidos que todavía dependen de la cascada histórica.
5. `eventos-cliente-fanpage-integrated.css`: módulo aislado de comunidad y preventa; es la única autoridad de `.fanpage-essentials--integrated`.

Cambiar este orden puede modificar especificidad efectiva aunque los selectores no cambien.

## Inventario inicial

- `eventos-cliente.css`: 6.323 líneas y 142,7 kB antes de separar los overrides terminales.
- `eventos-cliente-fanpage.css`: 1.173 líneas, 178 bloques aproximados.
- `eventos-cliente-fanpage-final.css`: 1.202 líneas antes de la limpieza.
- `eventos-cliente-fanpage-integrated.css`: 276 líneas, 29 bloques aproximados.

## Limpieza aplicada

- Eliminadas las reglas de `.fanpage-essentials--desktop-editorial`: la clase ya no existe en la plantilla.
- Eliminado un override intermedio de `.fanpage-essentials--integrated` que estaba completamente sustituido por la hoja integrada cargada al final.
- Separadas mecánicamente 2.231 líneas terminales de la base en `eventos-cliente-fanpage-terminal.css`, conservando su orden inmediatamente posterior.
- Documentado el orden de `styleUrls` para evitar regresiones de cascada.
- Se mantiene aislado el módulo integrado; no se trasladaron reglas activas entre breakpoints.

## Deuda identificada y no modificada

- La hoja base contiene varias generaciones de estilos para comunidad, preventa y tarjetas. Su consolidación requiere pruebas de regresión visual por breakpoint.
- Conviven breakpoints `700`, `701`, `768`, `769`, `900` y `901`. Son funcionales, pero deben normalizarse solo junto con snapshots visuales.
- Hay reglas `outline: none` con reemplazo visible mediante `box-shadow`; no deben eliminarse aisladamente.
- Los `!important` restantes corresponden principalmente a reducción de movimiento y reglas terminales históricas.
- `eventos-cliente-fanpage-final.css` conserva una versión temprana del módulo integrado. Está anulada por la hoja final, pero retirarla exige comparar todos los estilos calculados del módulo en desktop y móvil.

## Regla para cambios futuros

Cada bloque nuevo debe vivir en una sola hoja, usar una clase raíz propia y evitar selectores genéricos como `.products-reminder` fuera de esa raíz. Antes de mover reglas existentes, comparar desktop (`>= 901px`), tablet (`701–900px`) y móvil (`<= 700px`).
