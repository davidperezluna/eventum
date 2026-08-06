# boleta-email-agent

Agente de soporte para responder **en qué correo pueden estar las boletas** (cuenta Eventum, comprobante Wompi, asistente). Módulo **independiente** — no modifica Edge Functions existentes.

## Arquitectura

```
interfaces/     CLI, Telegram webhook, HTTP admin  →  solo I/O
application/    boletaEmailAgent.resolve()         →  caso de uso
infrastructure/ Supabase, OpenAI, lookup           →  datos externos
domain/         types, errors
```

```ts
import { createDefaultBoletaEmailAgent } from './src/index.js';

const agent = createDefaultBoletaEmailAgent();
const result = await agent.resolve('El cliente pagó con daniel@gmail.com', {
  source: 'cli',
});
console.log(result.answer);
```

## Variables de entorno

Copia `.env.example` a `.env`:

| Variable | Requerido | Descripción |
|----------|-----------|-------------|
| `SUPABASE_URL` | Sí | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Solo backend — nunca en Angular |
| `OPENAI_API_KEY` | No | Extracción NL (si falta, usa solo regex local) |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
| `TELEGRAM_BOT_TOKEN` | Telegram | Token del bot |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram | Secreto del webhook |
| `TELEGRAM_ALLOWED_USER_IDS` | Telegram | CSV de user IDs autorizados |
| `ADMIN_SERVER_PORT` | No | Default `8787` |

## Instalación

```bash
cd agents/boleta-email-agent
npm install
cp .env.example .env
# Editar .env con SUPABASE_* y opcionalmente OPENAI_*
```

Desde la raíz del monorepo (tras `npm install` en el agente):

```bash
npm run agent:boleta-email -- "daniel@gmail.com no ve boletas"
npm run agent:boleta-email -- --json --no-ai "daniel@gmail.com"
npm run agent:boleta-email:test
```

## CLI

```bash
npm run cli                              # interactivo
npm run cli -- "consulta..."             # one-shot
npm run cli -- --no-ai "a@b.com"         # sin OpenAI
npm run cli -- --json "consulta..."      # salida JSON
```

## Servidor admin (Node)

```bash
npm run server
```

```http
POST /api/admin/agents/boleta-email
Authorization: Bearer <jwt_admin_supabase>
Content-Type: application/json

{ "query": "El cliente pagó con daniel@gmail.com" }
```

Respuesta: `{ "ok": true, "result": { "answer", "status", "entities", "matches", "usage" } }`

## Telegram

1. Configura `TELEGRAM_*` en `.env`.
2. Inicia el webhook: `npm run telegram` (puerto `TELEGRAM_WEBHOOK_PORT`, default 8788).
3. Registra el webhook en Telegram con el header `X-Telegram-Bot-Api-Secret-Token`.

Solo usuarios en `TELEGRAM_ALLOWED_USER_IDS` pueden consultar.

## Tokens OpenAI

- Extracción **local primero** (emails, checkout ID, referencia Wompi).
- **Una sola** llamada OpenAI si la consulta es ambigua.
- **Cero** filas de Supabase enviadas al modelo.
- Respuesta final por **plantillas locales** (sin 2ª llamada GPT).
- `--no-ai` fuerza extracción local.

## Seguridad

- Service role solo en procesos Node del agente.
- Logs enmascaran correos.
- El agente **solo consulta** — no sincroniza ni modifica compras.
- Telegram: whitelist obligatoria.

## Tests

```bash
npm test
```

## Fase 2 (futuro)

Tras validar en producción: evaluar módulo compartido con `wompi-reconcile-lookup`, Edge Function dedicada, UI en `/wompi-reconcile`, WhatsApp.
