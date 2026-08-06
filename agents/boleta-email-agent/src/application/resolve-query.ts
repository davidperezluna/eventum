import type { ExtractedEntities } from '../domain/types.js';
import {
  extractEntitiesLocally,
  hasSufficientEntities,
  mergeEntities,
} from '../infrastructure/extract-local.js';
import type { EntityExtractor } from '../infrastructure/extract-with-llm.js';

export type ResolveQueryResult = {
  entities: ExtractedEntities;
  usedOpenAI: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

export async function resolveQueryEntities(
  query: string,
  options: {
    forceNoAi?: boolean;
    llmExtractor: EntityExtractor;
  },
): Promise<ResolveQueryResult> {
  const local = extractEntitiesLocally(query);

  if (options.forceNoAi || hasSufficientEntities(local)) {
    return { entities: local, usedOpenAI: false };
  }

  try {
    const llm = await options.llmExtractor.extract(query);
    if (!llm) {
      return { entities: local, usedOpenAI: false };
    }
    return {
      entities: mergeEntities(local, llm.entities),
      usedOpenAI: true,
      inputTokens: llm.inputTokens,
      outputTokens: llm.outputTokens,
    };
  } catch (error) {
    if (hasSufficientEntities(local)) {
      return { entities: local, usedOpenAI: false };
    }
    throw error;
  }
}
