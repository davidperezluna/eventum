import type {
  BoletaEmailAgent,
  ResolveBoletaEmailContext,
  ResolveBoletaEmailResult,
} from '../domain/types.js';
import { InvalidAgentQueryError } from '../domain/errors.js';
import type { AgentConfig } from '../infrastructure/config.js';
import type { AgentLogger } from '../infrastructure/logger.js';
import { maskQueryForLog } from '../infrastructure/logger.js';
import type { LookupPort } from '../infrastructure/lookup.js';
import type { EntityExtractor } from '../infrastructure/extract-with-llm.js';
import { hasSufficientEntities } from '../infrastructure/extract-local.js';
import { resolveQueryEntities } from './resolve-query.js';
import { attachUsage, buildAnswer, invalidQueryResult } from './build-answer.js';

export type BoletaEmailAgentDeps = {
  config: AgentConfig;
  lookup: LookupPort;
  llmExtractor: EntityExtractor;
  logger: AgentLogger;
};

export function createBoletaEmailAgent(deps: BoletaEmailAgentDeps): BoletaEmailAgent {
  const { config, lookup, llmExtractor, logger } = deps;

  return {
    async resolve(
      query: string,
      context: ResolveBoletaEmailContext,
    ): Promise<ResolveBoletaEmailResult> {
      const started = Date.now();
      const trimmed = query.trim();

      if (!trimmed || trimmed.length > config.maxQueryLength) {
        const result = invalidQueryResult(trimmed);
        logger.event({
          source: context.source,
          durationMs: Date.now() - started,
          usedOpenAI: false,
          matchCount: 0,
          status: result.status,
          errorCode: 'INVALID_QUERY',
        });
        return result;
      }

      try {
        const queryResolution = await resolveQueryEntities(trimmed, {
          forceNoAi: context.forceNoAi,
          llmExtractor,
        });

        if (!hasSufficientEntities(queryResolution.entities)) {
          throw new InvalidAgentQueryError(
            'No se encontraron correos, checkout ID, referencia ni transacción en la consulta.',
          );
        }

        const matches = await lookup.lookup(queryResolution.entities);
        let result = buildAnswer(
          queryResolution.entities,
          matches,
          config.answerDisplayLimit,
        );
        result = attachUsage(result, {
          usedOpenAI: queryResolution.usedOpenAI,
          inputTokens: queryResolution.inputTokens,
          outputTokens: queryResolution.outputTokens,
        });

        logger.event({
          source: context.source,
          durationMs: Date.now() - started,
          usedOpenAI: queryResolution.usedOpenAI,
          inputTokens: queryResolution.inputTokens,
          outputTokens: queryResolution.outputTokens,
          matchCount: matches.length,
          status: result.status,
        });

        logger.info('resolve ok', {
          source: context.source,
          query: maskQueryForLog(trimmed),
          status: result.status,
          matchCount: matches.length,
        });

        return result;
      } catch (error) {
        logger.error('resolve failed', {
          source: context.source,
          query: maskQueryForLog(trimmed),
          error: error instanceof Error ? error.message : 'unknown',
        });

        if (error instanceof InvalidAgentQueryError) {
          const result: ResolveBoletaEmailResult = {
            answer: error.message,
            status: 'invalid_query',
            entities: { emails: [] },
            matches: [],
          };
          logger.event({
            source: context.source,
            durationMs: Date.now() - started,
            usedOpenAI: false,
            matchCount: 0,
            status: 'invalid_query',
            errorCode: 'INVALID_QUERY',
          });
          return result;
        }

        throw error;
      }
    },
  };
}
