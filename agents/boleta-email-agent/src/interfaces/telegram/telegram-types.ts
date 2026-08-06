export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

export type TelegramMessage = {
  message_id: number;
  from?: { id: number; is_bot?: boolean; first_name?: string };
  chat: { id: number; type: string };
  text?: string;
};

export type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};
