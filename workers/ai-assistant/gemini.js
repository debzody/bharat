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

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
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

/* Try to extract JSON from a Gemini response. Gemini sometimes wraps
   the JSON in ```json fences even with responseMimeType=json, so we
   tolerate that here. Returns null if parsing fails. */
export function tryParseJson(text) {
    if (!text) return null;
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(s); } catch (_) { return null; }
}