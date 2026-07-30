// Supabase Edge Function: ai-proxy
// Proksira zahteve frontend-a ka Anthropic Messages API-ju, tako da tajni
// ANTHROPIC_API_KEY nikada ne napušta server. Frontend šalje { model, max_tokens, system, messages }.
//
// Deploy:
//   supabase functions deploy ai-proxy --no-verify-jwt
// Secret (jednom):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Dozvoljeni modeli — sprečava da neko preko proxy-ja poziva proizvoljne/skupe modele.
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
    return json({ error: { message: "ANTHROPIC_API_KEY nije podešen na serveru." } }, 500);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: "Nevažeći JSON u zahtevu." } }, 400);
  }

  const model = ALLOWED_MODELS.has(payload?.model) ? payload.model : DEFAULT_MODEL;
  // Podigni gornju granicu: Sonnet 5 podrazumevano "misli", pa mora ostati dovoljno
  // prostora za sam odgovor pored thinking-a (inače potroši sve na razmišljanje).
  const max_tokens = Math.min(Number(payload?.max_tokens) || 1500, 8192);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const system = typeof payload?.system === "string" ? payload.system : undefined;
  // Podrazumevano isključi extended thinking (za faktografska pitanja nad podacima nije potreban
  // i troši ceo token budžet). Klijent može eksplicitno da prosledi svoj `thinking` objekat.
  const thinking = payload?.thinking ?? { type: "disabled" };

  if (!messages.length) {
    return json({ error: { message: "Nedostaje 'messages'." } }, 400);
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
    // Prosleđujemo Anthropic-ov odgovor (i status) nazad frontend-u kakav jeste.
    return json(data, res.status);
  } catch (e) {
    return json({ error: { message: "Greška pri pozivu Anthropic API-ja: " + (e?.message || e) } }, 502);
  }
});
