import { describe, expect, it } from 'vitest';
import { resolveQueryEntities } from './resolve-query.js';
import type { EntityExtractor } from '../infrastructure/extract-with-llm.js';

describe('resolveQueryEntities', () => {
  it('skips OpenAI when email present locally', async () => {
    const llm: EntityExtractor = {
      extract: async () => {
        throw new Error('should not call');
      },
    };

    const result = await resolveQueryEntities('daniel@gmail.com no ve boletas', {
      llmExtractor: llm,
    });

    expect(result.usedOpenAI).toBe(false);
    expect(result.entities.emails).toContain('daniel@gmail.com');
  });

  it('uses OpenAI when no local entities and merges', async () => {
    const llm: EntityExtractor = {
      extract: async () => ({
        entities: { emails: ['parsed@example.com'] },
        inputTokens: 10,
        outputTokens: 5,
      }),
    };

    const result = await resolveQueryEntities('cliente dice que pagó pero no encuentra entradas', {
      llmExtractor: llm,
    });

    expect(result.usedOpenAI).toBe(true);
    expect(result.entities.emails).toContain('parsed@example.com');
  });

  it('falls back to local when OpenAI fails but local has data', async () => {
    const llm: EntityExtractor = {
      extract: async () => {
        throw new Error('openai down');
      },
    };

    await expect(
      resolveQueryEntities('sin entidades claras', { llmExtractor: llm }),
    ).rejects.toThrow();
  });

  it('forceNoAi never calls llm', async () => {
    const llm: EntityExtractor = {
      extract: async () => ({ entities: { emails: ['x@y.com'] } }),
    };

    const result = await resolveQueryEntities('texto ambiguo', {
      forceNoAi: true,
      llmExtractor: llm,
    });
    expect(result.usedOpenAI).toBe(false);
  });
});
