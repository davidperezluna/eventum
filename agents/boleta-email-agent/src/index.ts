import { loadConfig } from './infrastructure/config.js';
import { createConsoleLogger } from './infrastructure/logger.js';
import { createSupabaseClient } from './infrastructure/supabase.js';
import { createLookup } from './infrastructure/lookup.js';
import { createOpenAiExtractor } from './infrastructure/extract-with-llm.js';
import { createBoletaEmailAgent } from './application/boleta-email-agent.js';

export * from './domain/types.js';
export * from './domain/errors.js';
export { createBoletaEmailAgent } from './application/boleta-email-agent.js';
export { extractEntitiesLocally, hasSufficientEntities } from './infrastructure/extract-local.js';
export { buildAnswer } from './application/build-answer.js';
export { handleAdminBoletaEmailRequest } from './interfaces/http/admin-handler.js';

export function createDefaultBoletaEmailAgent() {
  const config = loadConfig();
  const logger = createConsoleLogger();
  const supabase = createSupabaseClient(config);
  const lookup = createLookup(supabase, config);
  const llmExtractor = createOpenAiExtractor(config);

  return createBoletaEmailAgent({
    config,
    lookup,
    llmExtractor,
    logger,
  });
}
