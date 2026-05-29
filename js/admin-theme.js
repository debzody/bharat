/*
 * admin-theme.js - auto-apply the dark-blue admin theme.
 *
 * What this does
 *   1. Detects whether the current visitor is an ADMIN or STAFF user
 *      using the same checks the rest of the site already trusts:
 *        - localStorage.currentUser -> role === 'admin' | 'staff'
 *        - OR email in window.ADMIN_EMAILS
 *        - OR email in window.STAFF_EMAILS
 *      (firebase-config.js exposes both lists to the page.)
 *   2. If yes, adds class="admin-theme" to <body> as early as possible
 *      so css/admin-theme.css takes over before the first paint.
 *   3. Re-runs on Firebase auth-state change, auth:changed events, and
 *      storage events for cross-tab logout sync.
 *   4. ADMIN-ONLY: lets admins (NOT staff) pick a custom background
 *      colour for the console via a small floating "Theme" picker.
 *      The choice is persisted in localStorage (per-browser) and is
 *      applied by overriding the --at-bg CSS custom-property on
 *      body.admin-theme. Choosing "Default" clears the override.
 *
 * Public API
 *   window.AdminTheme.isAdminOrStaff()      -> 'admin' | 'staff' | false
 *   window.AdminTheme.apply()               -> toggle <body class>
 *   window.AdminTheme.force(true|false)     -> manual override (testing)
 *   window.AdminTheme.setBgColor('#hex'|'') -> admin background override
 *   window.AdminTheme.getBgColor()          -> current override or ''
 */
(function () {
    'use strict';

    var BODY_CLASS = 'admin-theme';
    var HTML_CLASS = 'admin-theme';
    var BG_STORAGE_KEY = 'adminThemeBgColor';
    var PICKER_ID = 'admin-theme-picker';

    /* Read & normalise the email list helpers from firebase-config.js. */
    function lc(arr) {
        return Array.prototype.slice.call(arr || []).map(function (s) {
            return String(s || '').trim().toLowerCase();
        });
    }

    function isAdminOrStaff() {
        // 1) Live Firebase auth instance (most reliable).
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

        // 2) Fall back to localStorage profile cache.
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

    /* ---- Background-colour override (admin-only) ---- */
    function getBgColor() {
        try { return localStorage.getItem(BG_STORAGE_KEY) || ''; } catch (_) { return ''; }
    }

    /* Convert a #hex string to {r,g,b}. Accepts 3- or 6-char shorthand. */
    function hexToRgb(hex) {
        var h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
        var n = parseInt(h, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function rgbToHex(r, g, b) {
        function p(v) {
            v = Math.max(0, Math.min(255, Math.round(v)));
            var s = v.toString(16);
            return s.length === 1 ? '0' + s : s;
        }
        return '#' + p(r) + p(g) + p(b);
    }
    /* Mix a colour with white (positive amt) or black (negative amt). */
    function mix(hex, amt) {
        var c = hexToRgb(hex);
        var t = amt < 0 ? 0 : 255;
        var p = Math.abs(amt);
        return rgbToHex(
            c.r + (t - c.r) * p,
            c.g + (t - c.g) * p,
            c.b + (t - c.b) * p
        );
    }
    /* Relative luminance — returns 0..1 (0 = black, 1 = white). */
    function lum(hex) {
        var c = hexToRgb(hex);
        // sRGB linearised
        function ch(v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    }

    /* Compute card / input / border / text tints derived from the
       admin-chosen page background. Dark page → lighten cards,
       light page → darken cards. Keeps card vs page contrast visible
       regardless of which colour the admin picks. */
    function computeTints(bg) {
        var L = lum(bg);
        var isDark = L < 0.5;
        var surface, input, border, text;
        if (isDark) {
            surface = mix(bg, +0.10); // lift cards 10% toward white
            input   = mix(bg, +0.16);
            border  = mix(bg, +0.22);
            text    = '#e6eef8';
        } else {
            surface = mix(bg, -0.06); // darken cards 6% toward black
            input   = mix(bg, -0.02);
            border  = mix(bg, -0.18);
            text    = '#1c2b48';
        }
        return { surface: surface, input: input, border: border, text: text };
    }

    /* Inject (or update) a high-specificity style block that paints
       the admin-chosen colour onto every "page" surface — html, body,
       .dashboard-body and .dashboard-main — using !important so the
       existing theme classes (theme-light, theme-hacker, theme-ocean,
       theme-sunset, theme-midnight, theme-cyberpunk and admin-theme)
       can't outrank it. We also clear any background-image (those
       themes use radial / conic gradients) so the chosen flat colour
       is what the admin actually sees. */
    var BG_STYLE_ID = 'admin-theme-bg-override';
    function applyBgColor() {
        var colour = getBgColor();
        var body = document.body;
        var html = document.documentElement;
        var existing = document.getElementById(BG_STYLE_ID);

        if (!colour) {
            // Clear all overrides.
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            if (body) {
                body.style.removeProperty('--at-bg');
                body.removeAttribute('data-admin-bg');
            }
            if (html) html.style.removeProperty('background-color');
            return;
        }

        // Stamp the variable + data-attr (cheap, plus cooperates with CSS).
        if (body) {
            body.style.setProperty('--at-bg', colour);
            body.setAttribute('data-admin-bg', colour);
        }
        // Compute lightened/darkened tints for cards & inputs so they
        // stand out against the chosen page bg without breaking contrast.
        var tints = computeTints(colour);

        // And inject a global override that wins against every theme rule.
        var css =
            // Page background
            'html[data-admin-bg], html[data-admin-bg] body,' +
            'body[data-admin-bg], body[data-admin-bg].dashboard-body,' +
            'body[data-admin-bg] .dashboard-main, body[data-admin-bg] .dashboard-body,' +
            'body[data-admin-bg].theme-light, body[data-admin-bg].theme-hacker,' +
            'body[data-admin-bg].theme-ocean, body[data-admin-bg].theme-sunset,' +
            'body[data-admin-bg].theme-midnight, body[data-admin-bg].theme-cyberpunk,' +
            'body[data-admin-bg].admin-theme {' +
            '  background-color: ' + colour + ' !important;' +
            '  background-image: none !important;' +
            '}' +
            // Kill decorative ::before / ::after gradient layers.
            'body[data-admin-bg]::before, body[data-admin-bg]::after {' +
            '  background: transparent !important;' +
            '  background-image: none !important;' +
            '}' +
            // Cards / panels / surfaces — slightly lifted shade
            'body[data-admin-bg] .dashboard-section,' +
            'body[data-admin-bg] .stat-card,' +
            'body[data-admin-bg] .table-card,' +
            'body[data-admin-bg] .chart-card,' +
            'body[data-admin-bg] .settings-card,' +
            'body[data-admin-bg] .card,' +
            'body[data-admin-bg] .panel,' +
            'body[data-admin-bg] .modal-content,' +
            'body[data-admin-bg] .inbox-list-wrap,' +
            'body[data-admin-bg] .inbox-preview-wrap,' +
            'body[data-admin-bg] .package-editor-card,' +
            'body[data-admin-bg] .pkg-edit-card,' +
            'body[data-admin-bg] .admin-gallery-card,' +
            'body[data-admin-bg] .admin-gallery-uploader,' +
            'body[data-admin-bg] .gd-list,' +
            'body[data-admin-bg] .booking-card {' +
            '  background-color: ' + tints.surface + ' !important;' +
            '  background-image: none !important;' +
            '  border-color: ' + tints.border + ' !important;' +
            '  color: ' + tints.text + ' !important;' +
            '}' +
            // Inputs / textareas / selects — even lighter shade
            'body[data-admin-bg] input[type="text"],' +
            'body[data-admin-bg] input[type="email"],' +
            'body[data-admin-bg] input[type="tel"],' +
            'body[data-admin-bg] input[type="url"],' +
            'body[data-admin-bg] input[type="number"],' +
            'body[data-admin-bg] input[type="search"],' +
            'body[data-admin-bg] input[type="password"],' +
            'body[data-admin-bg] input[type="date"],' +
            'body[data-admin-bg] input[type="time"],' +
            'body[data-admin-bg] textarea,' +
            'body[data-admin-bg] select {' +
            '  background-color: ' + tints.input + ' !important;' +
            '  border-color: ' + tints.border + ' !important;' +
            '  color: ' + tints.text + ' !important;' +
            '}' +
            // Table rows
            'body[data-admin-bg] .data-table th,' +
            'body[data-admin-bg] table th {' +
            '  background-color: ' + tints.input + ' !important;' +
            '  color: ' + tints.text + ' !important;' +
            '}' +
            'body[data-admin-bg] .data-table td,' +
            'body[data-admin-bg] table td {' +
            '  color: ' + tints.text + ' !important;' +
            '  border-color: ' + tints.border + ' !important;' +
            '}';

        if (existing) {
            existing.textContent = css;
        } else {
            var style = document.createElement('style');
            style.id = BG_STYLE_ID;
            style.appendChild(document.createTextNode(css));
            document.head.appendChild(style);
        }

        // Mirror onto <html> so when body bg is transparent (some themes)
        // the page still shows the chosen colour behind everything.
        if (html) {
            html.setAttribute('data-admin-bg', colour);
            html.style.backgroundColor = colour;
        }
    }

    function setBgColor(colour) {
        try {
            if (colour && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colour)) {
                localStorage.setItem(BG_STORAGE_KEY, colour);
            } else {
                localStorage.removeItem(BG_STORAGE_KEY);
            }
        } catch (_) {}
        applyBgColor();
        // Also refresh the picker UI if it's mounted.
        try { refreshPicker(); } catch (_) {}
        return getBgColor();
    }

    function apply() {
        var forced = null;
        try { forced = sessionStorage.getItem('__adminThemeForce'); } catch (_) {}
        var role = isAdminOrStaff();
        var enabled = (forced === '1') ? true
                    : (forced === '0') ? false
                    : !!role;

        var html = document.documentElement;
        var body = document.body;
        if (enabled) {
            html.classList.add(HTML_CLASS);
            if (body) body.classList.add(BODY_CLASS);
        } else {
            html.classList.remove(HTML_CLASS);
            if (body) body.classList.remove(BODY_CLASS);
        }

        if (enabled) {
            applyBgColor();
        } else if (body) {
            body.style.removeProperty('--at-bg');
            body.removeAttribute('data-admin-bg');
        }

        // Picker is admin-only.
        if (enabled && role === 'admin') {
            mountPicker();
        } else {
            unmountPicker();
        }

        return enabled;
    }

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

    /* ---- Floating colour-picker widget (admins only) ---- */
    var PRESETS = [
        { name: 'Default Navy', value: '' },
        { name: 'Charcoal',     value: '#1a1a1a' },
        { name: 'Forest',       value: '#0f2e1f' },
        { name: 'Plum',         value: '#2a0f3d' },
        { name: 'Wine',         value: '#3d0f1a' },
        { name: 'Slate',        value: '#1f2937' },
        { name: 'Espresso',     value: '#2b1a0f' },
        { name: 'Midnight',     value: '#000814' }
    ];

    function ensurePickerStyles() {
        if (document.getElementById('admin-theme-picker-style')) return;
        var css = [
            // Position bottom-LEFT (most pages have WhatsApp / chat
            // FABs on the right that sat on top of the picker, hiding
            // it from view). Z-index 2147483000 sits above almost every
            // third-party widget without quite overflowing into the
            // 32-bit signed-int max so toasts/alerts can still cover it.
            '#' + PICKER_ID + '{position:fixed;bottom:18px;left:18px;z-index:2147483000;font-family:inherit;}',
            '#' + PICKER_ID + ' .atp-toggle{width:48px;height:48px;border-radius:50%;border:2px solid #fff;background:linear-gradient(135deg,#4cc9ff,#f7c948);color:#06121f;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;}',
            '#' + PICKER_ID + ' .atp-toggle:hover{filter:brightness(1.08);}',
            '#' + PICKER_ID + ' .atp-panel{position:absolute;bottom:54px;right:0;width:240px;background:#142b47;color:#e6eef8;border:1px solid rgba(255,255,255,0.18);border-radius:12px;padding:12px;box-shadow:0 18px 44px rgba(0,0,0,0.55);display:none;}',
            '#' + PICKER_ID + '.open .atp-panel{display:block;}',
            '#' + PICKER_ID + ' .atp-title{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#8aa3c2;margin:0 0 8px;font-weight:700;}',
            '#' + PICKER_ID + ' .atp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;}',
            '#' + PICKER_ID + ' .atp-swatch{position:relative;aspect-ratio:1;border-radius:8px;border:1px solid rgba(255,255,255,0.18);cursor:pointer;padding:0;}',
            '#' + PICKER_ID + ' .atp-swatch[data-default="1"]{background:repeating-linear-gradient(45deg,#0a1929,#0a1929 4px,#142b47 4px,#142b47 8px);}',
            '#' + PICKER_ID + ' .atp-swatch.active{outline:2px solid #4cc9ff;outline-offset:1px;}',
            '#' + PICKER_ID + ' .atp-row{display:flex;gap:6px;align-items:center;margin-top:6px;}',
            '#' + PICKER_ID + ' .atp-row label{font-size:12px;color:#8aa3c2;flex:1;}',
            '#' + PICKER_ID + ' .atp-row input[type="color"]{width:34px;height:28px;border:1px solid rgba(255,255,255,0.2);background:transparent;border-radius:6px;cursor:pointer;padding:0;}',
            '#' + PICKER_ID + ' .atp-reset{margin-top:10px;width:100%;padding:8px 10px;background:rgba(255,255,255,0.06);color:#e6eef8;border:1px solid rgba(255,255,255,0.18);border-radius:8px;cursor:pointer;font-size:12px;}',
            '#' + PICKER_ID + ' .atp-reset:hover{background:rgba(255,255,255,0.12);}',
            '@media print { #' + PICKER_ID + '{display:none !important;} }'
        ].join('');
        var style = document.createElement('style');
        style.id = 'admin-theme-picker-style';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function buildPicker() {
        var wrap = document.createElement('div');
        wrap.id = PICKER_ID;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'atp-toggle';
        btn.setAttribute('aria-label', 'Choose admin background colour');
        btn.title = 'Admin theme background';
        btn.innerHTML = '&#127912;'; // artist palette emoji
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            wrap.classList.toggle('open');
        });

        var panel = document.createElement('div');
        panel.className = 'atp-panel';
        panel.addEventListener('click', function (e) { e.stopPropagation(); });

        var title = document.createElement('div');
        title.className = 'atp-title';
        title.textContent = 'Admin background';
        panel.appendChild(title);

        var grid = document.createElement('div');
        grid.className = 'atp-grid';
        PRESETS.forEach(function (p) {
            var sw = document.createElement('button');
            sw.type = 'button';
            sw.className = 'atp-swatch';
            sw.setAttribute('data-value', p.value);
            sw.title = p.name;
            sw.setAttribute('aria-label', p.name);
            if (p.value) {
                sw.style.background = p.value;
            } else {
                sw.setAttribute('data-default', '1');
            }
            sw.addEventListener('click', function () {
                setBgColor(p.value);
            });
            grid.appendChild(sw);
        });
        panel.appendChild(grid);

        // Custom colour row
        var row = document.createElement('div');
        row.className = 'atp-row';
        var rowLabel = document.createElement('label');
        rowLabel.textContent = 'Custom colour';
        var colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.setAttribute('aria-label', 'Custom background colour');
        var current = getBgColor();
        colorInput.value = current && /^#[0-9a-fA-F]{6}$/.test(current) ? current : '#0a1929';
        colorInput.addEventListener('input', function () {
            setBgColor(colorInput.value);
        });
        row.appendChild(rowLabel);
        row.appendChild(colorInput);
        panel.appendChild(row);

        // Reset button
        var reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'atp-reset';
        reset.textContent = 'Reset to default';
        reset.addEventListener('click', function () {
            setBgColor('');
        });
        panel.appendChild(reset);

        wrap.appendChild(btn);
        wrap.appendChild(panel);

        // Close on outside click.
        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target)) wrap.classList.remove('open');
        });
        // Close on Escape.
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') wrap.classList.remove('open');
        });

        return wrap;
    }

    function refreshPicker() {
        var wrap = document.getElementById(PICKER_ID);
        if (!wrap) return;
        var current = getBgColor();
        // Highlight active swatch
        var swatches = wrap.querySelectorAll('.atp-swatch');
        Array.prototype.forEach.call(swatches, function (s) {
            if (s.getAttribute('data-value') === current) s.classList.add('active');
            else s.classList.remove('active');
        });
        // Sync colour input
        var ci = wrap.querySelector('input[type="color"]');
        if (ci && current && /^#[0-9a-fA-F]{6}$/.test(current)) ci.value = current;
    }

    function mountPicker() {
        if (!document.body) return;
        if (document.getElementById(PICKER_ID)) {
            refreshPicker();
            return;
        }
        ensurePickerStyles();
        var widget = buildPicker();
        document.body.appendChild(widget);
        refreshPicker();
    }

    function unmountPicker() {
        var existing = document.getElementById(PICKER_ID);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    }

    /* ---- Boot ---- */
    apply();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply, { once: true });
    }

    /* React to login / logout. */
    document.addEventListener('auth:changed', apply);
    window.addEventListener('storage', function (e) {
        if (e && (e.key === 'currentUser' || e.key === 'token')) apply();
        if (e && e.key === BG_STORAGE_KEY) { applyBgColor(); refreshPicker(); }
    });

    /* Wait for the Firebase auth listener to fire. */
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
        force:          force,
        setBgColor:     setBgColor,
        getBgColor:     getBgColor
    };
})();
