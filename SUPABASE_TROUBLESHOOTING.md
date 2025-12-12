# 🔍 Guía de Solución de Problemas con Supabase y Angular

## Problema: Respuesta 200 OK pero datos no cargan

### Posibles Causas y Soluciones

#### 1. **Políticas RLS (Row Level Security)**
Supabase usa RLS para controlar el acceso a los datos. Aunque la respuesta HTTP sea 200 OK, si las políticas RLS no están configuradas correctamente, los datos pueden estar vacíos.

**Solución:**
- Ve a tu proyecto en Supabase Dashboard
- Navega a Authentication > Policies
- Verifica que las políticas permitan SELECT para las tablas que estás consultando
- Para desarrollo, puedes temporalmente desactivar RLS en las tablas (NO recomendado para producción)

**Ejemplo de política para permitir lectura:**
```sql
CREATE POLICY "Permitir lectura a todos" ON public.eventos
FOR SELECT USING (true);
```

#### 2. **Manejo de Observables en Angular**
Las consultas de Supabase devuelven Promesas, que se convierten en Observables usando `from()`. Asegúrate de que el Observable se esté suscribiendo correctamente.

**Verifica en tus componentes:**
```typescript
this.service.getData().subscribe({
  next: (data) => {
    console.log('Datos recibidos:', data);
    this.data = data;
  },
  error: (err) => {
    console.error('Error:', err);
  }
});
```

#### 3. **Estructura de Respuesta de Supabase**
Supabase siempre devuelve un objeto con esta estructura:
```typescript
{
  data: T[] | null,
  error: PostgrestError | null,
  count: number | null,
  status: number,
  statusText: string
}
```

**Asegúrate de verificar:**
- `response.error` - puede estar presente incluso con status 200
- `response.data` - puede ser `null` o un array vacío `[]`
- `response.count` - puede ser `null` si no usas `count: 'exact'`

#### 4. **Logs de Depuración**
He agregado logs de consola en todos los servicios. Abre la consola del navegador (F12) y verifica:

- Si ves errores de Supabase
- Si los datos se están cargando pero no se muestran en la UI
- Si hay problemas de autenticación

#### 5. **Verificar Configuración de Supabase**
Asegúrate de que las variables de entorno estén correctas:

```typescript
// environment.ts
export const environment = {
  supabase: {
    url: 'https://tu-proyecto.supabase.co',
    anonKey: 'tu-anon-key'
  }
};
```

#### 6. **Problema Común: Consultas con `head: true`**
Cuando usas `select('id', { count: 'exact', head: true })`, Supabase no devuelve los datos, solo el count. Esto puede causar confusión.

**Solución:** Usa `select('*', { count: 'exact' })` si necesitas los datos.

#### 7. **Cambio de Detección en Angular**
Si los datos se cargan pero no se muestran, puede ser un problema de detección de cambios:

```typescript
import { ChangeDetectorRef } from '@angular/core';

constructor(private cdr: ChangeDetectorRef) {}

loadData() {
  this.service.getData().subscribe(data => {
    this.data = data;
    this.cdr.detectChanges(); // Forzar detección de cambios
  });
}
```

### Pasos de Depuración

1. **Abre la consola del navegador (F12)**
2. **Ve a la pestaña Network**
3. **Filtra por "supabase"**
4. **Revisa las respuestas:**
   - ¿El status es 200?
   - ¿El body contiene datos?
   - ¿Hay errores en la respuesta?

5. **Revisa la consola de JavaScript:**
   - Busca los logs que agregamos: "Eventos cargados:", "Usuarios cargados:", etc.
   - Verifica si hay errores de Supabase

6. **Prueba una consulta directa:**
```typescript
// En la consola del navegador o en un componente de prueba
const { data, error } = await supabase.from('eventos').select('*');
console.log('Datos:', data);
console.log('Error:', error);
```

### Recursos Oficiales

- [Documentación de Supabase con Angular](https://supabase.com/docs/guides/getting-started/tutorials/with-angular)
- [Guía de RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [API Reference](https://supabase.com/docs/reference/javascript/select)



