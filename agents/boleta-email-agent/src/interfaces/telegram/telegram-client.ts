import type { AgentConfig } from '../../infrastructure/config.js';
import { ExternalServiceError } from '../../domain/errors.js';
import type { TelegramSendMessageResponse } from './telegram-types.js';

export async function sendTelegramMessage(
  config: AgentConfig,
  chatId: number,
  text: string,
): Promise<void> {
  if (!config.telegramBotToken) {
    throw new ExternalServiceError('TELEGRAM_BOT_TOKEN no configurado', 'telegram');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.telegramTimeoutMs);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.slice(0, 4096),
        }),
        signal: controller.signal,
      },
    );

    const data = (await response.json()) as TelegramSendMessageResponse;
    if (!response.ok || !data.ok) {
      throw new ExternalServiceError(
        data.description || 'Telegram sendMessage failed',
        'telegram',
      );
    }
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;
    throw new ExternalServiceError('Telegram sendMessage failed', 'telegram', error);
  } finally {
    clearTimeout(timer);
  }
}
