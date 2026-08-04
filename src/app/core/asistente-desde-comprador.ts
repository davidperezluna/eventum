export interface DatosAsistenteBoleta {
  nombre_asistente?: string;
  documento_asistente?: string;
  email_asistente?: string;
  telefono_asistente?: string;
}

export interface PerfilCompradorAsistente {
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
  telefono?: string | null;
  documento_identidad?: string | null;
}

/** Datos del comprador para registrarlo como asistente en boletas normales. */
export function asistenteDesdeComprador(
  comprador: PerfilCompradorAsistente | null | undefined
): DatosAsistenteBoleta {
  if (!comprador) {
    return {};
  }

  const nombre = [comprador.nombre, comprador.apellido]
    .map((parte) => String(parte ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const documento = String(comprador.documento_identidad ?? '').trim();
  const email = String(comprador.email ?? '').trim();
  const telefono = String(comprador.telefono ?? '').trim();

  if (!nombre || !documento) {
    return {};
  }

  return {
    nombre_asistente: nombre,
    documento_asistente: documento,
    email_asistente: email || undefined,
    telefono_asistente: telefono || undefined,
  };
}
