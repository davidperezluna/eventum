import { describe, expect, it } from 'vitest';
import { extractEntitiesLocally, hasSufficientEntities } from './extract-local.js';

describe('extractEntitiesLocally', () => {
  it('extracts email', () => {
    const e = extractEntitiesLocally('El cliente pagó con daniel@gmail.com');
    expect(e.emails).toContain('daniel@gmail.com');
    expect(hasSufficientEntities(e)).toBe(true);
  });

  it('extracts checkout id', () => {
    const e = extractEntitiesLocally('checkout #1939');
    expect(e.checkoutId).toBe(1939);
  });

  it('extracts wompi reference', () => {
    const e = extractEntitiesLocally('ref EVENTUM-CHK-TXN-1939-abc');
    expect(e.wompiReference).toMatch(/EVENTUM-CHK-TXN-1939/i);
    expect(e.checkoutId).toBe(1939);
  });

  it('returns empty for text without entities', () => {
    const e = extractEntitiesLocally('hola mundo');
    expect(hasSufficientEntities(e)).toBe(false);
  });
});
