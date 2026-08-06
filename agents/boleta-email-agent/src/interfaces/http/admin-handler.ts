import type { BoletaEmailAgent, ResolveBoletaEmailResult } from '../../domain/types.js';
import { AgentError, UnauthorizedRequesterError } from '../../domain/errors.js';
import type { AgentConfig } from '../../infrastructure/config.js';
import type { SupabasePort } from '../../infrastructure/supabase.js';
import { assertAdminBearer } from '../../infrastructure/admin-auth.js';

export type AdminRequestBody = {
  query?: string;
};

export type AdminSuccessResponse = {
  ok: true;
  result: ResolveBoletaEmailResult;
};

export type AdminErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};

export type AdminResponse = AdminSuccessResponse | AdminErrorResponse;

export async function handleAdminBoletaEmailRequest(params: {
  authorizationHeader: string | undefined;
  body: AdminRequestBody;
  agent: BoletaEmailAgent;
  supabase: SupabasePort;
  config: AgentConfig;
}): Promise<{ status: number; body: AdminResponse }> {
  try {
    const caller = await assertAdminBearer(
      params.supabase,
      params.config,
      params.authorizationHeader,
    );

    const query = String(params.body.query ?? '').trim();
    if (!query) {
      return {
        status: 400,
        body: { ok: false, error: { code: 'INVALID_QUERY', message: 'query es requerido' } },
      };
    }

    if (query.length > params.config.maxQueryLength) {
      return {
        status: 400,
        body: { ok: false, error: { code: 'INVALID_QUERY', message: 'query demasiado largo' } },
      };
    }

    const result = await params.agent.resolve(query, {
      source: 'admin',
      requesterId: String(caller.userId),
    });

    return { status: 200, body: { ok: true, result } };
  } catch (error) {
    if (error instanceof UnauthorizedRequesterError) {
      return {
        status: 403,
        body: { ok: false, error: { code: 'UNAUTHORIZED', message: error.message } },
      };
    }
    if (error instanceof AgentError) {
      return {
        status: 500,
        body: { ok: false, error: { code: error.code, message: error.message } },
      };
    }
    return {
      status: 500,
      body: { ok: false, error: { code: 'EXTERNAL_SERVICE', message: 'Error interno del agente' } },
    };
  }
}
