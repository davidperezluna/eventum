import type { AgentLogEvent } from '../domain/types.js';

export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at <= 0) return '***';
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const maskedLocal =
    local.length <= 2
      ? '*'.repeat(local.length)
      : `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

export function maskQueryForLog(query: string): string {
  return query.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    (m) => maskEmail(m),
  );
}

export interface AgentLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  event(event: AgentLogEvent): void;
}

export function createConsoleLogger(): AgentLogger {
  return {
    info(message, meta) {
      console.log(message, meta ?? '');
    },
    warn(message, meta) {
      console.warn(message, meta ?? '');
    },
    error(message, meta) {
      console.error(message, meta ?? '');
    },
    event(event) {
      console.log('[boleta-email-agent]', JSON.stringify(event));
    },
  };
}
