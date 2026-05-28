/* ─────────────────────────────────────────────────────────────────
 * mobile-nav-fix.js — guarantee the mobile hamburger menu works.
 *
 * Multiple iterations of pure-CSS fixes did not solve "hamburger
 * doesn't work". Root cause turned out to be a CSS specificity
 * collision inside style.css:
 *   • Line 182: @media (max-width:768px) { .topnav { position:fixed } }
 *   • Line 919: @media (max-width:980px) { .topnav { display:none } }
 * The later rule wins, so toggling body.nav-open did nothing visible.
 *
 * Rather than continue fighting the cascade, this script now BUILDS
 * ITS OWN dropdown menu element + backdrop at runtime, appends them
 * to <body>, and shows/hides them via inline `!important` styles.
 * No CSS rule in the project can interfere — every property is
 * applied with style.setProperty(...,'important').
 *
 * The menu items are pulled live from the page's existing #topnav
 * (so they stay in sync with whatever the desktop nav shows) and a
 * hard-coded fallback list is used if the topnav is empty.
 *
 * Side-effects:
 *   • Creates #__mobile-nav-drop and #__mobile-nav-backdrop on first
 *     open. Idempotent — re-opening reuses the same elements.
 *   • Locks body scroll while the menu is open.
 *   • Closes on outside tap, on any link tap, on Esc.
 *   • Public API: window.NavFix.toggle() / .open() / .close() /
 *     .status() — handy for console diagnosis.
 *
 * Debug: append `?navfix=1` to any URL to surface a green-on-black
 * on-screen log so you can see tap events firing on the actual phone
 * without remote DevTools.
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

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    /* ── DROPDOWN BUILDER ────────────────────────────────────── */

    var DROP_ID     = '__mobile-nav-drop';
    var BACKDROP_ID = '__mobile-nav-backdrop';

    function buildDrop() {
        var drop = document.getElementById(DROP_ID);
        if (drop) return drop;

        drop = document.createElement('div');
        drop.id = DROP_ID;
        drop.setAttribute('role', 'menu');
        drop.setAttribute('aria-label', 'Site navigation');

        var s = drop.style;
        s.setProperty('position', 'fixed', 'important');
        s.setProperty('top', '64px', 'important');
        s.setProperty('left', '0.5rem', 'important');
        s.setProperty('right', '0.5rem', 'important');
        s.setProperty('background', '#ffffff', 'important');
        s.setProperty('border', '1px solid rgba(10,31,68,.12)', 'important');
        s.setProperty('border-radius', '14px', 'important');
        s.setProperty('box-shadow', '0 16px 40px rgba(10,31,68,.28)', 'important');
        s.setProperty('padding', '0.5rem', 'important');
        s.setProperty('z-index', '2147483645', 'important');
        s.setProperty('max-height', 'calc(100vh - 80px)', 'important');
        s.setProperty('overflow-y', 'auto', 'important');
        s.setProperty('display', 'none', 'important');
        s.setProperty('flex-direction', 'column', 'important');
        s.setProperty('gap', '0.15rem', 'important');
        s.setProperty('font-family', 'Poppins, system-ui, sans-serif', 'important');

        // Pull live items from the page's existing #topnav (so the
        // menu always matches the desktop nav). Fall back to a hard-
        // coded list if the topnav is missing or empty.
        var srcItems = document.querySelectorAll('#topnav .topnav-item, .topnav .topnav-item');
        var built = 0;
        srcItems.forEach(function (src) {
            var href  = src.getAttribute('href') || '#';
            var label = (src.querySelector('span') || src).textContent.trim();
            if (!label) return;
            drop.appendChild(makeItem(href, label));
            built++;
        });

        if (built === 0) {
            [
                { href: '/',          label: 'Home'      },
                { href: '/#packages', label: 'Holidays'  },
                { href: '/cabs',      label: 'Cabs'      },
                { href: '/flights',   label: 'Flights'   },
                { href: '/gallery',   label: 'Gallery'   },
                { href: '/about',     label: 'About'     },
                { href: '/customize', label: 'Customize' }
            ].forEach(function (i) {
                drop.appendChild(makeItem(i.href, i.label));
            });
            log('built menu from fallback list');
        } else {
            log('built menu from #topnav (' + built + ' items)');
        }

        document.body.appendChild(drop);
        return drop;
    }

    function makeItem(href, label) {
        var a = document.createElement('a');
        a.href = href;
        a.textContent = label;
        a.setAttribute('role', 'menuitem');
        var as = a.style;
        as.setProperty('display', 'block', 'important');
        as.setProperty('padding', '0.85rem 1rem', 'important');
        as.setProperty('color', '#1a2330', 'important');
        as.setProperty('text-decoration', 'none', 'important');
        as.setProperty('font-size', '0.98rem', 'important');
        as.setProperty('font-weight', '500', 'important');
        as.setProperty('border-radius', '10px', 'important');
        as.setProperty('min-height', '44px', 'important');
        as.setProperty('line-height', '1.4', 'important');
        as.setProperty('-webkit-tap-highlight-color', 'rgba(13,122,138,.18)', 'important');
        // Highlight the current page so users see where they are.
        try {
            var u = new URL(a.href, location.href);
            if (u.pathname === location.pathname) {
                as.setProperty('background', 'rgba(13,122,138,.10)', 'important');
                as.setProperty('color', '#0d7a8a', 'important');
                as.setProperty('font-weight', '700', 'important');
            }
        } catch (_) {}
        a.addEventListener('click', function () { close(); });
        return a;
    }

    function buildBackdrop() {
        var bd = document.getElementById(BACKDROP_ID);
        if (bd) return bd;
        bd = document.createElement('div');
        bd.id = BACKDROP_ID;
        var bs = bd.style;
        bs.setProperty('position', 'fixed', 'important');
        bs.setProperty('inset', '0', 'important');
        bs.setProperty('background', 'rgba(8,18,30,.32)', 'important');
        bs.setProperty('z-index', '2147483644', 'important');
        bs.setProperty('display', 'none', 'important');
        bd.addEventListener('click', close);
        document.body.appendChild(bd);
        return bd;
    }

    /* ── OPEN / CLOSE ────────────────────────────────────────── */

    var menuOpen = false;
    var prevOverflow = '';

    function open() {
        if (menuOpen) return;
        var drop = buildDrop();
        var bd   = buildBackdrop();
        drop.style.setProperty('display', 'flex', 'important');
        bd.style.setProperty('display', 'block', 'important');
        document.body.classList.add('nav-open');
        prevOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
        menuOpen = true;
        log('OPEN');
    }

    function close() {
        if (!menuOpen) return;
        var drop = document.getElementById(DROP_ID);
        var bd   = document.getElementById(BACKDROP_ID);
        if (drop) drop.style.setProperty('display', 'none', 'important');
        if (bd)   bd.style.setProperty('display', 'none', 'important');
        document.body.classList.remove('nav-open');
        document.body.style.overflow = prevOverflow;
        menuOpen = false;
        log('CLOSED');
    }

    function toggle(ev) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
        }
        if (menuOpen) close(); else open();
    }

    /* ── HAMBURGER WIRING ────────────────────────────────────── */

    var wired = false;

    function init() {
        var btn = document.getElementById('hamburgerBtn');
        if (!btn) {
            log('hamburgerBtn not found at init — will retry on load');
            window.addEventListener('load', initOnce, { once: true });
            return;
        }
        wire(btn);
    }

    function initOnce() {
        if (wired) return;
        var btn = document.getElementById('hamburgerBtn');
        if (btn) wire(btn);
    }

    function wire(btn) {
        if (wired) return;

        // Clone to drop ALL prior listeners (kills zombies from earlier
        // broken iterations).
        var clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);
        btn = clone;

        // Force the button to be reliably tappable regardless of any
        // stylesheet's pointer-events / display / z-index rules.
        try {
            btn.style.setProperty('display', 'flex', 'important');
            btn.style.setProperty('pointer-events', 'auto', 'important');
            btn.style.setProperty('cursor', 'pointer', 'important');
            btn.style.setProperty('z-index', '2147483646', 'important');
            btn.style.setProperty('touch-action', 'manipulation', 'important');
            btn.style.setProperty('-webkit-tap-highlight-color', 'rgba(0,140,255,.25)', 'important');
        } catch (e) {}

        // Capture-phase listeners on three event types so nothing in
        // the bubble phase (or a different event family) can swallow
        // the tap.
        ['click', 'touchend', 'pointerup'].forEach(function (type) {
            btn.addEventListener(type, toggle, true);
        });

        // Esc closes.
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menuOpen) close();
        });

        wired = true;
        log('hamburger wired (id=' + btn.id + ')');
    }

    /* ── Public escape hatch ─────────────────────────────────── */
    window.NavFix = {
        toggle: function () { toggle(); },
        open:   open,
        close:  close,
        status: function () {
            return {
                btnExists: !!document.getElementById('hamburgerBtn'),
                wired:     wired,
                menuOpen:  menuOpen,
                dropExists: !!document.getElementById(DROP_ID)
            };
        }
    };

    ready(init);
})();
