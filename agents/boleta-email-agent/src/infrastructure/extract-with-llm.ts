import OpenAI from 'openai';
import type { AgentConfig } from './config.js';
import type { ExtractedEntities } from '../domain/types.js';
import { ExternalServiceError } from '../domain/errors.js';
import { normalizeEmail } from './parse-reference.js';

export type LlmExtractResult = {
  entities: ExtractedEntities;
  inputTokens?: number;
  outputTokens?: number;
};

const ENTITY_SCHEMA = {
  type: 'object' as const,
  properties: {
    emails: { type: 'array' as const, items: { type: 'string' as const } },
    wompi_reference: { type: ['string', 'null'] as const },
    wompi_transaction_id: { type: ['string', 'null'] as const },
    checkout_id: { type: ['integer', 'null'] as const },
  },
  required: ['emails', 'wompi_reference', 'wompi_transaction_id', 'checkout_id'] as const,
  additionalProperties: false,
};

export interface EntityExtractor {
  extract(query: string): Promise<LlmExtractResult | null>;
}

export function createOpenAiExtractor(config: AgentConfig): EntityExtractor {
  if (!config.openAiApiKey) {
    return { extract: async () => null };
  }

  const client = new OpenAI({ apiKey: config.openAiApiKey });

  return {
    async extract(query: string): Promise<LlmExtractResult | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.openAiTimeoutMs);

      try {
        const response = await client.chat.completions.create(
          {
            model: config.openAiModel,
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'Extrae entidades de consultas de soporte sobre boletas Eventum/Wompi. Devuelve solo JSON con emails, wompi_reference, wompi_transaction_id, checkout_id. Usa null si no aplica.',
              },
              { role: 'user', content: query },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'boleta_email_entities',
                strict: true,
                schema: ENTITY_SCHEMA,
              },
            },
          },
          { signal: controller.signal },
        );

        const raw = response.choices[0]?.message?.content;
        if (!raw) return null;

        const parsed = JSON.parse(raw) as {
          emails: string[];
          wompi_reference: string | null;
          wompi_transaction_id: string | null;
          checkout_id: number | null;
        };

        return {
          entities: {
            emails: (parsed.emails ?? []).map(normalizeEmail).filter((e) => e.includes('@')),
            wompiReference: parsed.wompi_reference ?? undefined,
            wompiTransactionId: parsed.wompi_transaction_id ?? undefined,
            checkoutId:
              parsed.checkout_id && parsed.checkout_id > 0 ? parsed.checkout_id : undefined,
          },
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('OpenAI timeout', 'openai', error);
        }
        throw new ExternalServiceError('OpenAI extraction failed', 'openai', error);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
