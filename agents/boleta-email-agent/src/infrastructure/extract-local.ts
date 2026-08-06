import type { ExtractedEntities } from '../domain/types.js';
import { normalizeEmail, parseReference } from './parse-reference.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EVENTUM_REF_REGEX = /EVENTUM-(?:CHK-TXN|MIX|PROD-TXN)-[\w-]+/gi;
const CHECKOUT_ID_REGEX = /(?:checkout\s*#?\s*|checkout_id\s*[:=]?\s*|#)(\d{1,10})/gi;
const TX_ID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const WOMPI_TX_ALNUM_REGEX = /\b[0-9]{5,20}\b/g;

export function extractEntitiesLocally(query: string): ExtractedEntities {
  const emails = [...new Set((query.match(EMAIL_REGEX) ?? []).map(normalizeEmail))];

  let checkoutId: number | undefined;
  for (const match of query.matchAll(CHECKOUT_ID_REGEX)) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0) {
      checkoutId = n;
      break;
    }
  }

  let wompiReference: string | undefined;
  const refMatch = query.match(EVENTUM_REF_REGEX);
  if (refMatch?.[0]) {
    wompiReference = refMatch[0];
    const parsed = parseReference(wompiReference);
    if (!checkoutId && parsed.transaccionCheckoutId) {
      checkoutId = parsed.transaccionCheckoutId;
    }
  }

  let wompiTransactionId: string | undefined;
  const uuidMatch = query.match(TX_ID_REGEX);
  if (uuidMatch?.[0]) {
    wompiTransactionId = uuidMatch[0];
  } else {
    const nums = query.match(WOMPI_TX_ALNUM_REGEX) ?? [];
    for (const num of nums) {
      if (checkoutId && String(checkoutId) === num) continue;
      wompiTransactionId = num;
      break;
    }
  }

  return {
    emails,
    checkoutId,
    wompiReference,
    wompiTransactionId,
  };
}

export function hasSufficientEntities(entities: ExtractedEntities): boolean {
  return (
    entities.emails.length > 0 ||
    !!entities.checkoutId ||
    !!entities.wompiReference ||
    !!entities.wompiTransactionId
  );
}

export function mergeEntities(
  local: ExtractedEntities,
  remote: Partial<ExtractedEntities>,
): ExtractedEntities {
  return {
    emails: [...new Set([...local.emails, ...(remote.emails ?? [])])],
    checkoutId: local.checkoutId ?? remote.checkoutId,
    wompiReference: local.wompiReference ?? remote.wompiReference,
    wompiTransactionId: local.wompiTransactionId ?? remote.wompiTransactionId,
  };
}
