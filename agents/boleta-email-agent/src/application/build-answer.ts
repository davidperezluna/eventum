import type {
  BoletaEmailMatch,
  ExtractedEntities,
  ResolveBoletaEmailResult,
  ResolveStatus,
} from '../domain/types.js';
import { isDbWompiApproved } from '../infrastructure/email-context.js';

export function buildAnswer(
  entities: ExtractedEntities,
  matches: BoletaEmailMatch[],
  displayLimit: number,
): ResolveBoletaEmailResult {
  const status = deriveStatus(matches);
  const answer = formatAnswer(entities, matches, status, displayLimit);

  return {
    answer,
    status,
    entities,
    matches,
  };
}

function deriveStatus(matches: BoletaEmailMatch[]): ResolveStatus {
  if (!matches.length) return 'not_found';

  const needsReconcile = matches.some(
    (m) =>
      !m.materialized &&
      (String(m.state ?? '').toLowerCase() === 'aprobada' ||
        String(m.state ?? '').toUpperCase() === 'APPROVED'),
  );
  if (needsReconcile) return 'requires_reconciliation';

  if (matches.length > 1) return 'ambiguous';

  return 'resolved';
}

function formatAnswer(
  entities: ExtractedEntities,
  matches: BoletaEmailMatch[],
  status: ResolveStatus,
  displayLimit: number,
): string {
  if (!entities.emails.length && !entities.checkoutId && !entities.wompiReference && !entities.wompiTransactionId) {
    return 'No pude identificar un correo, checkout ID, referencia o transacción en la consulta. Indica al menos uno.';
  }

  if (!matches.length) {
    return [
      'Sin resultados en Eventum para los criterios dados.',
      '',
      'Sugerencias:',
      '- Prueba con el otro correo (comprobante Wompi vs cuenta Eventum).',
      '- Busca por Checkout ID, referencia Wompi o ID de transacción.',
    ].join('\n');
  }

  const lines: string[] = [];
  const top = matches.slice(0, displayLimit);

  const primary = pickPrimaryMatch(matches);
  if (primary) {
    appendMatchBlock(lines, primary, 'Resultado principal');
    if (
      primary.materialized &&
      primary.emailsMatch === false &&
      primary.eventumAccountEmail &&
      primary.wompiReceiptEmail
    ) {
      lines.push('');
      lines.push('Recomendación:');
      lines.push(
        `Las boletas están asociadas a la cuenta Eventum ${primary.eventumAccountEmail}.`,
      );
      lines.push(
        `El usuario debe iniciar sesión con esa cuenta (Mis compras), no con el correo del comprobante Wompi (${primary.wompiReceiptEmail}).`,
      );
    } else if (primary.type === 'ticket_attendee') {
      lines.push('');
      lines.push('Recomendación:');
      lines.push(
        'Este correo corresponde al asistente de la boleta, no necesariamente al comprador. Las boletas se gestionan desde la cuenta del comprador en Eventum.',
      );
    } else if (
      status === 'requires_reconciliation' ||
      (!primary.materialized && isDbWompiApproved(primary.state, primary.state))
    ) {
      lines.push('');
      lines.push('Recomendación:');
      lines.push(
        'El checkout parece aprobado pero sin compra materializada. Revisa en Reconciliación Wompi y usa Sincronizar si aplica.',
      );
    } else if (primary.eventumAccountEmail && primary.materialized) {
      lines.push('');
      lines.push('Recomendación:');
      lines.push(`Boletas en la cuenta Eventum ${primary.eventumAccountEmail} → Mis compras.`);
    }
  }

  if (matches.length > 1) {
    lines.push('');
    lines.push(`Otros checkouts encontrados (${Math.min(top.length, displayLimit)} de ${matches.length}):`);
    for (const m of top) {
      if (m.checkoutId === primary?.checkoutId) continue;
      lines.push(
        `- Checkout #${m.checkoutId} · ${m.eventTitle ?? '—'} · ${m.state ?? '—'} · ${matchTypeLabel(m.type)}`,
      );
    }
    if (matches.length > displayLimit) {
      lines.push(`… y ${matches.length - displayLimit} más.`);
    }
  }

  if (status === 'ambiguous') {
    lines.push('');
    lines.push('Nota: hay varios resultados posibles; verifica cuál corresponde al caso del cliente.');
  }

  return lines.join('\n');
}

function pickPrimaryMatch(matches: BoletaEmailMatch[]): BoletaEmailMatch | undefined {
  const materialized = matches.find((m) => m.materialized && m.purchaseId);
  if (materialized) return materialized;
  return matches[0];
}

function appendMatchBlock(lines: string[], m: BoletaEmailMatch, title: string): void {
  lines.push(title + ':');
  if (m.eventumAccountEmail) {
    lines.push(`Cuenta Eventum: ${m.eventumAccountEmail}`);
  }
  if (m.purchaseId) {
    lines.push(`Compra: #${m.purchaseId}`);
  }
  if (m.ticketCount != null) {
    lines.push(`Boletas: ${m.ticketCount}`);
  }
  if (m.eventTitle) {
    lines.push(`Evento: ${m.eventTitle}`);
  }
  if (m.wompiReceiptEmail) {
    lines.push(`Comprobante Wompi: ${m.wompiReceiptEmail}`);
  }
  if (m.checkoutCreationEmail && m.checkoutCreationEmail !== m.wompiReceiptEmail) {
    lines.push(`Email al crear checkout: ${m.checkoutCreationEmail}`);
  }
  if (m.checkoutId) {
    lines.push(`Checkout: #${m.checkoutId}`);
  }
  if (m.state) {
    lines.push(`Estado: ${m.state}`);
  }
  if (m.materialized != null) {
    lines.push(`Materializado: ${m.materialized ? 'sí' : 'no'}`);
  }
  lines.push(`Coincidencia: ${matchTypeLabel(m.type)}`);
}

function matchTypeLabel(type: BoletaEmailMatch['type']): string {
  switch (type) {
    case 'eventum_account':
      return 'Cuenta Eventum';
    case 'wompi_receipt':
      return 'Comprobante Wompi';
    case 'checkout_creation':
      return 'Email al crear checkout';
    case 'ticket_attendee':
      return 'Asistente de boleta';
    default:
      return type;
  }
}

export function attachUsage(
  result: ResolveBoletaEmailResult,
  usage: { usedOpenAI: boolean; inputTokens?: number; outputTokens?: number },
): ResolveBoletaEmailResult {
  return { ...result, usage };
}

export function invalidQueryResult(query: string): ResolveBoletaEmailResult {
  return {
    answer: 'La consulta está vacía o excede el tamaño máximo permitido.',
    status: 'invalid_query',
    entities: { emails: [] },
    matches: [],
  };
}
