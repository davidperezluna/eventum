/* ============================================
   BASE SERVICE - Utilidades comunes para servicios
   ============================================ */

/**
 * Maneja la respuesta de Supabase y convierte errores en excepciones
 */
export function handleSupabaseResponse<T>(response: any): T {
  if (response.error) {
    console.error('Error de Supabase:', response.error);
    throw response.error;
  }
  return response.data as T;
}

/**
 * Maneja la respuesta paginada de Supabase
 */
export function handlePaginatedResponse<T>(
  response: any,
  page: number,
  limit: number
): { data: T[]; total: number; page: number; limit: number; totalPages: number } {
  if (response.error) {
    console.error('Error de Supabase:', response.error);
    throw response.error;
  }
  
  const total = response.count || 0;
  const data = (response.data as T[]) || [];
  
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Maneja una promesa de Supabase y retorna los datos o lanza un error
 * Versión síncrona sin observables
 */
export async function fromSupabasePromise<T>(promise: Promise<any>): Promise<T> {
  try {
    const response = await promise;
    if (response.error) {
      console.error('Error de Supabase:', response.error);
      throw response.error;
    }
    return response.data as T;
  } catch (error) {
    console.error('Error en promesa de Supabase:', error);
    throw error;
  }
}



