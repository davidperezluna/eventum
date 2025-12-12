# 🔐 Solución de Problemas de Login con Supabase

## Problema: Login se queda cargando aunque Supabase devuelve access_token

### Síntomas
- La respuesta de Supabase es exitosa (200 OK)
- Se recibe `access_token`, `refresh_token`, `user`, etc.
- Pero la aplicación se queda en estado de carga
- No se redirige al dashboard

### Causas Comunes

#### 1. **Usuario no existe en la tabla `usuarios`**
El login de Supabase Auth es exitoso, pero el usuario no tiene un registro correspondiente en la tabla `usuarios` con el `auth_user_id` correcto.

**Solución:**
```sql
-- Verificar si el usuario existe
SELECT * FROM usuarios WHERE auth_user_id = '78302ebe-299a-4b7c-8cd6-ff9dd1ae2a24';

-- Si no existe, crear el registro
INSERT INTO usuarios (
  tipo_usuario_id,
  email,
  nombre,
  apellido,
  auth_user_id,
  activo,
  email_verificado
) VALUES (
  3, -- ID del tipo administrador
  'admin@gmail.com',
  'Admin',
  'Usuario',
  '78302ebe-299a-4b7c-8cd6-ff9dd1ae2a24', -- El auth_user_id de Supabase Auth
  true,
  true
);
```

#### 2. **Políticas RLS bloqueando la consulta**
Las políticas de Row Level Security pueden estar bloqueando la consulta a la tabla `usuarios`.

**Solución:**
```sql
-- Crear política para permitir que usuarios autenticados lean su propio registro
CREATE POLICY "Usuarios pueden leer su propio registro"
ON public.usuarios
FOR SELECT
USING (auth.uid()::text = auth_user_id::text);

-- O temporalmente desactivar RLS para desarrollo (NO recomendado para producción)
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;
```

#### 3. **El campo `auth_user_id` no coincide**
El `auth_user_id` en la tabla `usuarios` debe ser exactamente igual al `id` del usuario en Supabase Auth.

**Verificar:**
```sql
-- El auth_user_id debe ser un UUID (texto)
SELECT 
  id,
  email,
  auth_user_id,
  tipo_usuario_id
FROM usuarios
WHERE email = 'admin@gmail.com';
```

#### 4. **Observable no se completa**
El Observable puede estar esperando indefinidamente si hay un error en el `switchMap`.

**Solución:** He agregado logs de consola para identificar dónde se detiene el flujo.

### Pasos de Depuración

1. **Abre la consola del navegador (F12)**
2. **Intenta hacer login**
3. **Revisa los logs:**
   - Deberías ver: "Iniciando login para: admin@gmail.com"
   - Luego: "Respuesta de signInWithPassword:"
   - Luego: "Usuario de Supabase Auth:"
   - Luego: "Buscando usuario en tabla usuarios con auth_user_id:"
   - Finalmente: "Respuesta de consulta usuarios:"

4. **Si ves un error en "Respuesta de consulta usuarios":**
   - Copia el mensaje de error completo
   - Verifica las políticas RLS en Supabase Dashboard
   - Verifica que el usuario exista en la tabla `usuarios`

5. **Verifica en Supabase Dashboard:**
   - Ve a Table Editor > usuarios
   - Busca el registro con el email que usaste para login
   - Verifica que `auth_user_id` coincida con el `id` del usuario en Authentication > Users

### Verificación Rápida

Ejecuta esto en la consola del navegador después de hacer login:

```javascript
// Obtener el usuario actual de Supabase Auth
const { data: { user } } = await supabase.auth.getUser();
console.log('Usuario Auth ID:', user?.id);

// Buscar en la tabla usuarios
const { data, error } = await supabase
  .from('usuarios')
  .select('*')
  .eq('auth_user_id', user?.id)
  .single();

console.log('Usuario en tabla:', data);
console.log('Error:', error);
```

### Solución Temporal para Testing

Si necesitas probar rápidamente, puedes modificar temporalmente el `auth.service.ts` para omitir la validación del usuario:

```typescript
// TEMPORAL - Solo para testing
if (usuarioResponse.error) {
  console.warn('Usuario no encontrado, creando usuario temporal');
  // Crear un usuario temporal
  const usuarioTemporal: Usuario = {
    id: 0,
    tipo_usuario_id: 3, // Administrador
    email: user.email || '',
    nombre: 'Admin',
    activo: true,
    email_verificado: true,
    auth_user_id: user.id
  };
  this.usuarioSubject.next(usuarioTemporal);
  return { user, usuario: usuarioTemporal, error: null };
}
```

**⚠️ NO uses esto en producción**

### Recursos

- [Documentación de Supabase Auth](https://supabase.com/docs/guides/auth)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase + Angular Tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-angular)



