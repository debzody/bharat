/* ── Admin Inbox: outbound email Worker ───────────────────────────
 * POST /send  → forwards admin compose to Brevo's transactional API.
 *
 * Why a Worker (and not direct browser → Brevo API)?
 *   • The Brevo API key is too privileged to ship to browsers — it
 *     can send emails, read campaigns, manage contacts. Anyone
 *     opening DevTools on /dashboard could grab it.
 *   • Brevo's API doesn't allow CORS from arbitrary origins anyway.
 *
 * Security:
 *   • CORS allow-list (ALLOWED_ORIGIN var).
 *   • Caller must include a Firebase ID token in `Authorization: Bearer …`.
 *     We verify the JWT signature against Google's JWKs and require
 *     the email to be in ADMIN_EMAILS.
 *   • The Brevo API key lives in Worker secrets (BREVO_API_KEY).
 *
 * Deploy (one time):
 *     cd workers/inbox-mail
 *     npm install
 *     npx wrangler login
 *     npx wrangler secret put BREVO_API_KEY     # paste the v3 API key
 *     npx wrangler deploy
 * ───────────────────────────────────────────────────────────── */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(env, request) });
        }
        if (request.method === 'GET' && url.pathname === '/') {
            return jsonResponse(env, request, { ok: true, service: 'inbox-mail' });
        }
        if (request.method === 'POST' && url.pathname === '/send') {
            return handleSend(request, env);
        }
        return jsonResponse(env, request, { error: 'Not found' }, 404);
    }
};

function corsHeaders(env, request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*');
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

function jsonResponse(env, request, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders(env, request)
        }
    });
}

async function handleSend(request, env) {
    let body;
    try { body = await request.json(); }
    catch (_) { return jsonResponse(env, request, { error: 'Invalid JSON body' }, 400); }

    const auth = request.headers.get('Authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return jsonResponse(env, request, { error: 'Missing Authorization header' }, 401);
    const idToken = m[1].trim();

    let claims;
    try {
        claims = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
    } catch (err) {
        return jsonResponse(env, request, { error: 'Auth failed: ' + (err.message || 'unknown') }, 401);
    }

    const callerEmail = String(claims.email || '').toLowerCase();
    const adminList = (env.ADMIN_EMAILS || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!adminList.includes(callerEmail)) {
        return jsonResponse(env, request, { error: 'Not an admin: ' + callerEmail }, 403);
    }

    const to       = (body.to       || '').toString().trim();
    const subject  = (body.subject  || '').toString().trim();
    const html     = (body.html     || '').toString();
    const text     = (body.text     || '').toString();
    const replyTo  = (body.replyTo  || '').toString().trim();
    const cc       = Array.isArray(body.cc) ? body.cc : [];
    const fromReq  = (body.from     || '').toString().trim().toLowerCase();

    if (!isValidEmail(to))                    return jsonResponse(env, request, { error: 'Invalid `to` address' }, 400);
    if (!subject || subject.length > 300)     return jsonResponse(env, request, { error: 'Subject required (≤300 chars)' }, 400);
    if (!html && !text)                       return jsonResponse(env, request, { error: 'Body required (html or text)' }, 400);
    if (!env.BREVO_API_KEY)                   return jsonResponse(env, request, { error: 'BREVO_API_KEY secret not configured' }, 500);

    // ── Choose the From address ──────────────────────────────
    // The dashboard's Compose modal lets the admin pick which mailbox
    // the email should appear to come from (booking@, info@, cancellation@…).
    // We validate the choice against ALLOWED_SENDERS so an attacker who
    // gets an admin token can't impersonate arbitrary domains. Each
    // sender must also be a verified sender in Brevo, otherwise Brevo
    // will reject the request with `sender_not_authorized`.
    const allowedSenders = (env.ALLOWED_SENDERS || env.FROM_EMAIL || 'booking@andamanvoyages.in')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    const defaultFromEmail = (env.FROM_EMAIL || allowedSenders[0] || 'booking@andamanvoyages.in').toLowerCase();
    let fromEmail;
    if (fromReq) {
        if (!isValidEmail(fromReq))            return jsonResponse(env, request, { error: 'Invalid `from` address' }, 400);
        if (!allowedSenders.includes(fromReq)) return jsonResponse(env, request, { error: 'From address not allowed: ' + fromReq }, 403);
        fromEmail = fromReq;
    } else {
        fromEmail = defaultFromEmail;
    }
    const fromName  = env.FROM_NAME  || 'Bharat Tours & Travels';

    const payload = {
        sender: { name: fromName, email: fromEmail },
        to:     [{ email: to }],
        subject,
        ...(html ? { htmlContent: html } : {}),
        ...(text ? { textContent: text } : {}),
        ...(replyTo && isValidEmail(replyTo) ? { replyTo: { email: replyTo } } : {}),
        ...(cc.length ? { cc: cc.filter(isValidEmail).map(e => ({ email: e })) } : {}),
        tags: ['admin-reply'],
        headers: { 'X-Sent-By-Admin': callerEmail }
    };

    let brevoRes, brevoBody;
    try {
        brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': env.BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        brevoBody = await brevoRes.text();
    } catch (err) {
        return jsonResponse(env, request, { error: 'Brevo request failed: ' + (err.message || 'network') }, 502);
    }

    if (!brevoRes.ok) {
        return jsonResponse(env, request, { error: 'Brevo rejected: ' + brevoRes.status + ' ' + brevoBody }, 502);
    }

    let parsed = {};
    try { parsed = JSON.parse(brevoBody); } catch (_) {}

    return jsonResponse(env, request, {
        ok: true,
        messageId: parsed.messageId || null,
        sentBy: callerEmail,
        to,
        subject,
        sentAt: new Date().toISOString()
    });
}

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

// ── Firebase ID-token verification ──────────────────────────────
// Firebase ID tokens are signed with the keys published at this URL (JWK format).
// Note: the legacy x509 endpoint is /robot/v1/metadata/x509/... — we want the JWK
// variant so the keys can be imported straight into WebCrypto (subtle.importKey).
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let _jwksCache = null;
let _jwksCachedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(forceRefresh) {
    if (!forceRefresh && _jwksCache && (Date.now() - _jwksCachedAt) < JWKS_TTL_MS) {
        return _jwksCache;
    }
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error('JWKS fetch failed: ' + res.status);
    _jwksCache = await res.json();
    _jwksCachedAt = Date.now();
    return _jwksCache;
}

function base64UrlToString(input) {
    input = input.replace(/-/g, '+').replace(/_/g, '/');
    while (input.length % 4) input += '=';
    return atob(input);
}
function base64UrlToBytes(input) {
    const bin = base64UrlToString(input);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
}

async function verifyFirebaseIdToken(idToken, projectId) {
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID not configured');

    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed JWT');
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(base64UrlToString(headerB64));
    const payload = JSON.parse(base64UrlToString(payloadB64));

    if (header.alg !== 'RS256') throw new Error('Unsupported alg ' + header.alg);
    if (!header.kid)            throw new Error('Missing kid');

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Token expired');
    if (typeof payload.iat !== 'number' || payload.iat > now + 60) throw new Error('Token issued in the future');
    if (payload.aud !== projectId) throw new Error('Wrong audience: ' + payload.aud);
    if (payload.iss !== 'https://securetoken.google.com/' + projectId) {
        throw new Error('Wrong issuer: ' + payload.iss);
    }
    if (!payload.sub) throw new Error('Missing sub');

    let jwks = await getJwks(false);
    let jwk = (jwks.keys || []).find(k => k.kid === header.kid);
    if (!jwk) {
        jwks = await getJwks(true);
        jwk = (jwks.keys || []).find(k => k.kid === header.kid);
    }
    if (!jwk) throw new Error('Unknown kid ' + header.kid);

    const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const signedData = new TextEncoder().encode(headerB64 + '.' + payloadB64);
    const signature = base64UrlToBytes(sigB64);

    const ok = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        key,
        signature,
        signedData
    );
    if (!ok) throw new Error('Bad signature');

    return payload;
}
