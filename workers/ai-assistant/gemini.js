/* ── gemini.js — AI inference helper ─────────────────────────
 *
 * Despite the legacy filename, this module now talks to **Cloudflare
 * Workers AI** (env.AI.run), not Google Gemini. We kept the filename
 * + exported function names (`callGemini`, `tryParseJson`) so worker.js
 * didn't need to change — those names are now misnomers but the
 * imports continue to work.
 *
 * Why Cloudflare Workers AI?
 *   • No separate API key to manage — the env.AI binding (declared in
 *     wrangler.jsonc) gives the worker direct access.
 *   • Free quota: 10,000 neurons/day on the Workers free plan
 *     (≈ 30,000+ calls for an 8B model). Never expires, no card.
 *   • Edge-hosted inference — same Cloudflare colo as your worker,
 *     so latency is measured in tens of milliseconds.
 *   • Same Llama 3.1 8B model the rest of the industry rates as
 *     "good enough for short summarisation + structured output."
 *
 * Model selection: env.AI_MODEL, defaulting to
 *   @cf/meta/llama-3.1-8b-instruct
 * Catalog: https://developers.cloudflare.com/workers-ai/models/
 * ─────────────────────────────────────────────────────────── */

export async function callGemini(env, prompt, opts) {
    if (!env.AI || typeof env.AI.run !== 'function') {
        throw new Error('Cloudflare AI binding not available — check wrangler.jsonc has the "ai" binding');
    }
    const model = (env.AI_MODEL || env.GEMINI_MODEL || '@cf/meta/llama-3.1-8b-instruct');
    const wantJson = !!(opts && opts.json);

    // Llama-style chat-completion input. We split the prompt into a
    // light system message + a user message — that's what
    // instruct-tuned Llama responds best to.
    const systemHint = wantJson
        ? 'You are a precise assistant. Always respond with a single valid JSON object that matches the schema described in the user message. No markdown, no code fences, no explanation — just the JSON.'
        : 'You are a concise, friendly assistant for the Andaman Voyages travel agency. Answer using the format requested in the user message.';

    const messages = [
        { role: 'system', content: systemHint },
        { role: 'user',   content: String(prompt || '') }
    ];

    const inferenceOpts = {
        max_tokens:  (opts && opts.maxTokens)  || 1024,
        temperature: (opts && typeof opts.temperature === 'number') ? opts.temperature : 0.4
    };

    let result;
    try {
        result = await env.AI.run(model, { messages, ...inferenceOpts });
    } catch (err) {
        throw new Error('Cloudflare AI error: ' + (err && err.message || err));
    }

    // Llama 3.1 returns { response: '...' }. Some other models return
    // { result: { response: '...' } } or a raw string. Normalise.
    let text = '';
    if (typeof result === 'string') {
        text = result;
    } else if (result && typeof result.response === 'string') {
        text = result.response;
    } else if (result && result.result && typeof result.result.response === 'string') {
        text = result.result.response;
    } else if (result && Array.isArray(result.choices) && result.choices[0]) {
        text = String((result.choices[0].message && result.choices[0].message.content) || '');
    } else {
        text = JSON.stringify(result || {});
    }

    return { text: String(text).trim(), raw: result };
}

/* Try to extract JSON from an LLM response. Llama sometimes wraps
   the JSON in ```json fences or trailing prose, so we tolerate that.
   Returns null if parsing fails. */
export function tryParseJson(text) {
    if (!text) return null;
    let s = String(text).trim();
    // Strip markdown fences if any
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // First try as-is
    try { return JSON.parse(s); } catch (_) {}
    // Then try to extract the first {...} block
    const m = /\{[\s\S]*\}/.exec(s);
    if (m) {
        try { return JSON.parse(m[0]); } catch (_) {}
    }
    return null;
}