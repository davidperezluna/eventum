import type { BoletaEmailMatch, MatchType } from '../domain/types.js';
import type { SupabasePort } from './supabase.js';
import { withTimeout } from './supabase.js';
import type { AgentConfig } from './config.js';
import {
  buildEmailContext,
  extractEmailFromCheckoutPayload,
  extractWompiReceiptEmail,
} from './email-context.js';
import { normalizeEmail } from './parse-reference.js';

/** @see supabase/functions/wompi-reconcile-lookup/index.ts CHECKOUT_SELECT */
export const CHECKOUT_SELECT = `
  id, tipo, cliente_id, evento_id, wompi_cuenta_id,
  compra_id, compra_producto_id, compra_cover_id,
  numero_intento, wompi_transaction_id, wompi_reference, wompi_status,
  estado, es_activa, materializado, total, moneda,
  fecha_creacion, fecha_confirmacion, fecha_cancelacion,
  request_payload, response_payload, metadata,
  cliente:usuarios(id, nombre, apellido, email, documento_identidad),
  evento:eventos(id, titulo, wompi_cuenta_id)
`;

type RawMatch = {
  type: MatchType;
  checkout: Record<string, unknown>;
  searchEmail?: string;
};

export interface LookupPort {
  lookup(entities: {
    emails: string[];
    checkoutId?: number;
    wompiReference?: string;
    wompiTransactionId?: string;
  }): Promise<BoletaEmailMatch[]>;
}

export function createLookup(supabase: SupabasePort, config: AgentConfig): LookupPort {
  return {
    async lookup(entities) {
      const raw: RawMatch[] = [];
      const seenCheckoutIds = new Set<number>();

      const push = (type: MatchType, checkout: Record<string, unknown>, searchEmail?: string) => {
        const id = Number(checkout.id);
        if (!Number.isFinite(id) || id <= 0 || seenCheckoutIds.has(id)) return;
        seenCheckoutIds.add(id);
        raw.push({ type, checkout, searchEmail });
      };

      const loadCheckoutById = async (id: number) => {
        const { data } = await withTimeout(
          supabase
            .from('transacciones_checkout')
            .select(CHECKOUT_SELECT)
            .eq('id', id)
            .maybeSingle(),
          config.supabaseTimeoutMs,
          'loadCheckoutById',
        );
        return data as Record<string, unknown> | null;
      };

      if (entities.checkoutId) {
        const row = await loadCheckoutById(entities.checkoutId);
        if (row) push('eventum_account', row);
      }

      if (entities.wompiReference) {
        const { data } = await withTimeout(
          supabase
            .from('transacciones_checkout')
            .select(CHECKOUT_SELECT)
            .eq('wompi_reference', entities.wompiReference)
            .maybeSingle(),
          config.supabaseTimeoutMs,
          'lookupByReference',
        );
        if (data) push('wompi_receipt', data as Record<string, unknown>);
      }

      if (entities.wompiTransactionId) {
        const { data } = await withTimeout(
          supabase
            .from('transacciones_checkout')
            .select(CHECKOUT_SELECT)
            .eq('wompi_transaction_id', entities.wompiTransactionId)
            .order('fecha_creacion', { ascending: false })
            .limit(1)
            .maybeSingle(),
          config.supabaseTimeoutMs,
          'lookupByTxId',
        );
        if (data) push('wompi_receipt', data as Record<string, unknown>);
      }

      for (const email of entities.emails) {
        await searchByEmail(supabase, config, email, push);
      }

      const enriched = await Promise.all(
        raw.slice(0, config.lookupLimit).map((m) => enrichMatch(supabase, config, m)),
      );

      return enriched.sort((a, b) => {
        const da = a.fechaCreacion ? Date.parse(a.fechaCreacion) : 0;
        const db = b.fechaCreacion ? Date.parse(b.fechaCreacion) : 0;
        return db - da;
      });
    },
  };
}

async function searchByEmail(
  supabase: SupabasePort,
  config: AgentConfig,
  emailInput: string,
  push: (type: MatchType, checkout: Record<string, unknown>, searchEmail?: string) => void,
): Promise<void> {
  const email = normalizeEmail(emailInput);
  if (!email.includes('@')) return;

  const { data: usuario } = await withTimeout(
    supabase
      .from('usuarios')
      .select('id, nombre, apellido, email')
      .ilike('email', email)
      .maybeSingle(),
    config.supabaseTimeoutMs,
    'lookupUsuario',
  );

  if (usuario?.id) {
    const { data: byCliente } = await withTimeout(
      supabase
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .eq('cliente_id', Number(usuario.id))
        .order('fecha_creacion', { ascending: false })
        .limit(config.lookupLimit),
      config.supabaseTimeoutMs,
      'lookupByCliente',
    );
    for (const row of byCliente ?? []) {
      push('eventum_account', row as Record<string, unknown>, email);
    }
  }

  const { data: byWompiPayload } = await withTimeout(
    supabase
      .from('transacciones_checkout')
      .select(CHECKOUT_SELECT)
      .eq('response_payload->>customer_email', email)
      .order('fecha_creacion', { ascending: false })
      .limit(config.lookupLimit),
    config.supabaseTimeoutMs,
    'lookupByWompiEmail',
  );
  for (const row of byWompiPayload ?? []) {
    push('wompi_receipt', row as Record<string, unknown>, email);
  }

  const { data: asistenteUsuario } = await withTimeout(
    supabase.from('usuarios').select('id').ilike('email', email).maybeSingle(),
    config.supabaseTimeoutMs,
    'lookupAsistenteUsuario',
  );

  if (asistenteUsuario?.id) {
    const { data: boletas } = await withTimeout(
      supabase
        .from('boletas_compradas')
        .select('compra_id')
        .eq('asistente_usuario_id', Number(asistenteUsuario.id))
        .limit(config.lookupLimit),
      config.supabaseTimeoutMs,
      'lookupBoletasAsistente',
    );

    const compraIds = [
      ...new Set(
        (boletas ?? [])
          .map((b) => Number((b as { compra_id?: number }).compra_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    for (const compraId of compraIds) {
      const { data: checkoutRow } = await withTimeout(
        supabase
          .from('transacciones_checkout')
          .select(CHECKOUT_SELECT)
          .eq('compra_id', compraId)
          .order('fecha_creacion', { ascending: false })
          .limit(1)
          .maybeSingle(),
        config.supabaseTimeoutMs,
        'lookupCheckoutByCompra',
      );
      if (checkoutRow) {
        push('ticket_attendee', checkoutRow as Record<string, unknown>, email);
      }
    }
  }
}

async function enrichMatch(
  supabase: SupabasePort,
  config: AgentConfig,
  raw: RawMatch,
): Promise<BoletaEmailMatch> {
  const checkout = raw.checkout;
  const ctx = buildEmailContext({ checkout });
  const compraId = checkout.compra_id ? Number(checkout.compra_id) : undefined;

  let ticketCount: number | undefined;
  if (compraId) {
    const { count } = await withTimeout(
      supabase
        .from('boletas_compradas')
        .select('id', { count: 'exact', head: true })
        .eq('compra_id', compraId),
      config.supabaseTimeoutMs,
      'countBoletas',
    );
    ticketCount = count ?? 0;
  }

  const evento = checkout.evento as { titulo?: string } | null | undefined;
  const creationEmail = extractEmailFromCheckoutPayload(checkout);

  if (creationEmail && !ctx.emailAlCrearCheckout) {
    ctx.emailAlCrearCheckout = creationEmail;
  }

  let type = raw.type;
  if (type === 'wompi_receipt' && creationEmail && raw.searchEmail === creationEmail) {
    type = 'checkout_creation';
  }

  return {
    type,
    email: raw.searchEmail,
    checkoutId: Number(checkout.id),
    purchaseId: compraId,
    eventTitle: evento?.titulo ?? undefined,
    state: String(checkout.estado ?? checkout.wompi_status ?? '—'),
    materialized: checkout.materializado === true,
    ticketCount,
    wompiReceiptEmail: ctx.emailWompiComprobante ?? extractWompiReceiptEmail(checkout) || undefined,
    eventumAccountEmail: ctx.emailCuentaEventum ?? undefined,
    checkoutCreationEmail: ctx.emailAlCrearCheckout ?? undefined,
    emailsMatch: ctx.emailsCoinciden,
    confidence: raw.searchEmail ? 'exact' : 'partial',
    fechaCreacion: (checkout.fecha_creacion as string | null) ?? null,
  };
}
