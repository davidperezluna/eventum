# 🚀 Guía de Despliegue en Producción - eventumcol.com

## 📋 Configuración Completada

El proyecto ha sido configurado para ejecutarse en el dominio raíz: **https://www.eventumcol.com**

### Cambios Realizados:

1. ✅ **baseHref** cambiado de `/eventum/` a `/` en `angular.json`
2. ✅ **Router** configurado con navegación inicial bloqueante para mejor rendimiento
3. ✅ **404.html para GitHub Pages** - Solución automática para el error 404 al recargar
4. ✅ **Archivos de configuración del servidor** creados:
   - `.htaccess` (Apache)
   - `web.config` (IIS)
   - `nginx.conf` (Nginx)
   - `404.html` (GitHub Pages)

## 🔨 Build para Producción

Para construir la aplicación para producción:

```bash
npm run build:prod
```

O simplemente:

```bash
npm run build
```

El build se generará en la carpeta `dist/admin-panel/`

## 📤 Despliegue

### Opción 1: Apache (con .htaccess)

1. Construir la aplicación: `npm run build:prod`
2. Copiar el contenido de `dist/admin-panel/` al directorio raíz del servidor web
3. Asegurarse de que el archivo `.htaccess` esté en el directorio raíz
4. Verificar que el módulo `mod_rewrite` esté habilitado en Apache

### Opción 2: IIS (con web.config)

1. Construir la aplicación: `npm run build:prod`
2. Copiar el contenido de `dist/admin-panel/` al directorio raíz del sitio IIS
3. Asegurarse de que el archivo `web.config` esté en el directorio raíz
4. Instalar el módulo URL Rewrite en IIS si no está instalado

### Opción 3: Nginx

1. Construir la aplicación: `npm run build:prod`
2. Copiar el contenido de `dist/admin-panel/` al directorio configurado en `nginx.conf`
3. Configurar el archivo `nginx.conf` según tu servidor
4. Ajustar las rutas de los certificados SSL en `nginx.conf`

## ⚠️ Solución al Error de Recarga de Página (404)

El problema de que al recargar la página no se toman las rutas es un problema común en SPAs (Single Page Applications). 

**Causa:** Cuando recargas una ruta como `/login?returnUrl=%2Fdashboard`, el servidor intenta buscar un archivo físico en esa ruta y no lo encuentra, devolviendo un error 404.

### 🟢 Solución para GitHub Pages (Recomendada)

**GitHub Pages tiene una regla especial:** Si existe `404.html`, lo sirve cuando no encuentra la ruta. Angular puede recuperar la ruta desde ahí y funcionar normalmente.

✅ **Solución implementada automáticamente:**
- El script `copy-404.js` se ejecuta automáticamente después de cada build
- Crea `404.html` idéntico a `index.html` en el directorio de salida
- Funciona sin configuración adicional

### 🔧 Solución para Otros Servidores

Los archivos de configuración (`.htaccess`, `web.config`, `nginx.conf`) redirigen todas las rutas que no corresponden a archivos físicos al `index.html`, permitiendo que Angular maneje el routing.

### ⚡ Pasos Críticos para Solucionar el 404:

#### Para GitHub Pages:
1. **Reconstruye la aplicación:**
   ```bash
   npm run build:prod
   ```
   El script automáticamente creará `404.html`

2. **Verifica que existan ambos archivos en `dist/admin-panel/`:**
   - ✅ `index.html`
   - ✅ `404.html` (debe ser idéntico a index.html)

3. **Despliega a GitHub Pages:**
   - Sube TODO el contenido de `dist/admin-panel/` a tu repositorio
   - Asegúrate de que `404.html` esté en la raíz

#### Para Otros Servidores (Apache, IIS, Nginx):
1. **Asegúrate de que el archivo de configuración esté en el directorio raíz del servidor**
   - El archivo `.htaccess` (Apache) o `web.config` (IIS) debe estar en el mismo directorio que `index.html`
   - NO debe estar en una subcarpeta

2. **Verifica que el módulo de reescritura esté habilitado:**
   - **Apache:** `mod_rewrite` debe estar habilitado
   - **IIS:** URL Rewrite Module debe estar instalado

3. **Reconstruye y redespliega:**
   ```bash
   npm run build:prod
   ```
   Luego copia TODO el contenido de `dist/admin-panel/` al directorio raíz del servidor

4. **Verifica que los archivos se copiaron correctamente:**
   - Debe existir `.htaccess` o `web.config` en el directorio raíz
   - Debe existir `index.html` en el directorio raíz

### Verificación:

Después del despliegue, prueba:
- Navegar a `http://www.eventumcol.com/login`
- Recargar la página (F5 o Ctrl+R)
- Debería cargar correctamente sin errores 404

**Si el problema persiste, consulta `TROUBLESHOOTING_404.md` para más detalles.**

## 🔒 Configuración SSL

Asegúrate de tener certificados SSL válidos configurados para `www.eventumcol.com` y `eventumcol.com`.

## 📝 Notas Adicionales

- El `baseHref` está configurado como `/` para el dominio raíz
- El router está configurado para usar HTML5 history mode (sin hash)
- Los archivos de configuración del servidor incluyen optimizaciones de cache y compresión

## 🐛 Troubleshooting

Si después del despliegue aún tienes problemas:

1. **Verifica que el archivo de configuración del servidor esté en el directorio raíz**
2. **Verifica que el módulo de reescritura esté habilitado** (mod_rewrite para Apache, URL Rewrite para IIS)
3. **Verifica los permisos del archivo** `.htaccess` o `web.config`
4. **Revisa los logs del servidor** para ver errores específicos
5. **Asegúrate de que el build se haya generado correctamente** con `npm run build:prod`

