# Crear Usuarios desde el Panel de Administración

## Funcionalidad Implementada

El panel de administración ahora permite crear nuevos usuarios directamente desde la interfaz. La funcionalidad incluye:

- ✅ Crear usuarios en Supabase Auth
- ✅ Crear registro en la tabla `usuarios`
- ✅ Asignar tipo de usuario (Administrador, Organizador, etc.)
- ✅ Configurar datos adicionales (nombre, apellido, teléfono)
- ✅ Activar/desactivar usuarios

## Configuración Actual

Actualmente, la creación de usuarios usa `auth.signUp()` que funciona con el anon key, pero **requiere confirmación de email** antes de que el usuario pueda iniciar sesión.

## Configuración Avanzada (Opcional)

Para crear usuarios **sin confirmación de email** (recomendado para panel de administración), necesitas configurar el **Service Role Key**:

### Pasos para Configurar Service Role Key

1. **Obtener el Service Role Key:**
   - Ve a tu proyecto en Supabase: https://app.supabase.com
   - Navega a: **Settings > API**
   - Copia el **"service_role" key** (⚠️ NO uses el anon key)
   - ⚠️ **IMPORTANTE**: Este key tiene permisos completos, mantenlo seguro

2. **Agregar al Environment (Solo Desarrollo):**
   
   Edita `src/environments/environment.ts`:
   ```typescript
   export const environment = {
     production: false,
     supabase: {
       url: 'https://tu-proyecto.supabase.co',
       anonKey: 'tu-anon-key',
       serviceRoleKey: 'tu-service-role-key' // ⚠️ Solo para desarrollo
     }
   };
   ```

3. **Actualizar SupabaseService:**
   
   Si quieres usar el service role key, necesitarás crear un cliente admin separado en `supabase.service.ts`:
   ```typescript
   // Cliente admin (solo para operaciones administrativas)
   private adminClient: SupabaseClient | null = null;
   
   getAdminClient(): SupabaseClient | null {
     if (!this.adminClient && environment.supabase.serviceRoleKey) {
       this.adminClient = createClient(
         environment.supabase.url,
         environment.supabase.serviceRoleKey
       );
     }
     return this.adminClient;
   }
   ```

4. **Actualizar UsuariosService:**
   
   Modifica el método `createUsuario` para usar el cliente admin:
   ```typescript
   const adminClient = this.supabase.getAdminClient();
   if (adminClient) {
     // Usar auth.admin.createUser() con confirmación automática
     const { data, error } = await adminClient.auth.admin.createUser({
       email: usuarioData.email,
       password: usuarioData.password,
       email_confirm: true, // Confirmar automáticamente
       user_metadata: { ... }
     });
   } else {
     // Fallback a signUp normal
     const { data, error } = await this.supabase.auth.signUp({ ... });
   }
   ```

### ⚠️ Seguridad

- **NUNCA** expongas el service role key en el código del frontend en producción
- El service role key debe usarse solo en:
  - Backend/API routes
  - Serverless functions
  - Desarrollo local (con precaución)

### Alternativa Recomendada

Para producción, es mejor crear una **Edge Function** o **API route** que use el service role key en el backend, y llamarla desde el frontend.

## Uso Actual

Con la configuración actual (sin service role key):

1. El administrador crea el usuario desde el panel
2. El usuario recibe un email de confirmación
3. El usuario debe hacer clic en el enlace del email para confirmar
4. Después de confirmar, puede iniciar sesión

## Campos del Formulario

- **Email** (requerido): Email del usuario
- **Contraseña** (requerido, solo al crear): Mínimo 6 caracteres
- **Nombre**: Nombre del usuario
- **Apellido**: Apellido del usuario
- **Tipo de Usuario** (requerido): Administrador, Organizador, etc.
- **Teléfono**: Teléfono del usuario
- **Activo**: Checkbox para activar/desactivar usuario

## Validaciones

- Email debe ser válido y único
- Contraseña mínimo 6 caracteres
- Tipo de usuario es requerido
- Email no se puede cambiar después de crear el usuario



