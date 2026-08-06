import { describe, expect, it, vi } from 'vitest';
import { createBoletaEmailAgent } from './boleta-email-agent.js';
import type { AgentConfig } from '../infrastructure/config.js';
import type { LookupPort } from '../infrastructure/lookup.js';
import type { EntityExtractor } from '../infrastructure/extract-with-llm.js';
import { createConsoleLogger } from '../infrastructure/logger.js';

const config: AgentConfig = {
  supabaseUrl: 'https://x.supabase.co',
  supabaseServiceRoleKey: 'key',
  openAiModel: 'gpt-4o-mini',
  openAiTimeoutMs: 1000,
  supabaseTimeoutMs: 1000,
  telegramTimeoutMs: 1000,
  maxQueryLength: 2000,
  lookupLimit: 25,
  answerDisplayLimit: 5,
  adminServerPort: 8787,
  telegramAllowedUserIds: [],
};

describe('createBoletaEmailAgent', () => {
  it('resolves with mocked lookup', async () => {
    const lookup: LookupPort = {
      lookup: vi.fn().mockResolvedValue([
        {
          type: 'eventum_account' as const,
          checkoutId: 1,
          purchaseId: 2,
          eventumAccountEmail: 'cuenta@gmail.com',
          wompiReceiptEmail: 'wompi@gmail.com',
          emailsMatch: false,
          materialized: true,
          ticketCount: 1,
          eventTitle: 'Evento',
          state: 'aprobada',
          confidence: 'exact' as const,
        },
      ]),
    };

    const llmExtractor: EntityExtractor = { extract: async () => null };

    const agent = createBoletaEmailAgent({
      config,
      lookup,
      llmExtractor,
      logger: createConsoleLogger(),
    });

    const result = await agent.resolve('daniel@gmail.com', { source: 'cli', forceNoAi: true });
    expect(result.status).toBe('resolved');
    expect(result.matches).toHaveLength(1);
    expect(lookup.lookup).toHaveBeenCalled();
  });

  it('returns invalid_query for empty input', async () => {
    const lookup: LookupPort = { lookup: vi.fn() };
    const agent = createBoletaEmailAgent({
      config,
      lookup,
      llmExtractor: { extract: async () => null },
      logger: createConsoleLogger(),
    });

    const result = await agent.resolve('   ', { source: 'cli' });
    expect(result.status).toBe('invalid_query');
    expect(lookup.lookup).not.toHaveBeenCalled();
  });
});
