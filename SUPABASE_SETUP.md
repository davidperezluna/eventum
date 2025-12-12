# 🔧 Configuración de Supabase

Esta guía te ayudará a configurar Supabase en tu proyecto Angular.

## 📋 Pasos para Configurar Supabase

### 1. Obtener las Credenciales de Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Settings** > **API**
3. Copia los siguientes valores:
   - **Project URL** (ejemplo: `https://xxxxx.supabase.co`)
   - **anon/public key** (la clave pública)

### 2. Configurar Variables de Entorno

#### Opción A: Usar archivo .env (Recomendado para desarrollo)

1. Crea un archivo `.env` en la raíz del proyecto `admin-panel/`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

2. **IMPORTANTE**: Agrega `.env` a tu `.gitignore` para no subir las credenciales:

```gitignore
# Environment variables
.env
.env.local
.env.*.local
```

#### Opción B: Configuración directa (Solo para desarrollo rápido)

Si prefieres configurar directamente, edita `src/app/config/supabase.config.ts`:

```typescript
export const supabaseConfig = {
  url: 'https://tu-proyecto.supabase.co',
  anonKey: 'tu-anon-key-aqui',
};
```

⚠️ **NO uses esta opción en producción**. Siempre usa variables de entorno.

### 3. Configurar Angular para Variables de Entorno

Angular no lee `.env` por defecto. Necesitas usar `@angular-builders/custom-webpack` o configurar manualmente.

#### Solución Simple (Recomendada):

Edita `src/app/config/supabase.config.ts` y configura directamente tus valores:

```typescript
export const supabaseConfig = {
  url: 'TU_URL_AQUI',
  anonKey: 'TU_KEY_AQUI',
};
```

### 4. Verificar la Conexión

Para verificar que todo funciona, puedes probar en el componente del dashboard:

```typescript
import { SupabaseService } from './services/supabase.service';

// En tu componente
constructor(private supabase: SupabaseService) {
  // Probar conexión
  this.supabase.from('eventos').select('count').then(console.log);
}
```

## 📦 Servicios Disponibles

### SupabaseService
Servicio principal que proporciona acceso al cliente de Supabase.

```typescript
import { SupabaseService } from './services/supabase.service';

constructor(private supabase: SupabaseService) {}

// Acceder a una tabla
this.supabase.from('eventos').select('*');

// Autenticación
this.supabase.auth.signInWithPassword({...});

// Storage
this.supabase.storage.from('imagenes').upload(...);
```

### EventosService
Servicio para gestionar eventos.

```typescript
import { EventosService } from './services/eventos.service';

constructor(private eventosService: EventosService) {}

// Obtener eventos
this.eventosService.getEventos().subscribe(eventos => {
  console.log(eventos);
});

// Crear evento
this.eventosService.createEvento(evento).subscribe(...);
```

### ComprasService
Servicio para gestionar compras.

### BoletasService
Servicio para gestionar boletas.

### DashboardService
Servicio para obtener estadísticas del dashboard.

## 🔒 Seguridad

1. **Nunca** subas tu `.env` a Git
2. **Nunca** expongas tu `service_role` key en el frontend
3. Usa solo la `anon` key en el cliente
4. Configura Row Level Security (RLS) en Supabase para proteger tus datos

## 📚 Recursos

- [Documentación de Supabase](https://supabase.com/docs)
- [Guía de Angular + Supabase](https://supabase.com/docs/guides/getting-started/quickstarts/angular)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

## 🐛 Solución de Problemas

### Error: "Supabase no está configurado"
- Verifica que las variables de entorno estén configuradas
- Revisa que los nombres de las variables sean correctos

### Error: "Invalid API key"
- Verifica que estés usando la `anon` key, no la `service_role` key
- Asegúrate de que la key esté completa y sin espacios

### Error de CORS
- Verifica que tu URL de Supabase esté correcta
- Revisa la configuración de CORS en Supabase Dashboard

