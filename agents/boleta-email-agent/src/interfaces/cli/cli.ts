#!/usr/bin/env node
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createDefaultBoletaEmailAgent } from '../../index.js';
import { AgentConfigurationError, AgentError } from '../../domain/errors.js';

function parseArgs(argv: string[]): {
  json: boolean;
  noAi: boolean;
  queryParts: string[];
} {
  const json = argv.includes('--json');
  const noAi = argv.includes('--no-ai');
  const queryParts = argv.filter((a) => a !== '--json' && a !== '--no-ai');
  return { json, noAi, queryParts };
}

async function runOnce(query: string, json: boolean, noAi: boolean): Promise<number> {
  const agent = createDefaultBoletaEmailAgent();
  try {
    const result = await agent.resolve(query, { source: 'cli', forceNoAi: noAi });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.answer);
      if (result.usage?.usedOpenAI) {
        console.error(
          `[tokens in=${result.usage.inputTokens ?? 0} out=${result.usage.outputTokens ?? 0}]`,
        );
      }
    }
    return result.status === 'invalid_query' ? 1 : 0;
  } catch (error) {
    if (error instanceof AgentConfigurationError) {
      console.error('Configuración:', error.message);
      console.error('Copia .env.example a .env y completa SUPABASE_*');
      return 2;
    }
    if (error instanceof AgentError) {
      console.error(error.message);
      return 1;
    }
    console.error('Error inesperado');
    return 1;
  }
}

async function main(): Promise<number> {
  const { json, noAi, queryParts } = parseArgs(process.argv.slice(2));
  const inlineQuery = queryParts.join(' ').trim();

  if (inlineQuery) {
    return runOnce(inlineQuery, json, noAi);
  }

  const rl = readline.createInterface({ input, output });
  console.log('boleta-email-agent — escribe una consulta (Ctrl+C para salir)');
  try {
    while (true) {
      const line = (await rl.question('> ')).trim();
      if (!line) continue;
      await runOnce(line, json, noAi);
    }
  } finally {
    rl.close();
  }
}

main().then((code) => process.exit(code));
