// Supabase Edge Function: ai-proxy
// Proxies frontend requests to the Anthropic Messages API so that the secret
// ANTHROPIC_API_KEY never leaves the server. The frontend sends { model, max_tokens, system, messages }.
//
// Deploy:
//   supabase functions deploy ai-proxy --no-verify-jwt
// Secret (once):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Allowed models — prevents anyone from calling arbitrary/expensive models through the proxy.
const ALLOWED_MODELS = new Set([
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-haiku-4-5-20251001",
]);
const DEFAULT_MODEL = "claude-sonnet-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: { message: "ANTHROPIC_API_KEY is not configured on the server." } }, 500);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON in request." } }, 400);
  }

  const model = ALLOWED_MODELS.has(payload?.model) ? payload.model : DEFAULT_MODEL;
  // Raise the upper limit: Sonnet 5 "thinks" by default, so enough room must remain
  // for the answer itself besides the thinking (otherwise it spends everything on reasoning).
  const max_tokens = Math.min(Number(payload?.max_tokens) || 1500, 8192);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const system = typeof payload?.system === "string" ? payload.system : undefined;
  // Disable extended thinking by default (not needed for factual questions over the data
  // and it consumes the whole token budget). The client can explicitly pass its own `thinking` object.
  const thinking = payload?.thinking ?? { type: "disabled" };

  if (!messages.length) {
    return json({ error: { message: "Missing 'messages'." } }, 400);
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ model, max_tokens, system, messages, thinking }),
    });

    const data = await res.json();
    // Forward Anthropic's response (and status) back to the frontend as-is.
    return json(data, res.status);
  } catch (e) {
    return json({ error: { message: "Error calling the Anthropic API: " + (e?.message || e) } }, 502);
  }
});
