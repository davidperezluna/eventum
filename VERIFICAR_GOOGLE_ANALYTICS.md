# 🔍 Guía para Verificar Google Analytics

## 📊 Estado Actual

Según la imagen que compartiste, veo que:
- ✅ **Flujo de datos creado** en Google Analytics
- ✅ **Measurement ID**: `G-46BBJ0FKE1`
- ✅ **GTM configurado** en el código: `GTM-PF5RX3R5`
- ⚠️ **Advertencia**: "La recogida de datos en tu sitio web no está activada"

Esto significa que **falta configurar la etiqueta de GA4 dentro de GTM**.

---

## ✅ Checklist de Verificación

### 1. Verificar en el Código

#### ✅ Google Tag Manager en index.html
- [x] Script de GTM en el `<head>`: `GTM-PF5RX3R5` ✅
- [x] Noscript de GTM en el `<body>`: `GTM-PF5RX3R5` ✅

#### ✅ Variables de Entorno
- [x] `googleTagManagerId: 'GTM-PF5RX3R5'` en `environment.prod.ts` ✅

**Estado del código: ✅ COMPLETO**

---

### 2. Verificar en Google Tag Manager

#### Paso 1: Verificar que GTM esté cargando
1. Abre tu sitio web: `https://www.eventumcol.com`
2. Abre la consola del navegador (F12)
3. Escribe: `dataLayer` y presiona Enter
4. **Deberías ver**: Un array con eventos como `gtm.start`, `gtm.dom`, `gtm.load`

**Si ves el array**: ✅ GTM está cargando correctamente
**Si no ves nada**: ❌ GTM no está cargando

#### Paso 2: Verificar etiquetas en GTM
1. Ve a [Google Tag Manager](https://tagmanager.google.com/)
2. Selecciona tu contenedor: `GTM-PF5RX3R5`
3. Ve a **"Etiquetas"** en el menú lateral
4. **Busca una etiqueta llamada**: `GA4 Configuration` o similar

**Si existe la etiqueta**: ✅ Continúa al paso 3
**Si NO existe**: ❌ Necesitas crearla (ver `CONFIGURAR_GA4_EN_GTM.md`)

#### Paso 3: Verificar configuración de la etiqueta GA4
1. Haz clic en la etiqueta `GA4 Configuration`
2. Verifica que:
   - **ID de medición**: `G-46BBJ0FKE1` ✅
   - **Disparador**: `All Pages` o similar ✅
   - **Estado**: Publicada (no en borrador) ✅

#### Paso 4: Verificar que esté publicada
1. Ve a **"Versiones"** en GTM
2. Verifica que la última versión incluya la etiqueta de GA4
3. **Estado**: Debe estar "Publicada" ✅

---

### 3. Verificar en Google Analytics

#### Paso 1: Verificar en Tiempo Real
1. Ve a [Google Analytics](https://analytics.google.com/)
2. Selecciona tu propiedad: `eventum`
3. Ve a **"Informes"** → **"Tiempo real"**
4. Abre tu sitio web en otra pestaña: `https://www.eventumcol.com`
5. **Deberías ver**: 1 usuario activo en tiempo real

**Si ves usuarios**: ✅ Google Analytics está recibiendo datos
**Si no ves nada**: ❌ Falta configurar la etiqueta en GTM

#### Paso 2: Usar Google Tag Assistant
1. Instala la extensión [Google Tag Assistant](https://chrome.google.com/webstore/detail/tag-assistant-legacy-by-g/kejbdjndbnbjgmefkgdddjlbokphdefk)
2. Visita tu sitio: `https://www.eventumcol.com`
3. Haz clic en el icono de Tag Assistant
4. Haz clic en **"Enable"**
5. Recarga la página
6. **Deberías ver**: 
   - ✅ Google Tag Manager
   - ✅ Google Analytics (GA4)

**Si ves ambos**: ✅ Todo está configurado correctamente
**Si solo ves GTM**: ❌ Falta la etiqueta de GA4 en GTM

---

## 🔧 Solución al Problema Actual

Según la advertencia que ves: **"La recogida de datos en tu sitio web no está activada"**

### Esto significa que:
1. ✅ El flujo de datos está creado en GA4
2. ✅ GTM está instalado en tu sitio
3. ❌ **FALTA**: La etiqueta de GA4 dentro de GTM

### Solución:
Sigue los pasos en `CONFIGURAR_GA4_EN_GTM.md` para crear la etiqueta de GA4 en GTM.

---

## 🧪 Prueba Rápida

### Método 1: Consola del Navegador
1. Abre tu sitio: `https://www.eventumcol.com`
2. Abre la consola (F12)
3. Escribe:
```javascript
// Verificar GTM
console.log('GTM:', window.dataLayer);

// Verificar GA4 (si está configurado)
console.log('GA4:', window.gtag);
```

**Resultado esperado**:
- `dataLayer`: Array con eventos ✅
- `gtag`: Función (si GA4 está configurado) ✅

### Método 2: Network Tab
1. Abre tu sitio: `https://www.eventumcol.com`
2. Abre DevTools (F12) → Pestaña **"Network"**
3. Recarga la página
4. Busca en el filtro: `gtm.js`
5. **Deberías ver**: Una petición a `https://www.googletagmanager.com/gtm.js?id=GTM-PF5RX3R5` ✅

6. Busca también: `collect` o `analytics`
7. **Deberías ver**: Peticiones a `https://www.google-analytics.com/g/collect?...` ✅

**Si ves ambas**: ✅ Todo está funcionando
**Si solo ves gtm.js**: ❌ Falta configurar GA4 en GTM

---

## 📝 Resumen del Estado

| Componente | Estado | Acción Requerida |
|------------|--------|------------------|
| **Código GTM** | ✅ Configurado | Ninguna |
| **Flujo GA4** | ✅ Creado | Ninguna |
| **Etiqueta GA4 en GTM** | ❌ **FALTA** | **Crear etiqueta** |
| **Publicación GTM** | ❓ Desconocido | Verificar y publicar |

---

## 🚀 Próximos Pasos

1. **Crear la etiqueta de GA4 en GTM** (ver `CONFIGURAR_GA4_EN_GTM.md`)
2. **Publicar los cambios en GTM**
3. **Esperar 24-48 horas** para ver datos en los informes estándar
4. **Verificar en tiempo real** inmediatamente después de publicar

---

## 💡 Nota Importante

- Los datos en **tiempo real** aparecen inmediatamente después de configurar
- Los datos en **informes estándar** pueden tardar 24-48 horas en aparecer
- La advertencia amarilla desaparecerá cuando GA4 comience a recibir datos
