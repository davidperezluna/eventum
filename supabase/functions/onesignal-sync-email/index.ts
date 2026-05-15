/**
 * Crea la suscripción de canal "Email" en OneSignal vía API REST (columna Email del listado).
 * El SDK web a veces no completa esa suscripción; los tags sí (~addTags).
 *
 * Secrets (Dashboard Supabase → Project Settings → Edge Functions → Secrets):
 *   ONESIGNAL_APP_ID       = mismo App ID que en index.html
 *   ONESIGNAL_REST_API_KEY = Keys & IDs → REST API Key (prefijo Key …; aquí solo el valor)
 *
 * Desplegar: supabase functions deploy onesignal-sync-email
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email" }, 400);
    }

    const appId = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
    if (!appId || !apiKey) {
      return json(
        {
          error:
            "Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY in Edge Function secrets",
        },
        500
      );
    }

    const externalId = user.id;
    const url = `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(externalId)}/subscriptions`;

    const osRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription: {
          type: "Email",
          token: email,
          enabled: true,
        },
      }),
    });

    const osText = await osRes.text();
    let osBody: unknown;
    try {
      osBody = JSON.parse(osText);
    } catch {
      osBody = { raw: osText };
    }

    if (!osRes.ok) {
      return json(
        {
          error: "OneSignal API error",
          status: osRes.status,
          details: osBody,
        },
        502
      );
    }

    return json({ ok: true, onesignal: osBody }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
