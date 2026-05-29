/* ── gemini.js — Google Gemini 1.5 Flash REST helper ───────────
 * Free tier docs:  https://ai.google.dev/gemini-api/docs/api-key
 * 1,500 req/day, 15 RPM, no credit card required.
 * Get a key at https://aistudio.google.com/apikey
 * ─────────────────────────────────────────────────────────────── */

export async function callGemini(env, prompt, opts) {
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY secret not set');
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) + ':generateContent?key=' +
        encodeURIComponent(env.GEMINI_API_KEY);

    const body = {
        contents: [{ parts: [{ text: String(prompt || '') }] }],
        generationConfig: {
            temperature: (opts && typeof opts.temperature === 'number') ? opts.temperature : 0.4,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: (opts && opts.maxTokens) || 1024,
            responseMimeType: (opts && opts.json) ? 'application/json' : 'text/plain'
        },
        // Loosened to BLOCK_ONLY_HIGH so the model will summarise
        // complaint / cancellation emails. Only admins see output,
        // and they always review before clicking Send on any reply.
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_ONLY_HIGH' }
        ]
    };

    // Try once; if Google returns 429 (rate limited), wait the
    // RetryDelay it suggests and retry exactly once. After that we
    // surface the error so the caller can decide what to do (e.g. the
    // frontend just shows a non-blocking toast and lets the admin try
    // again — we never want to retry forever and burn the daily quota).
    let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let json = await res.json().catch(() => ({}));
    if (res.status === 429) {
        const waitMs = parseRetryDelayMs(json) || 2000;
        await new Promise(r => setTimeout(r, Math.min(waitMs, 15000)));
        res  = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        json = await res.json().catch(() => ({}));
    }
    if (!res.ok) {
        throw new Error('Gemini API ' + res.status + ': ' +
            (json && json.error && json.error.message ? json.error.message : JSON.stringify(json)));
    }
    const text = (json.candidates && json.candidates[0] &&
        json.candidates[0].content && json.candidates[0].content.parts &&
        json.candidates[0].content.parts[0] &&
        json.candidates[0].content.parts[0].text) || '';
    return { text, raw: json };
}

/* Pull the suggested retry delay from a Gemini 429 response.
   The error JSON shape is roughly:
     { error: { details: [{ "@type": ".../RetryInfo", "retryDelay": "13.7s" }, ...] } }
   We tolerate missing or malformed fields and fall back to null. */
function parseRetryDelayMs(json) {
    try {
        const details = json && json.error && json.error.details;
        if (!Array.isArray(details)) return null;
        for (const d of details) {
            if (d && (d['@type'] || '').includes('RetryInfo') && d.retryDelay) {
                const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d.retryDelay));
                if (m) return Math.ceil(parseFloat(m[1]) * 1000);
            }
        }
    } catch (_) {}
    return null;
}

/* Try to extract JSON from a Gemini response. Gemini sometimes wraps
   the JSON in ```json fences even with responseMimeType=json, so we
   tolerate that here. Returns null if parsing fails. */
export function tryParseJson(text) {
    if (!text) return null;
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(s); } catch (_) { return null; }
}