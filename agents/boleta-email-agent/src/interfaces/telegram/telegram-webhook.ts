import { createServer } from 'node:http';
import { loadConfig } from '../../infrastructure/config.js';
import { createDefaultBoletaEmailAgent } from '../../index.js';
import {
  isTelegramUserAllowed,
  validateTelegramWebhookSecret,
} from '../../infrastructure/admin-auth.js';
import { sendTelegramMessage } from './telegram-client.js';
import type { TelegramUpdate } from './telegram-types.js';
import { AgentError } from '../../domain/errors.js';

const config = loadConfig();
const agent = createDefaultBoletaEmailAgent();

function getWebhookSecret(req: import('node:http').IncomingMessage): string | undefined {
  const header = req.headers['x-telegram-bot-api-secret-token'];
  if (typeof header === 'string') return header;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    return url.searchParams.get('secret') ?? undefined;
  } catch {
    return undefined;
  }
}

async function processMessage(chatId: number, userId: number, text: string): Promise<void> {
  if (!isTelegramUserAllowed(config, userId)) {
    await sendTelegramMessage(config, chatId, 'No autorizado para usar este bot.');
    return;
  }

  try {
    const result = await agent.resolve(text, {
      source: 'telegram',
      requesterId: String(userId),
    });
    await sendTelegramMessage(config, chatId, result.answer);
  } catch (error) {
    const message =
      error instanceof AgentError
        ? 'No pude procesar la consulta. Intenta de nuevo más tarde.'
        : 'Error temporal. Intenta más tarde.';
    await sendTelegramMessage(config, chatId, message);
    console.error('[telegram] process error', error instanceof Error ? error.message : error);
  }
}

const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }

  const secret = getWebhookSecret(req);
  if (!validateTelegramWebhookSecret(config, secret)) {
    res.writeHead(401).end();
    return;
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });

  req.on('end', () => {
    res.writeHead(200).end('ok');

    try {
      const update = JSON.parse(raw) as TelegramUpdate;
      const message = update.message;
      if (!message?.text || !message.from?.id) return;

      void processMessage(message.chat.id, message.from.id, message.text);
    } catch (error) {
      console.error('[telegram] invalid update', error instanceof Error ? error.message : error);
    }
  });
});

const port = Number(process.env.TELEGRAM_WEBHOOK_PORT || 8788);
server.listen(port, () => {
  console.log(`boleta-email-agent telegram webhook on http://localhost:${port}`);
});
