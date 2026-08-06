import { normalizeEmail } from './parse-reference.js';

export type EmailContext = {
  emailCuentaEventum: string | null;
  emailWompiComprobante: string | null;
  emailAlCrearCheckout: string | null;
  emailsCoinciden: boolean | null;
  mensajeSoporte: string | null;
};

/** @see supabase/functions/wompi-reconcile-lookup/index.ts buildEmailContext */
export function extractEmailFromCheckoutPayload(
  checkout: Record<string, unknown> | null,
): string {
  if (!checkout?.request_payload || typeof checkout.request_payload !== 'object') {
    return '';
  }
  const payload = checkout.request_payload as Record<string, unknown>;
  const requestBody = payload.request_body;
  if (requestBody && typeof requestBody === 'object') {
    const fromBody = normalizeEmail((requestBody as Record<string, unknown>).customer_email);
    if (fromBody) return fromBody;
  }
  return normalizeEmail(payload.customer_email);
}

export function extractWompiReceiptEmail(checkout: Record<string, unknown>): string {
  const response = checkout.response_payload;
  if (response && typeof response === 'object') {
    const fromResponse = normalizeEmail((response as Record<string, unknown>).customer_email);
    if (fromResponse) return fromResponse;
  }
  return '';
}

export function buildEmailContext(params: {
  checkout: Record<string, unknown>;
  wompiReceiptEmail?: string;
}): EmailContext {
  const cliente = params.checkout.cliente as { email?: string | null } | null | undefined;
  const emailCuenta = normalizeEmail(cliente?.email);
  const emailWompi =
    normalizeEmail(params.wompiReceiptEmail) || extractWompiReceiptEmail(params.checkout);
  const emailAlCrearCheckout = extractEmailFromCheckoutPayload(params.checkout);

  const emailsCoinciden = emailCuenta && emailWompi ? emailCuenta === emailWompi : null;
  const materializado = params.checkout.materializado === true;
  const compraId = params.checkout.compra_id;

  let mensajeSoporte: string | null = null;
  if (emailCuenta && emailWompi && emailsCoinciden === false) {
    if (materializado && compraId) {
      mensajeSoporte =
        `El pago sí está materializado (compra #${compraId}), pero el comprobante Wompi muestra ${emailWompi} y las boletas están en la cuenta Eventum ${emailCuenta}. Indica al cliente: «Inicia sesión en Eventum con ${emailCuenta} y entra a Mis compras — no uses el correo del recibo de Wompi».`;
    } else {
      mensajeSoporte =
        `Correo del comprobante Wompi (${emailWompi}) distinto al de la cuenta Eventum (${emailCuenta}). Las boletas quedarán en la cuenta con la que inició sesión al comprar.`;
    }
  } else if (emailCuenta && materializado) {
    mensajeSoporte = `Boletas en la cuenta Eventum ${emailCuenta} → Mis compras.`;
  }

  return {
    emailCuentaEventum: emailCuenta || null,
    emailWompiComprobante: emailWompi || null,
    emailAlCrearCheckout: emailAlCrearCheckout || null,
    emailsCoinciden,
    mensajeSoporte,
  };
}

export function isDbWompiApproved(estado: unknown, wompiStatus: unknown): boolean {
  return (
    String(estado || '').toLowerCase() === 'aprobada' ||
    String(wompiStatus || '').toUpperCase() === 'APPROVED'
  );
}

export function checkoutNeedsMaterialization(row: {
  compra_id?: unknown;
  compra_producto_id?: unknown;
  compra_cover_id?: unknown;
  materializado?: unknown;
}): boolean {
  if (row.materializado === true) return false;
  return (
    Number(row.compra_id ?? 0) <= 0 &&
    Number(row.compra_producto_id ?? 0) <= 0 &&
    Number(row.compra_cover_id ?? 0) <= 0
  );
}
