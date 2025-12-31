# 🔧 Configuración del Workflow de GitHub Pages

## ✅ Workflow Actualizado

El workflow en `.github/workflows/deploy.yml` ha sido actualizado para:

1. ✅ **Detectar automáticamente la estructura del build** (con o sin subdirectorio `browser`)
2. ✅ **Crear `404.html` automáticamente** si no existe
3. ✅ **Usar la ruta correcta** para el artifact de GitHub Pages
4. ✅ **Verificar que todo esté correcto** antes del despliegue

## 🔍 Cambios Principales

### 1. Detección Automática de la Ruta

El workflow detecta automáticamente si Angular creó:
- `dist/admin-panel/browser/` (Angular 17+ con builder nuevo)
- `dist/admin-panel/` (Angular sin subdirectorio)

### 2. Creación Automática de 404.html

Si el script `copy-404.js` no creó el `404.html` (por alguna razón), el workflow lo crea automáticamente como respaldo.

### 3. Verificación Pre-Despliegue

El workflow verifica que:
- ✅ `index.html` existe
- ✅ `404.html` existe (lo crea si falta)
- ✅ Ambos archivos están en la misma ubicación

## 📋 Estructura del Workflow

```yaml
jobs:
  build:
    - Checkout
    - Setup Node.js
    - Install dependencies
    - Build application (npm run build:gh-pages)
    - Verify build output and create 404.html ← NUEVO
    - Upload artifact
  deploy:
    - Deploy to GitHub Pages
```

## 🚀 Cómo Funciona

1. **Build:** Se ejecuta `npm run build:gh-pages` que:
   - Construye la aplicación
   - Ejecuta `copy-404.js` automáticamente

2. **Verificación:** El workflow verifica:
   - Que existe `index.html`
   - Que existe `404.html` (lo crea si falta)

3. **Upload:** Sube solo la carpeta correcta al artifact

4. **Deploy:** GitHub Pages despliega automáticamente

## ✅ Checklist de Verificación

Después de hacer push, verifica en los logs del workflow:

- [ ] Build completado exitosamente
- [ ] Mensaje: "✓ Using browser subdirectory" o "✓ Using root directory"
- [ ] Mensaje: "✓ 404.html created successfully" o "✓ 404.html already exists"
- [ ] Upload artifact exitoso
- [ ] Deploy exitoso

## 🔧 Si Necesitas Modificar el Workflow

### Cambiar la ruta del build

Si Angular cambia la estructura de salida, actualiza el workflow en la sección `Verify build output`:

```yaml
if [ -f "dist/admin-panel/browser/index.html" ]; then
  BUILD_PATH="dist/admin-panel/browser"
elif [ -f "dist/admin-panel/index.html" ]; then
  BUILD_PATH="dist/admin-panel"
# Agrega más rutas aquí si es necesario
```

### Cambiar el comando de build

Si necesitas cambiar el comando de build, modifica:

```yaml
- name: Build application
  run: npm run build:gh-pages  # Cambia aquí
```

## 🐛 Troubleshooting

### Error: "index.html not found"

**Causa:** El build no se completó correctamente o la ruta cambió.

**Solución:**
1. Verifica los logs del build
2. Verifica que `angular.json` tenga `outputPath: "dist/admin-panel"`
3. Agrega más rutas posibles en la sección de detección

### Error: "404.html not found" después del deploy

**Causa:** El script no se ejecutó o el workflow no lo creó.

**Solución:**
1. Verifica que `copy-404.js` se ejecutó en los logs
2. El workflow debería crearlo automáticamente como respaldo
3. Verifica que ambos archivos estén en la misma ubicación

### El sitio funciona pero da 404 al recargar

**Causa:** `404.html` no está en la raíz del artifact.

**Solución:**
1. Verifica que `404.html` esté en la misma carpeta que `index.html`
2. Verifica que el workflow esté usando la ruta correcta para el artifact
3. Revisa los logs del workflow para ver qué ruta se usó

## 📝 Notas

- El workflow es compatible con Angular 17+ (con subdirectorio `browser`) y versiones anteriores
- El script `copy-404.js` se ejecuta automáticamente durante el build
- El workflow crea `404.html` como respaldo si el script falla
- La ruta del artifact se detecta automáticamente

## 🎯 Resultado Final

Después del despliegue:
- ✅ Todas las rutas funcionan
- ✅ Recargar cualquier página funciona (sin 404)
- ✅ URLs directas funcionan
- ✅ SEO optimizado (sin hash en las URLs)

