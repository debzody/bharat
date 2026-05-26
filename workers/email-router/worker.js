/* ── email-router Worker — inbound mail handler ──────────────────
 * Runs on every email Cloudflare Email Routing delivers to one of
 * our domain mailboxes (booking@, info@, cancellation@). It:
 *
 *   1. Drains the raw RFC-822 stream into a string.
 *   2. Parses headers + bodies with our hand-rolled mime.js.
 *   3. Derives a stable doc ID = SHA-256(Message-ID), so retries
 *      from Cloudflare are idempotent.
 *   4. Writes a record to Firestore /receivedEmails/{docId} via the
 *      REST API, authenticated with a service-account access token.
 *   5. Forwards the original message to a verified Gmail destination
 *      so the existing mobile / desktop client experience is intact.
 *
 * The Worker also exposes a tiny HTTP fetch() handler (just `/` and
 * `/health`) so wrangler tail / browser sanity-checks confirm the
 * deploy is live. There is *no* /poll endpoint — the dashboard reads
 * Firestore directly with admin-rule auth.
 *
 * Deploy:
 *     cd workers/email-router
 *     npm install
 *     npx wrangler login
 *     printf %s '<full service-account JSON>' | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
 *     npx wrangler deploy
 *
 * Then in Cloudflare → Email → Email Routing → Routes, add
 * "Send to a Worker → email-router" as an action on each address rule.
 * ──────────────────────────────────────────────────────────────── */

import { sha256Hex, streamToString } from './lib.js';
import { parseRfc822 } from './mime.js';
import { getFirestoreAccessToken, firestoreCreateIfMissing } from './firestore.js';

export default {
    /* HTTP handler — health-check only. Inbound mail uses email() below. */
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/' || url.pathname === '/health') {
            return Response.json({
                ok: true,
                service: 'email-router',
                allowedInboxes: parseList(env.ALLOWED_INBOXES),
                forwardTo: env.FORWARD_ALL_TO || null,
                hasServiceAccount: !!env.FIREBASE_SERVICE_ACCOUNT_KEY
            });
        }
        return new Response('Not found', { status: 404 });
    },

    /* Email handler — Cloudflare invokes this once per inbound message. */
    async email(message, env, ctx) {
        // ── 1) Sanity-check the recipient ────────────────────────
        // Cloudflare's routing rule should already gate this, but a
        // wildcard rule mis-config would let arbitrary addresses
        // through. We hard-stop on anything not in ALLOWED_INBOXES.
        const recipient = String(message.to || '').toLowerCase().trim();
        const allowed   = parseList(env.ALLOWED_INBOXES);
        if (allowed.length && !allowed.includes(recipient)) {
            console.warn('email-router: recipient not in ALLOWED_INBOXES:', recipient);
            try { message.setReject('Recipient not accepted by this worker.'); }
            catch (_) {}
            return;
        }

        // ── 2) Drain the raw stream ──────────────────────────────
        const maxBytes = Number(env.MAX_RAW_BYTES) || 5_000_000;
        let raw = '';
        try { raw = await streamToString(message.raw, maxBytes); }
        catch (err) {
            console.error('email-router: stream read failed:', err);
            // Still attempt forward so a parse failure doesn't lose mail.
            await tryForward(message, env);
            return;
        }

        // ── 3) Parse + persist (best-effort) ─────────────────────
        let parsed = null;
        try { parsed = parseRfc822(raw); }
        catch (err) { console.error('email-router: parse failed:', err); }

        if (parsed) {
            try { await persistToFirestore(message, parsed, raw, env); }
            catch (err) { console.error('email-router: firestore write failed:', err); }
        }

        // ── 4) Forward to Gmail so existing clients keep working ─
        await tryForward(message, env);
    }
};

/* ── helpers ──────────────────────────────────────────────────── */

function parseList(s) {
    return String(s || '')
        .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

async function tryForward(message, env) {
    const to = String(env.FORWARD_ALL_TO || '').trim();
    if (!to) return;
    try {
        // message.forward() expects a string address (matched against
        // verified destinations) OR the binding name. We use the raw
        // destination address — Cloudflare will check it's verified.
        await message.forward(to);
    } catch (err) {
        // If the explicit address fails, fall back to the named
        // send_email binding (defined in wrangler.jsonc).
        console.warn('email-router: forward to', to, 'failed:', err && err.message);
        try {
            if (env.GMAIL_FORWARD && typeof env.GMAIL_FORWARD.send === 'function') {
                // For named SendEmail bindings we'd call .send(message),
                // but message.forward() with the binding name is the
                // documented path. Try it as a last resort.
                await message.forward('GMAIL_FORWARD');
            }
        } catch (err2) {
            console.error('email-router: fallback forward failed:', err2);
        }
    }
}

async function persistToFirestore(message, parsed, raw, env) {
    // Stable doc ID: SHA-256 of Message-ID (or, if absent, the entire
    // raw blob). Firestore IDs allow 1–1500 chars and the chars
    // [0-9A-Za-z._-] — hex digests are safe.
    const idSource = parsed.messageId || raw;
    const docId = await sha256Hex(idSource);

    const doc = {
        messageId:    parsed.messageId || '',
        envelopeFrom: String(message.from || ''),
        envelopeTo:   String(message.to   || ''),
        from:         parsed.from || '',
        to:           parsed.to   || '',
        cc:           parsed.cc   || '',
        subject:      parsed.subject || '(no subject)',
        date:         parsed.date    || '',
        inReplyTo:    parsed.inReplyTo || '',
        spamScore:    parsed.spamScore || '',
        textPlain:    (parsed.textPlain || '').slice(0, 100_000),
        textHtml:     (parsed.textHtml  || '').slice(0, 200_000),
        attachments:  Array.isArray(parsed.attachments) ? parsed.attachments.slice(0, 50) : [],
        rawSize:      Number(message.rawSize) || raw.length,
        mailbox:      String(message.to || '').toLowerCase(),
        unread:       true,
        receivedAt:   new Date().toISOString()
    };

    const token = await getFirestoreAccessToken(env);
    const created = await firestoreCreateIfMissing(env, token, 'receivedEmails', docId, doc);
    if (!created) console.log('email-router: dedup hit for', docId);
}