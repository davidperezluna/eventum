# 🔧 Solución al Error 404 al Recargar la Página

## Problema
Al recargar cualquier ruta (por ejemplo, `/login?returnUrl=%2Fdashboard`), el servidor devuelve un error 404.

## Causa
El servidor web intenta buscar un archivo físico en la ruta solicitada (ej: `/login`) y no lo encuentra, devolviendo un 404. Las SPAs (Single Page Applications) de Angular necesitan que todas las rutas se redirijan al `index.html`.

## 🟢 Solución para GitHub Pages (Ya Implementada)

**Si estás usando GitHub Pages**, la solución ya está implementada automáticamente:

1. ✅ El script `copy-404.js` se ejecuta después de cada build
2. ✅ Crea `404.html` idéntico a `index.html`
3. ✅ GitHub Pages sirve `404.html` cuando no encuentra una ruta
4. ✅ Angular recupera la ruta y funciona normalmente

**Verifica:**
- Ejecuta `npm run build:prod`
- Verifica que existe `dist/admin-panel/404.html`
- Debe ser idéntico a `index.html`

**Más detalles:** Ver `GITHUB_PAGES_SETUP.md`

## Soluciones por Tipo de Servidor

### ✅ Apache (con .htaccess)

1. **Verificar que el archivo `.htaccess` esté en el directorio raíz del sitio**
   - Debe estar en el mismo directorio que `index.html`
   - No debe estar en una subcarpeta

2. **Verificar que `mod_rewrite` esté habilitado**
   ```bash
   # En Ubuntu/Debian
   sudo a2enmod rewrite
   sudo systemctl restart apache2
   
   # Verificar que esté habilitado
   apache2ctl -M | grep rewrite
   ```

3. **Verificar permisos del archivo `.htaccess`**
   - El archivo debe ser legible por el servidor web
   - Permisos recomendados: `644` o `644`

4. **Verificar configuración de Apache**
   Asegúrate de que en tu configuración de Apache (o en `.htaccess` del directorio padre) esté permitido el uso de `.htaccess`:
   ```apache
   <Directory /ruta/a/tu/sitio>
       AllowOverride All
       Require all granted
   </Directory>
   ```

### ✅ IIS (con web.config)

1. **Verificar que el archivo `web.config` esté en el directorio raíz**
   - Debe estar en el mismo directorio que `index.html`

2. **Instalar URL Rewrite Module**
   - Descargar desde: https://www.iis.net/downloads/microsoft/url-rewrite
   - Instalar y reiniciar IIS

3. **Verificar permisos**
   - El archivo debe ser legible por IIS_IUSRS

### ✅ Nginx

1. **Usar la configuración proporcionada en `nginx.conf`**
2. **Asegurarse de que la directiva `try_files` esté configurada:**
   ```nginx
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```

## 🔍 Verificación Rápida

### Test 1: Verificar que el archivo existe
```bash
# En el servidor, verifica que existe
ls -la /ruta/del/sitio/.htaccess  # Apache
ls -la /ruta/del/sitio/web.config  # IIS
```

### Test 2: Verificar contenido
El archivo `.htaccess` debe contener:
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.html [L]
```

### Test 3: Probar directamente
1. Accede a: `http://www.eventumcol.com/login`
2. Debe cargar la aplicación (no dar 404)
3. Recarga la página (F5)
4. Debe seguir funcionando (no dar 404)

## 🚨 Si el Problema Persiste

### Opción 1: Verificar logs del servidor
```bash
# Apache
tail -f /var/log/apache2/error.log

# Nginx
tail -f /var/log/nginx/error.log
```

### Opción 2: Probar con curl
```bash
curl -I http://www.eventumcol.com/login
# Debe devolver 200 OK, no 404
```

### Opción 3: Verificar que el build incluya los archivos
Después de hacer `npm run build:prod`, verifica que en `dist/admin-panel/` existan:
- `index.html`
- `.htaccess` (o `web.config`)
- Todos los archivos JS y CSS

### Opción 4: Contactar al proveedor de hosting
Si estás usando un hosting compartido, puede que:
- No permitan `.htaccess` personalizados
- Tengan restricciones en `mod_rewrite`
- Necesiten configuración especial

## 📝 Notas Importantes

1. **El archivo debe estar en el directorio raíz del sitio**, no en una subcarpeta
2. **Después de cambiar `.htaccess` o `web.config`, reinicia el servidor web** si es posible
3. **Los archivos en `public/` se copian automáticamente al build**, pero verifica que estén en `dist/admin-panel/` después del build
4. **Si usas un CDN o proxy**, puede que necesites configuración adicional

## ✅ Checklist de Verificación

- [ ] Archivo `.htaccess` o `web.config` existe en el directorio raíz del sitio
- [ ] El archivo tiene el contenido correcto (ver arriba)
- [ ] `mod_rewrite` está habilitado (Apache) o URL Rewrite Module instalado (IIS)
- [ ] Permisos del archivo son correctos
- [ ] El build de producción se hizo correctamente (`npm run build:prod`)
- [ ] Los archivos se subieron correctamente al servidor
- [ ] El servidor web se reinició después de los cambios (si es necesario)

