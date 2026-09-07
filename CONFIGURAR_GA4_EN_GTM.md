# 📊 Configurar Google Analytics 4 en Google Tag Manager

> **Nota:** En producción Eventum usa `gtag` directo. Doc canónica del funnel: [`docs/tracking-ga4-meta.md`](docs/tracking-ga4-meta.md). Esta guía solo aplica si se vuelve a GTM.

## Tu Measurement ID de GA4
**`G-46BBJ0FKE1`**

## Pasos para configurar GA4 en GTM

### Paso 1: Ir a Google Tag Manager
1. Ve a [Google Tag Manager](https://tagmanager.google.com/)
2. Selecciona tu contenedor `GTM-PF5RX3R5`

### Paso 2: Crear la etiqueta de GA4
1. Haz clic en **"Etiquetas"** en el menú lateral
2. Haz clic en **"Nueva"**
3. Haz clic en el área de **"Configuración de etiqueta"**
4. Busca y selecciona **"Google Analytics: GA4 Configuration"**

### Paso 3: Configurar la etiqueta
1. En **"ID de medición"**, pega: `G-46BBJ0FKE1`
2. (Opcional) Puedes agregar parámetros adicionales si lo necesitas

### Paso 4: Crear el disparador
1. En la sección **"Activación"**, haz clic en el área de disparador
2. Haz clic en **"+"** para crear un nuevo disparador
3. Nombre: `All Pages`
4. Tipo de disparador: **"All Pages"**
5. Guarda el disparador

### Paso 5: Guardar y publicar
1. Nombra la etiqueta: `GA4 Configuration`
2. Haz clic en **"Guardar"**
3. Haz clic en **"Enviar"** para publicar los cambios
4. Agrega un nombre de versión (ej: "Agregar GA4")
5. Haz clic en **"Publicar"**

## ✅ Listo

Ahora Google Analytics 4 está configurado dentro de GTM y comenzará a recibir datos de tu aplicación.

## Verificar que funciona

1. Ve a Google Analytics → **Informes** → **Tiempo real**
2. Deberías ver actividad en tiempo real si hay visitantes en tu sitio
3. También puedes usar la **Vista previa** de GTM para verificar que la etiqueta se dispara correctamente
