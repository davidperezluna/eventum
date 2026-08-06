/** @see supabase/functions/wompi-reconcile-lookup/index.ts parseReference */

export function parseReference(reference: string | null | undefined): {
  transaccionProductoId: number | null;
  transaccionCheckoutId: number | null;
} {
  const ref = String(reference || '').trim();
  if (!ref) {
    return { transaccionProductoId: null, transaccionCheckoutId: null };
  }

  const checkoutMatch = ref.match(/^EVENTUM-CHK-TXN-(\d+)-/i);
  if (checkoutMatch) {
    return { transaccionProductoId: null, transaccionCheckoutId: Number(checkoutMatch[1]) };
  }

  const mixMatch = ref.match(/^EVENTUM-MIX-(\d+)-TXN-(\d+)-/i);
  if (mixMatch) {
    return {
      transaccionProductoId: Number(mixMatch[2]),
      transaccionCheckoutId: Number(mixMatch[1]),
    };
  }

  const prodTxnMatch = ref.match(/^EVENTUM-PROD-TXN-(\d+)-/i);
  if (prodTxnMatch) {
    return { transaccionProductoId: Number(prodTxnMatch[1]), transaccionCheckoutId: null };
  }

  return { transaccionProductoId: null, transaccionCheckoutId: null };
}

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}
