/* ── push-ads-init.js ─────────────────────────────────────────────
 * Registers /sw.js (the third-party push-notification ad-network
 * service worker) on every public page that includes this script.
 *
 * What this does:
 *   1. Calls navigator.serviceWorker.register('/sw.js') so the browser
 *      installs and activates the worker.
 *   2. Once registered, the worker delegates to the ad network's
 *      script (3nbf4.com / zoneId 11068987) which then handles the
 *      push-permission prompt + subscription + ad delivery.
 *
 * What this does NOT do:
 *   • Modify, restrict, or filter what the ad network sends.
 *   • Run on admin / booking / checkout pages — those pages don't
 *     load this script (intentional — keeps the booking funnel
 *     ad-free for converting customers).
 *
 * SAFETY GUARDS (we add these on top of the network's own behaviour):
 *   • Skip if the browser doesn't support service workers
 *     (old browsers, in-app webviews, Lighthouse audits).
 *   • Skip if the page is loaded over plain HTTP (service workers
 *     require HTTPS). On localhost we still register so dev works.
 *   • Skip if a different service worker is already registered at
 *     `/` — we don't want to clobber a future PWA worker.
 *   • Defer the registration until `load` so it never competes with
 *     critical render assets.
 *
 * ⚠️ Operational risks documented in ezoic_ads_setup.md and sw.js
 * — the user opted-in to "full integration; accept the risks".
 * ──────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    // 1. Browser-support gate
    if (!('serviceWorker' in navigator)) return;

    // 2. HTTPS gate (service workers refuse to register on plain HTTP
    //    except on localhost). Bail silently rather than throwing.
    var proto = (location.protocol || '').toLowerCase();
    var host  = (location.hostname || '').toLowerCase();
    var isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    if (proto !== 'https:' && !isLocal) return;

    // 3. Don't re-register the worker on every page-load — the browser
    //    will short-circuit identical registrations, but bailing out
    //    based on a flag makes the logs cleaner and avoids a redundant
    //    Network → /sw.js fetch on every navigation.
    function alreadyRegistered() {
        try { return sessionStorage.getItem('__pushAdsSwRegistered') === '1'; }
        catch (_) { return false; }
    }
    function markRegistered() {
        try { sessionStorage.setItem('__pushAdsSwRegistered', '1'); } catch (_) {}
    }

    // 4. Don't register inside an iframe (ad units, Razorpay checkout
    //    overlay, etc.) — only the top frame should claim the SW scope.
    if (window.top !== window.self) return;

    function register() {
        if (alreadyRegistered()) return;
        try {
            // scope: '/' so the worker can intercept / send notifications
            // for the whole site. The ad network requires this — if we
            // narrowed the scope, push delivery to the user would break
            // the moment they navigated to a different page.
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(function (reg) {
                    markRegistered();
                    if (window.console && console.debug) {
                        console.debug('[push-ads] service worker registered:', reg && reg.scope);
                    }
                })
                .catch(function (err) {
                    if (window.console && console.warn) {
                        console.warn('[push-ads] service worker registration failed:', err && err.message);
                    }
                });
        } catch (err) {
            // Older browsers + restrictive CSPs may throw synchronously.
            if (window.console && console.warn) {
                console.warn('[push-ads] register() threw:', err && err.message);
            }
        }
    }

    // 5. Defer until the page has finished its main load — keeps the
    //    initial render (LCP, FID) untouched by the third-party SW
    //    fetch + install.
    if (document.readyState === 'complete') {
        // Small delay so we genuinely run AFTER everything else.
        setTimeout(register, 1500);
    } else {
        window.addEventListener('load', function () {
            setTimeout(register, 1500);
        }, { once: true });
    }
})();