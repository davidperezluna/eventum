import { describe, expect, it } from 'vitest';
import {
  isTelegramUserAllowed,
  validateTelegramWebhookSecret,
} from './admin-auth.js';
import type { AgentConfig } from './config.js';

const baseConfig = (): AgentConfig => ({
  supabaseUrl: 'https://x.supabase.co',
  supabaseServiceRoleKey: 'key',
  openAiModel: 'gpt-4o-mini',
  openAiTimeoutMs: 1000,
  supabaseTimeoutMs: 1000,
  telegramTimeoutMs: 1000,
  maxQueryLength: 2000,
  lookupLimit: 25,
  answerDisplayLimit: 5,
  telegramAllowedUserIds: [123, 456],
  telegramWebhookSecret: 'secret',
  adminServerPort: 8787,
});

describe('telegram auth helpers', () => {
  it('allows whitelisted user', () => {
    expect(isTelegramUserAllowed(baseConfig(), 123)).toBe(true);
  });

  it('rejects non whitelisted user', () => {
    expect(isTelegramUserAllowed(baseConfig(), 999)).toBe(false);
  });

  it('validates webhook secret', () => {
    expect(validateTelegramWebhookSecret(baseConfig(), 'secret')).toBe(true);
    expect(validateTelegramWebhookSecret(baseConfig(), 'wrong')).toBe(false);
  });
});
