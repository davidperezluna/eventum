export type ResolveSource = 'cli' | 'telegram' | 'admin';

export type ResolveBoletaEmailContext = {
  source: ResolveSource;
  requesterId?: string;
  forceNoAi?: boolean;
};

export type ResolveStatus =
  | 'resolved'
  | 'not_found'
  | 'ambiguous'
  | 'requires_reconciliation'
  | 'invalid_query';

export type MatchType =
  | 'eventum_account'
  | 'wompi_receipt'
  | 'checkout_creation'
  | 'ticket_attendee';

export type MatchConfidence = 'exact' | 'partial' | 'ambiguous';

export type BoletaEmailMatch = {
  type: MatchType;
  email?: string;
  checkoutId?: number;
  purchaseId?: number;
  eventTitle?: string;
  state?: string;
  materialized?: boolean;
  ticketCount?: number;
  wompiReceiptEmail?: string;
  eventumAccountEmail?: string;
  checkoutCreationEmail?: string;
  emailsMatch?: boolean | null;
  confidence: MatchConfidence;
  fechaCreacion?: string | null;
};

export type ExtractedEntities = {
  emails: string[];
  checkoutId?: number;
  wompiReference?: string;
  wompiTransactionId?: string;
};

export type ResolveBoletaEmailResult = {
  answer: string;
  status: ResolveStatus;
  entities: ExtractedEntities;
  matches: BoletaEmailMatch[];
  usage?: {
    usedOpenAI: boolean;
    inputTokens?: number;
    outputTokens?: number;
  };
};

export interface BoletaEmailAgent {
  resolve(
    query: string,
    context: ResolveBoletaEmailContext,
  ): Promise<ResolveBoletaEmailResult>;
}

export type AgentLogEvent = {
  source: ResolveSource;
  durationMs: number;
  usedOpenAI: boolean;
  inputTokens?: number;
  outputTokens?: number;
  matchCount: number;
  status: ResolveStatus;
  errorCode?: string;
};
