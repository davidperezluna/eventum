import { createServer } from 'node:http';
import { loadConfig } from '../../infrastructure/config.js';
import { createSupabaseClient } from '../../infrastructure/supabase.js';
import { createDefaultBoletaEmailAgent } from '../../index.js';
import { handleAdminBoletaEmailRequest } from './admin-handler.js';

const config = loadConfig();
const agent = createDefaultBoletaEmailAgent();
const supabase = createSupabaseClient(config);

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.url !== '/api/admin/agents/boleta-email' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));
    return;
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > config.maxQueryLength + 512) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const body = raw ? (JSON.parse(raw) as { query?: string }) : {};
      const { status, body: responseBody } = await handleAdminBoletaEmailRequest({
        authorizationHeader: req.headers.authorization,
        body,
        agent,
        supabase,
        config,
      });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_BODY', message: 'JSON inválido' } }));
    }
  });
});

server.listen(config.adminServerPort, () => {
  console.log(`boleta-email-agent admin server http://localhost:${config.adminServerPort}`);
  console.log('POST /api/admin/agents/boleta-email');
});
