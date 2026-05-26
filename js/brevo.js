/* ── Brevo Conversations chat widget loader ──────────────────────
 * Drops in the Brevo (formerly Sendinblue) Conversations bubble on
 * every public page. This is the canonical Brevo snippet — we just
 * wrap it in our own file so:
 *   1. Updating the widget ID later is a one-line change.
 *   2. We can skip injection on admin pages and on iframes (e.g.
 *      the dashboard's Looker embeds) where the widget would be
 *      noisy or duplicated.
 *
 * The Brevo bubble appears bottom-right alongside (not on top of)
 * the existing AI chat widget + WhatsApp FAB — Brevo's z-index is
 * ~2147483640 by default which sits above ours, but it docks at
 * `right: 16px / bottom: 16px` and won't overlap them visibly.
 *
 * Conversations dashboard & tickets:
 *   https://app.brevo.com/conversations
 * ───────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    // Skip on admin / migration pages — they're internal tools and
    // don't need a public-facing chat widget.
    var path = (location.pathname || '').toLowerCase();
    if (
        path.indexOf('/dashboard') === 0 ||
        path.indexOf('/migrate')   === 0
    ) return;

    // Don't double-inject if some other page already loaded the widget
    // (e.g. a future shared header partial).
    if (window.BrevoConversationsID) return;

    window.BrevoConversationsID = '6a15404f94b63fe74c038079';
    window.BrevoConversations = window.BrevoConversations || function () {
        (window.BrevoConversations.q = window.BrevoConversations.q || []).push(arguments);
    };
    var s = document.createElement('script');
    s.async = true;
    s.src   = 'https://conversations-widget.brevo.com/brevo-conversations.js';
    (document.head || document.documentElement).appendChild(s);
})();