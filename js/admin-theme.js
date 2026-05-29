/* ─────────────────────────────────────────────────────────────────
 * admin-theme.js — auto-apply the dark-blue admin theme.
 *
 * What this does
 *   1. Detects whether the current visitor is an ADMIN or STAFF user
 *      using the same checks the rest of the site already trusts:
 *        • localStorage.currentUser → role === 'admin' | 'staff'
 *        • OR email ∈ window.ADMIN_EMAILS
 *        • OR email ∈ window.STAFF_EMAILS
 *      (firebase-config.js exposes both lists to the page.)
 *   2. If yes, adds `class="admin-theme"` to <body> as early as
 *      possible — and to <html> too — so css/admin-theme.css takes
 *      over before the first paint, avoiding a "white flash → dark
 *      flip" jank on slow connections.
 *   3. Re-runs whenever a Firebase auth-state change fires (login /
 *      logout) so the theme appears immediately on sign-in and
 *      disappears on logout, without a page reload.
 *   4. Listens for the `auth:changed` custom event that auth.js
 *      dispatches, plus the `storage` event so a logout in another
 *      tab also flips the theme back here.
 *
 * Public API
 *   window.AdminTheme.isAdminOrStaff()  → boolean
 *   window.AdminTheme.apply()           → toggle <body class>
 *   window.AdminTheme.force(true|false) → manual override (testing)
 *
 * Loaded on dashboard.html and bookings.html as a tiny synchronous
 * <script> in <head> right after firebase-config.js (so ADMIN_EMAILS /
 * STAFF_EMAILS are already populated). It does NOT load on public
 * pages — there's no benefit, and it would be wasted bytes.
 * ────────────────────────────────────────────────────────────────*/
(function () {
    'use strict';

    var BODY_CLASS = 'admin-theme';
    var HTML_CLASS = 'admin-theme';   // also stamp <html> so very early
                                       // CSS selectors (root font / scrollbar
                                       // colour-scheme) can pick it up too

    /* Read & normalise the email list helpers from firebase-config.js. */
    function lc(arr) {
        return Array.prototype.slice.call(arr || []).map(function (s) {
            return String(s || '').trim().toLowerCase();
        });
    }

    function isAdminOrStaff() {
        // 1) Live Firebase auth instance (most reliable; populated after
        //    firebase-config.js's __firebaseReady promise resolves).
        try {
            if (window.__authInstance && window.__authInstance.currentUser) {
                var fu = window.__authInstance.currentUser;
                var femail = String(fu.email || '').toLowerCase();
                if (femail) {
                    if (lc(window.ADMIN_EMAILS).indexOf(femail) >= 0) return 'admin';
                    if (lc(window.STAFF_EMAILS).indexOf(femail) >= 0) return 'staff';
                }
            }
        } catch (_) {}

        // 2) Fall back to the localStorage profile cache (set by
        //    auth.js after every successful sign-in).
        try {
            var raw = localStorage.getItem('currentUser');
            if (raw) {
                var u = JSON.parse(raw);
                if (u) {
                    var role = String(u.role || '').toLowerCase();
                    if (role === 'admin') return 'admin';
                    if (role === 'staff') return 'staff';
                    var email = String(u.email || '').toLowerCase();
                    if (email) {
                        if (lc(window.ADMIN_EMAILS).indexOf(email) >= 0) return 'admin';
                        if (lc(window.STAFF_EMAILS).indexOf(email) >= 0) return 'staff';
                    }
                }
            }
        } catch (_) {}

        return false;
    }

    function apply() {
        // Honour an explicit user override stored by force(true|false)
        var forced = null;
        try { forced = sessionStorage.getItem('__adminThemeForce'); } catch (_) {}
        var enabled = (forced === '1') ? true
                    : (forced === '0') ? false
                    : !!isAdminOrStaff();

        var html = document.documentElement;
        var body = document.body;
        if (enabled) {
            html.classList.add(HTML_CLASS);
            if (body) body.classList.add(BODY_CLASS);
        } else {
            html.classList.remove(HTML_CLASS);
            if (body) body.classList.remove(BODY_CLASS);
        }
        return enabled;
    }

    /* Manual override — handy for screenshots / QA. The flag lives in
       sessionStorage so it auto-clears when the tab is closed. */
    function force(value) {
        try {
            if (value === true || value === 1 || value === '1') {
                sessionStorage.setItem('__adminThemeForce', '1');
            } else if (value === false || value === 0 || value === '0') {
                sessionStorage.setItem('__adminThemeForce', '0');
            } else {
                sessionStorage.removeItem('__adminThemeForce');
            }
        } catch (_) {}
        return apply();
    }

    /* Run immediately so the dark theme is in place before the first
       paint when possible. We also re-run on DOMContentLoaded so we
       can stamp the <body> element (which doesn't exist while we're
       in <head>). */
    apply();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply, { once: true });
    }

    /* React to login / logout. */
    document.addEventListener('auth:changed', apply);
    window.addEventListener('storage', function (e) {
        if (e && (e.key === 'currentUser' || e.key === 'token')) apply();
    });

    /* Wait for the Firebase auth listener to fire its first event so
       we re-evaluate once we definitively know the signed-in user. */
    if (window.__firebaseReady && typeof window.__firebaseReady.then === 'function') {
        window.__firebaseReady.then(function (refs) {
            try {
                if (refs && refs.firebaseAuth && typeof refs.firebaseAuth.onAuthStateChanged === 'function') {
                    refs.firebaseAuth.onAuthStateChanged(refs.auth, function () { apply(); });
                }
            } catch (_) {}
        }).catch(function () {});
    }

    /* Public API for QA. */
    window.AdminTheme = {
        isAdminOrStaff: isAdminOrStaff,
        apply:          apply,
        force:          force
    };
})();