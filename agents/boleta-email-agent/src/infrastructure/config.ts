import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentConfigurationError } from '../domain/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../../.env') });
loadDotenv();

export type AgentConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openAiApiKey?: string;
  openAiModel: string;
  openAiTimeoutMs: number;
  supabaseTimeoutMs: number;
  telegramTimeoutMs: number;
  maxQueryLength: number;
  lookupLimit: number;
  answerDisplayLimit: number;
  telegramBotToken?: string;
  telegramWebhookSecret?: string;
  telegramAllowedUserIds: number[];
  adminServerPort: number;
};

function parseAllowedUserIds(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function loadConfig(): AgentConfig {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new AgentConfigurationError(
      'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos',
    );
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openAiModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    openAiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 15_000),
    supabaseTimeoutMs: Number(process.env.SUPABASE_TIMEOUT_MS || 10_000),
    telegramTimeoutMs: Number(process.env.TELEGRAM_TIMEOUT_MS || 10_000),
    maxQueryLength: Number(process.env.MAX_QUERY_LENGTH || 2000),
    lookupLimit: Number(process.env.LOOKUP_LIMIT || 25),
    answerDisplayLimit: Number(process.env.ANSWER_DISPLAY_LIMIT || 5),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
    telegramAllowedUserIds: parseAllowedUserIds(process.env.TELEGRAM_ALLOWED_USER_IDS),
    adminServerPort: Number(process.env.ADMIN_SERVER_PORT || 8787),
  };
}
