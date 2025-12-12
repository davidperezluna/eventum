# 🔧 Configuración de Variables de Entorno

Esta guía explica cómo configurar las variables de entorno para Supabase en tu proyecto Angular.

## 📋 Sistema de Environments de Angular

Angular usa un sistema de archivos de environment que se reemplazan automáticamente según el modo de compilación.

### Archivos de Environment

- **`src/environments/environment.ts`** - Configuración para desarrollo
- **`src/environments/environment.prod.ts`** - Configuración para producción

## 🚀 Pasos para Configurar

### 1. Obtener Credenciales de Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Settings** > **API**
3. Copia:
   - **Project URL** (ejemplo: `https://xxxxx.supabase.co`)
   - **anon/public key** (la clave pública)

### 2. Configurar Environment de Desarrollo

Edita `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://tu-proyecto.supabase.co',  // ← Pega tu URL aquí
    anonKey: 'tu-anon-key-aqui'              // ← Pega tu key aquí
  }
};
```

### 3. Configurar Environment de Producción

Edita `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  supabase: {
    url: 'https://tu-proyecto.supabase.co',  // ← Misma URL
    anonKey: 'tu-anon-key-aqui'              // ← Misma key (o diferente si tienes múltiples proyectos)
  }
};
```

## 🏗️ Cómo Funciona

### Desarrollo
Cuando ejecutas `npm start`, Angular usa `environment.ts`

### Producción
Cuando ejecutas `npm run build`, Angular automáticamente reemplaza `environment.ts` con `environment.prod.ts`

Esto se configura en `angular.json` con `fileReplacements`:

```json
"fileReplacements": [
  {
    "replace": "src/environments/environment.ts",
    "with": "src/environments/environment.prod.ts"
  }
]
```

## 🔒 Seguridad

### ✅ Hacer
- ✅ Mantener diferentes credenciales para desarrollo y producción si es necesario
- ✅ Usar la `anon` key (nunca la `service_role` key en el frontend)
- ✅ Agregar `*.env` al `.gitignore` (ya está incluido)

### ❌ No Hacer
- ❌ Subir archivos `.env` con credenciales reales a Git
- ❌ Usar la `service_role` key en el frontend
- ❌ Compartir tus credenciales públicamente

## 📝 Archivo .env.example

El archivo `.env.example` es solo para referencia. En Angular, las variables se configuran directamente en los archivos `environment.ts`.

Puedes usar `.env.example` como plantilla para documentar qué variables necesitas, pero recuerda que Angular no lee archivos `.env` automáticamente.

## 🔄 Agregar Nuevas Variables

Si necesitas agregar más variables de entorno:

1. Agrega la variable a `environment.ts`:
```typescript
export const environment = {
  production: false,
  supabase: { ... },
  apiUrl: 'http://localhost:3000/api',  // Nueva variable
  appVersion: '1.0.0'
};
```

2. Agrega la misma variable a `environment.prod.ts` con valores de producción

3. Úsala en tu código:
```typescript
import { environment } from '../environments/environment';

const apiUrl = environment.apiUrl;
```

## 🐛 Solución de Problemas

### Error: "Supabase no está configurado"
- Verifica que hayas configurado las credenciales en `environment.ts`
- Asegúrate de que los valores no estén vacíos

### Las variables no cambian después de editar
- Reinicia el servidor de desarrollo (`npm start`)
- Limpia el caché: `rm -rf .angular/cache` (o en Windows: `rmdir /s .angular\cache`)

### Diferentes valores en desarrollo vs producción
- Verifica que ambos archivos (`environment.ts` y `environment.prod.ts`) estén configurados
- Asegúrate de que `angular.json` tenga configurado `fileReplacements` para producción

## 📚 Recursos

- [Angular Environment Configuration](https://angular.dev/guide/build#configuring-application-environments)
- [Supabase Documentation](https://supabase.com/docs)

