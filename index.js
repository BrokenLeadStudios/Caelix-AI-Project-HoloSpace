const SYSTEM_PROMPT = `You are CAELIX, a composed, articulate personal AI assistant being developed for HoloSpace. Your style is calm, capable, precise, and warm without being overly familiar. Explain complex ideas clearly, help turn ideas into actionable steps, and be honest about uncertainty. Do not claim to control devices, access files, browse the web, remember information permanently, or perform actions unless a connected tool actually enables it. You are an assistant, not a fictional character. When useful, structure answers clearly but avoid needless verbosity.`;

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

function json(data, status = 200, origin = null) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  // Same-origin app; do not enable wildcard CORS.
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // same-origin navigations and some clients omit Origin
  try {
    const incoming = new URL(origin);
    const own = new URL(request.url);
    return incoming.origin === own.origin;
  } catch { return false; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, aiConfigured: Boolean(env.AI), model: MODEL });
    }

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") return json({ error: "Use POST for chat requests." }, 405);
      if (!allowedOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
      if (!env.AI) return json({ error: "The AI binding is not configured yet. Follow the README deployment steps." }, 503);

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Request body must be valid JSON." }, 400); }

      if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 16) {
        return json({ error: "Send between 1 and 16 recent messages." }, 400);
      }

      const messages = [];
      for (const item of body.messages) {
        if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
          return json({ error: "A message has an invalid format." }, 400);
        }
        const content = item.content.trim();
        if (!content || content.length > 8000) return json({ error: "Each message must be 1–8000 characters." }, 400);
        messages.push({ role: item.role, content });
      }

      try {
        const result = await env.AI.run(MODEL, {
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 900,
          temperature: 0.65
        });
        const reply = result?.response ?? result?.choices?.[0]?.message?.content;
        if (typeof reply !== "string" || !reply.trim()) {
          return json({ error: "The model returned no text. Please try again." }, 502);
        }
        return json({ reply: reply.trim(), model: MODEL });
      } catch (error) {
        // Avoid returning provider internals or secrets to the browser.
        console.error("CAELIX inference request failed:", error?.message || "unknown error");
        return json({ error: "The AI model could not complete that request. Check model availability and your Cloudflare AI quota, then try again." }, 502);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "API route not found." }, 404);

    return env.ASSETS.fetch(request);
  }
};
