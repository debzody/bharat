/* ── firestore.js — minimal Firestore REST helper ────────────────
 * Cloudflare Workers can't import the Firebase Admin SDK (it's
 * Node-only and ~3 MB). Instead we mint our own OAuth2 access token
 * from the service-account key, then call the Firestore REST API
 * directly. The token is cached in module scope so successive emails
 * within the same isolate reuse it.
 * ──────────────────────────────────────────────────────────────── */

import { importPkcs8PrivateKey, signJwt } from './lib.js';

let _cachedToken = null;          // { token, exp (epoch sec) }
const TOKEN_BUFFER_SEC = 60;      // refresh 60 s before real expiry

/* Returns a bearer access-token string with the firestore-data scope. */
export async function getFirestoreAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);
    if (_cachedToken && _cachedToken.exp - TOKEN_BUFFER_SEC > now) {
        return _cachedToken.token;
    }
    if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY secret not set');
    }

    let sa;
    try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY); }
    catch (err) { throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ' + err.message); }
    if (!sa.client_email || !sa.private_key) {
        throw new Error('Service-account JSON missing client_email or private_key');
    }

    const key = await importPkcs8PrivateKey(sa.private_key);
    const iat = now;
    const exp = now + 3600;
    const jwt = await signJwt(
        { alg: 'RS256', typ: 'JWT' },
        {
            iss: sa.client_email,
            scope: 'https://www.googleapis.com/auth/datastore',
            aud: 'https://oauth2.googleapis.com/token',
            iat, exp
        },
        key
    );

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
        throw new Error('OAuth token exchange failed: ' + res.status + ' ' + JSON.stringify(json));
    }

    _cachedToken = { token: json.access_token, exp };
    return json.access_token;
}

/* ── Firestore typed-value encoder ───────────────────────────────
 * Firestore REST takes typed values: { stringValue, integerValue, ...}.
 * We support the limited set we need for receivedEmails docs.
 * Null / undefined fields are dropped to keep docs compact. */
function toFirestoreValue(v) {
    if (v === null || v === undefined)        return { nullValue: null };
    if (typeof v === 'string')                return { stringValue: v };
    if (typeof v === 'boolean')               return { booleanValue: v };
    if (typeof v === 'number') {
        if (Number.isInteger(v))              return { integerValue: String(v) };
        return { doubleValue: v };
    }
    if (Array.isArray(v)) {
        return { arrayValue: { values: v.map(toFirestoreValue) } };
    }
    if (typeof v === 'object') {
        const fields = {};
        for (const k of Object.keys(v)) {
            if (v[k] !== undefined) fields[k] = toFirestoreValue(v[k]);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function fieldsFromObject(obj) {
    const fields = {};
    for (const k of Object.keys(obj || {})) {
        if (obj[k] === undefined) continue;
        fields[k] = toFirestoreValue(obj[k]);
    }
    return fields;
}

/* Idempotent create: write /<collection>/<docId> only if it doesn't
 * already exist. Uses Firestore's `currentDocument.exists=false`
 * precondition so retries don't double-write.
 *
 * Returns true if the doc was created, false if it already existed
 * (which is fine — Cloudflare may retry on transient errors and we
 * want SHA-256(Message-ID) to dedupe). Anything else throws. */
export async function firestoreCreateIfMissing(env, token, collection, docId, data) {
    const projectId = env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID not configured');

    const url = 'https://firestore.googleapis.com/v1/projects/' + projectId +
        '/databases/(default)/documents/' + encodeURIComponent(collection) +
        '?documentId=' + encodeURIComponent(docId) +
        '&currentDocument.exists=false';

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: fieldsFromObject(data) })
    });

    if (res.ok) return true;

    const txt = await res.text().catch(() => '');
    // Firestore returns 409 ALREADY_EXISTS when the precondition
    // catches a duplicate. Treat as success — idempotent write.
    if (res.status === 409 || /already exists/i.test(txt)) return false;
    throw new Error('Firestore create failed: ' + res.status + ' ' + txt);
}