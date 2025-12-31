# 🚀 Guía de Despliegue en Producción - eventumcol.com

## 📋 Configuración Completada

El proyecto ha sido configurado para ejecutarse en el dominio raíz: **https://www.eventumcol.com**

### Cambios Realizados:

1. ✅ **baseHref** cambiado de `/eventum/` a `/` en `angular.json`
2. ✅ **Router** configurado con navegación inicial bloqueante para mejor rendimiento
3. ✅ **Archivos de configuración del servidor** creados:
   - `.htaccess` (Apache)
   - `web.config` (IIS)
   - `nginx.conf` (Nginx)

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

## ⚠️ Solución al Error de Recarga de Página

El problema de que al recargar la página no se toman las rutas es un problema común en SPAs (Single Page Applications). 

**Causa:** Cuando recargas una ruta como `/dashboard`, el servidor intenta buscar un archivo físico en esa ruta y no lo encuentra, devolviendo un error 404.

**Solución:** Los archivos de configuración (`.htaccess`, `web.config`, `nginx.conf`) redirigen todas las rutas que no corresponden a archivos físicos al `index.html`, permitiendo que Angular maneje el routing.

### Verificación:

Después del despliegue, prueba:
- Navegar a `https://www.eventumcol.com/dashboard`
- Recargar la página (F5 o Ctrl+R)
- Debería cargar correctamente sin errores

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

