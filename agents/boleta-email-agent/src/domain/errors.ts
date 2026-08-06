export type AgentErrorCode =
  | 'CONFIGURATION'
  | 'INVALID_QUERY'
  | 'UNAUTHORIZED'
  | 'EXTERNAL_SERVICE'
  | 'NOT_FOUND';

export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: AgentErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class AgentConfigurationError extends AgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIGURATION', cause);
    this.name = 'AgentConfigurationError';
  }
}

export class InvalidAgentQueryError extends AgentError {
  constructor(message: string) {
    super(message, 'INVALID_QUERY');
    this.name = 'InvalidAgentQueryError';
  }
}

export class UnauthorizedRequesterError extends AgentError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedRequesterError';
  }
}

export class ExternalServiceError extends AgentError {
  constructor(
    message: string,
    readonly service: 'openai' | 'supabase' | 'telegram',
    cause?: unknown,
  ) {
    super(message, 'EXTERNAL_SERVICE', cause);
    this.name = 'ExternalServiceError';
  }
}
