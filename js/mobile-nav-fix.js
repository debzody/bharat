/* ─────────────────────────────────────────────────────────────────
 * mobile-nav-fix.js — guarantee the mobile hamburger menu works.
 *
 * Why this exists
 *   The pure-CSS attempts to make the hamburger reliably tappable on
 *   small phones did not solve the user's complaint ("hamburger
 *   doesn't work"). Rather than continue iterating on CSS in the
 *   dark, this file takes a defensive belt-and-braces JS approach:
 *
 *   1. Bind the toggle handler in the CAPTURE phase so it fires
 *      before any other listener (Razorpay overlays, ad-network
 *      iframes, third-party scripts, conversion-kit's WhatsApp FAB
 *      etc.) can call stopPropagation() or otherwise swallow the
 *      tap.
 *   2. Bind to BOTH `click` AND `touchend` — on iOS Safari there
 *      are still rare cases where a 300 ms tap delay or a
 *      passive-listener policy causes a `click` to be skipped after
 *      a touch sequence.
 *   3. Force the hamburger button to the top of any z-index stack
 *      and explicitly clear `pointer-events: none` if any third
 *      party set it (e.g. Ezoic's overlays).
 *   4. Clone the button to nuke any zombie listeners that an
 *      earlier broken script may have attached.
 *   5. Write a tiny on-screen log into a hidden #__navfix-log div
 *      that you can reveal by appending `?navfix=1` to the URL —
 *      lets us confirm on the actual phone whether taps are firing
 *      WITHOUT needing remote DevTools.
 *
 * No dependencies — vanilla JS, IIFE, runs after DOMContentLoaded.
 * Loaded last on every public + funnel page so it's the final word
 * on what handles a tap on #hamburgerBtn.
 *
 * Side-effects (intentional):
 *   • Toggles `body.nav-open` (matches what js/script.js does).
 *   • Closes the menu when the user taps any .topnav-item OR
 *     anywhere outside the menu/topbar (mirrors js/script.js).
 *   • Locks body scroll while the menu is open (prevents the
 *     background page from scrolling behind the slide-in menu).
 * ────────────────────────────────────────────────────────────────*/
(function () {
    'use strict';

    var DEBUG = /[?&]navfix=1\b/.test(location.search);

    function log() {
        if (!DEBUG) return;
        try {
            var box = document.getElementById('__navfix-log');
            if (!box) {
                box = document.createElement('div');
                box.id = '__navfix-log';
                box.style.cssText =
                    'position:fixed;top:0;left:0;right:0;background:#000;color:#0f0;' +
                    'font:11px/1.3 monospace;padding:6px 8px;z-index:2147483647;' +
                    'max-height:40vh;overflow:auto;white-space:pre-wrap;';
                (document.body || document.documentElement).appendChild(box);
            }
            box.textContent = '[navfix] ' +
                Array.prototype.join.call(arguments, ' ') + '\n' + box.textContent;
        } catch (e) {}
        try { console.log.apply(console, ['[navfix]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    /* Run as soon as the DOM is parseable. The hamburger lives in
       the static <header> at the top of every page so it's available
       very early. */
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function init() {
        var btn = document.getElementById('hamburgerBtn');
        if (!btn) {
            log('hamburgerBtn not found at init — will retry on load');
            // Some pages inject the topbar late (admin pages render
            // header-on-mount). Retry once after window.load.
            window.addEventListener('load', initOnce, { once: true });
            return;
        }
        wire(btn);
    }

    var wired = false;
    function initOnce() {
        if (wired) return;
        var btn = document.getElementById('hamburgerBtn');
        if (btn) wire(btn);
    }

    function wire(btn) {
        if (wired) return;

        /* 1. Clone the button to drop any prior listeners. The clone
              keeps the same id / classes / DOM position. */
        var clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);
        btn = clone;

        /* 2. Force the button to be the topmost interactive element
              on the topbar regardless of what ANY stylesheet says. */
        try {
            btn.style.setProperty('pointer-events', 'auto', 'important');
            btn.style.setProperty('cursor', 'pointer', 'important');
            btn.style.setProperty('z-index', '2147483646', 'important');
            btn.style.setProperty('touch-action', 'manipulation', 'important');
            // -webkit-tap-highlight-color is a no-op on most non-iOS
            // devices but on iOS Safari it confirms the user actually
            // tapped the right element (a brief grey flash).
            btn.style.setProperty('-webkit-tap-highlight-color', 'rgba(0,140,255,.25)', 'important');
        } catch (e) {}

        /* 3. The actual toggle. Pulled into its own function so we
              can call it from multiple event types without code
              duplication. */
        function toggle(ev) {
            try {
                if (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (typeof ev.stopImmediatePropagation === 'function') {
                        ev.stopImmediatePropagation();
                    }
                }
                document.body.classList.toggle('nav-open');
                var open = document.body.classList.contains('nav-open');
                // Lock the page behind the menu so it doesn't scroll
                // away from the user while they're choosing an item.
                if (open) {
                    document.body.dataset.__prevOverflow = document.body.style.overflow || '';
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = document.body.dataset.__prevOverflow || '';
                    delete document.body.dataset.__prevOverflow;
                }
                log('toggle →', open ? 'OPEN' : 'closed', '(via ' + (ev ? ev.type : 'manual') + ')');
            } catch (e) {
                log('toggle threw:', e && e.message);
            }
        }

        /* 4. Bind in CAPTURE phase. capture:true makes us run BEFORE
              any other listener that's been attached in bubble phase
              (the default), so nothing can steal our tap. */
        ['click', 'touchend', 'pointerup'].forEach(function (type) {
            btn.addEventListener(type, toggle, true);
        });

        /* 5. Close-on-outside-tap and close-on-menu-item-tap, also
              in capture phase so they're guaranteed to fire. */
        document.addEventListener('click', function (e) {
            if (!document.body.classList.contains('nav-open')) return;
            // Tap inside a menu item → close the menu and let the
            // anchor's normal navigation proceed (we don't preventDefault).
            var item = e.target && e.target.closest && e.target.closest('.topnav-item');
            if (item) {
                document.body.classList.remove('nav-open');
                document.body.style.overflow = document.body.dataset.__prevOverflow || '';
                delete document.body.dataset.__prevOverflow;
                log('closed via menu-item tap');
                return;
            }
            // Tap outside hamburger AND outside topnav → close.
            if (!e.target.closest) return;
            if (e.target.closest('#hamburgerBtn')) return;
            if (e.target.closest('.topnav')) return;
            document.body.classList.remove('nav-open');
            document.body.style.overflow = document.body.dataset.__prevOverflow || '';
            delete document.body.dataset.__prevOverflow;
            log('closed via outside tap');
        }, true);

        /* 6. Esc key for keyboard users. */
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!document.body.classList.contains('nav-open')) return;
            document.body.classList.remove('nav-open');
            document.body.style.overflow = document.body.dataset.__prevOverflow || '';
            delete document.body.dataset.__prevOverflow;
            log('closed via Esc');
        });

        wired = true;
        log('hamburger wired (id=' + btn.id + ', tag=' + btn.tagName + ')');
    }

    /* Public escape hatch: window.NavFix.toggle() forces a toggle
       from the JS console for testing. */
    window.NavFix = {
        toggle: function () {
            var btn = document.getElementById('hamburgerBtn');
            if (btn) btn.click();
        },
        status: function () {
            return {
                btnExists: !!document.getElementById('hamburgerBtn'),
                wired: wired,
                navOpen: document.body.classList.contains('nav-open')
            };
        }
    };

    ready(init);
})();