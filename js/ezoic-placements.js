/* ── ezoic-placements.js ──────────────────────────────────────────
 * Auto-discovers every Ezoic ad placeholder on the current page and
 * fires a single ezstandalone.showAds(...allIds) call. Per Ezoic's
 * Step-3 guidance:
 *   "Pages with multiple placements should pass all placement IDs
 *    into a single showAds() call. This reduces server requests
 *    and improves loading speed."
 *
 * Why a helper instead of hard-coding showAds(101, 102, ...)?
 *   • Keeps the markup clean — every page just drops as many
 *     <div id="ezoic-pub-ad-placeholder-NNN"></div> blocks as it
 *     wants, with NO inline <script> tags scattered through the
 *     content (Ezoic's docs allow this, but it bloats the DOM).
 *   • Numeric IDs can be re-arranged or renamed without editing
 *     this file or any per-page <script> blocks.
 *   • Failing safe: if ezstandalone never loads (ad-blocker,
 *     network error, mis-configured CSP), this script silently
 *     no-ops; nothing visible breaks.
 *
 * Loaded at the END of <body> on every public page that has
 * placeholders. Admin pages don't include this script.
 *
 * IMPORTANT — do NOT add inline styles to the placeholder divs.
 * Reserving space (e.g. min-height) makes Ezoic show empty white
 * boxes when an ad doesn't fill. Per Ezoic docs, the loader sets
 * the size itself once an ad lands. Just put bare divs.
 * ──────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    function collectPlacementIds() {
        var nodes = document.querySelectorAll('[id^="ezoic-pub-ad-placeholder-"]');
        var ids = [];
        for (var i = 0; i < nodes.length; i++) {
            var m = String(nodes[i].id || '').match(/^ezoic-pub-ad-placeholder-(\d+)$/);
            if (m) ids.push(parseInt(m[1], 10));
        }
        // De-dupe just in case the same id is dropped twice (templates etc)
        ids = ids.filter(function (v, i, a) { return a.indexOf(v) === i; });
        return ids;
    }

    function fireShowAds(ids) {
        if (!window.ezstandalone || !window.ezstandalone.cmd) return;
        if (!ids.length) return;
        try {
            window.ezstandalone.cmd.push(function () {
                if (typeof window.ezstandalone.showAds === 'function') {
                    // Pass all collected IDs as separate args, exactly as
                    // Ezoic's docs prescribe: showAds(101, 102, 103, ...).
                    window.ezstandalone.showAds.apply(window.ezstandalone, ids);
                }
            });
        } catch (_) { /* swallow — never break the page */ }
    }

    function init() {
        var ids = collectPlacementIds();
        if (window.console && console.debug) {
            console.debug('[ezoic-placements] showing ads for IDs:', ids);
        }
        fireShowAds(ids);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        // Already past DOMContentLoaded — run on next tick so any
        // late-rendered placeholders (e.g. injected by JS) are caught
        // in the same call.
        setTimeout(init, 0);
    }
})();