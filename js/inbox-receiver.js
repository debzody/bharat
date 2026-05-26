(function () {
    'use strict';

    const MAILBOXES = [
        { id: 'booking@andamanvoyages.in', label: 'Bookings' },
        { id: 'info@andamanvoyages.in', label: 'Info' },
        { id: 'cancellation@andamanvoyages.in', label: 'Cancellations' },
        { id: 'enquiries@andamanvoyages.in', label: 'Enquiries' }
    ];
    const ALL = '__all__';
    const state = {
        mailbox: 'booking@andamanvoyages.in',
        pane: 'received',
        rows: [],
        selectedId: '',
        seenIds: new Set(),
        unsub: null,
        titleTimer: null,
        baseTitle: document.title || 'Dashboard'
    };

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c];
        });
    }
    function fmtDate(v) {
        const d = new Date(v || '');
        return isNaN(d.getTime()) ? '—' : d.toLocaleString();
    }
    function mailboxLabel(id) {
        const found = MAILBOXES.find(function (m) { return m.id === id; });
        return found ? found.label : 'All';
    }
    function isAdminUser() {
        const email = (((window.currentUser || {}).email) || '').toLowerCase();
        const admins = Array.isArray(window.ADMIN_EMAILS) ? window.ADMIN_EMAILS.map(function (v) { return String(v).toLowerCase(); }) : [];
        return !!email && admins.indexOf(email) !== -1;
    }
    function beep() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.value = 0.03;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            setTimeout(function () {
                try { osc.stop(); } catch (_) {}
                try { ctx.close(); } catch (_) {}
            }, 140);
        } catch (_) {}
    }
    function notifyNative(title, body) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            try { new Notification(title, { body: body || '', icon: 'images/logo.png' }); } catch (_) {}
            return;
        }
        if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(function (perm) {
                if (perm === 'granted') {
                    try { new Notification(title, { body: body || '', icon: 'images/logo.png' }); } catch (_) {}
                }
            }).catch(function () {});
        }
    }
    function flashTitle(count) {
        clearInterval(state.titleTimer);
        let on = false;
        state.titleTimer = setInterval(function () {
            document.title = on ? '(' + count + ') New mail • ' + state.baseTitle : state.baseTitle;
            on = !on;
        }, 900);
        setTimeout(function () {
            clearInterval(state.titleTimer);
            state.titleTimer = null;
            document.title = state.baseTitle;
        }, 8000);
    }
    function unreadCount(rows, mailbox) {
        return rows.filter(function (r) {
            const mbxOk = mailbox === ALL || r.mailbox === mailbox;
            return mbxOk && r.unread;
        }).length;
    }
    function setCounts() {
        const totalUnread = unreadCount(state.rows, ALL);
        const rc = $('inboxReceivedCount');
        if (rc) rc.textContent = totalUnread ? String(totalUnread) : '';
        [ALL].concat(MAILBOXES.map(function (m) { return m.id; })).forEach(function (mbx) {
            const el = document.querySelector('[data-mbx-count="' + mbx + '"]');
            if (el) el.textContent = String(unreadCount(state.rows, mbx));
        });
        // Topnav Inbox icon badge — visible from anywhere in the dashboard
        const navInbox = document.querySelector('.sidebar-link[data-section="inbox"]');
        if (navInbox) {
            let badge = navInbox.querySelector('.topnav-badge');
            if (totalUnread > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'topnav-badge';
                    badge.style.cssText = 'display:inline-block;margin-left:.35rem;padding:.05rem .45rem;font-size:.7rem;font-weight:800;color:#fff;background:#e74c3c;border-radius:999px;line-height:1.4;vertical-align:middle;';
                    navInbox.appendChild(badge);
                }
                badge.textContent = String(totalUnread);
            } else if (badge) {
                badge.remove();
            }
        }
    }
    async function markRead(row) {
        if (!row || !row.unread) return;
        row.unread = false;
        // Update local rows so counters update immediately
        const rec = state.rows.find(function (r) { return r.id === row.id; });
        if (rec) rec.unread = false;
        setCounts();
        try {
            const fb = await window.__firebaseReady;
            const email = (fb.auth && fb.auth.currentUser && fb.auth.currentUser.email) || '';
            await fb.firestore.updateDoc(
                fb.firestore.doc(fb.db, 'receivedEmails', row.id),
                { unread: false, readAt: new Date().toISOString(), readBy: email }
            );
        } catch (err) {
            console.error('[inbox-receiver] markRead failed:', err);
            // Revert local optimistic flip so the user sees something is wrong
            row.unread = true;
            if (rec) rec.unread = true;
            setCounts();
            renderRows();
            if (window.Toast && typeof window.Toast.error === 'function') {
                window.Toast.error('Could not mark mail as read: ' + (err.message || err) +
                    ' (deploy updated firestore.rules — see firebase console).');
            }
        }
    }
    function setPreview(row) {
        const box = $('inboxPreview');
        if (!box) return;
        if (!row) {
            box.innerHTML =
                '<div class="inbox-preview-empty">' +
                    '<i class="fas fa-envelope-open"></i>' +
                    '<p>Select an email to preview.</p>' +
                '</div>';
            return;
        }
        const bodyHtml = row.textHtml
            ? row.textHtml
            : '<div style="white-space:pre-wrap;line-height:1.6;">' + esc(row.textPlain || '(no body)') + '</div>';
        // Header (fixed) + scrollable body — sits inside the
        // .inbox-preview-wrap which is a flex column with height 100%
        // and overflow:hidden, so the .ipv-body's overflow-y:auto kicks in.
        box.innerHTML =
            '<div class="ipv-head">' +
                '<h3 class="ipv-subject">' + esc(row.subject || '(no subject)') + '</h3>' +
                '<div class="ipv-meta">' +
                    '<div class="ipv-row"><strong>From:</strong> ' + esc(row.from || '') + '</div>' +
                    '<div class="ipv-row"><strong>To:</strong> ' + esc(row.to || row.mailbox || '') + '</div>' +
                    '<div class="ipv-row"><strong>Mailbox:</strong> ' + esc(mailboxLabel(row.mailbox)) + '</div>' +
                    '<div class="ipv-row"><strong>Received:</strong> ' + esc(fmtDate(row.receivedAt || row.date)) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="ipv-actions">' +
                '<button type="button" class="ipv-reply" id="inboxReplyBtn">' +
                    '<i class="fas fa-reply"></i> Reply' +
                '</button>' +
            '</div>' +
            '<div class="ipv-body">' + bodyHtml + '</div>';
        const replyBtn = $('inboxReplyBtn');
        if (replyBtn) {
            replyBtn.addEventListener('click', function () {
                const composeBtn = $('inboxComposeBtn');
                if (composeBtn) composeBtn.click();
                setTimeout(function () {
                    const to = $('icTo');
                    const sub = $('icSubject');
                    const reply = $('icReplyTo');
                    if (to) to.value = ((row.from || '').match(/<([^>]+)>/) || [,''])[1] || row.from || '';
                    if (sub) sub.value = /^re:/i.test(row.subject || '') ? (row.subject || '') : ('Re: ' + (row.subject || ''));
                    if (reply) reply.value = ((row.mailbox || '').trim());
                }, 40);
            });
        }
    }
    function filteredRows() {
        return state.rows.filter(function (r) {
            return state.mailbox === ALL || r.mailbox === state.mailbox;
        });
    }
    function renderRows() {
        const body = $('inboxReceivedBody');
        const label = $('inboxMbxLabel');
        if (label) label.textContent = mailboxLabel(state.mailbox);
        if (!body) return;
        const rows = filteredRows().sort(function (a, b) {
            return new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0);
        });
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="4" class="table-empty">No emails found for this mailbox.</td></tr>';
            setPreview(null);
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr class="' + (r.unread ? 'unread ' : '') + (state.selectedId === r.id ? 'selected' : '') + '" data-mail-id="' + esc(r.id) + '">' +
                '<td>' + esc(fmtDate(r.receivedAt || r.date)) + '</td>' +
                '<td>' + esc(r.from || '') + '</td>' +
                '<td>' + esc(r.subject || '(no subject)') + '</td>' +
                '<td>' + esc(mailboxLabel(r.mailbox)) + '</td>' +
            '</tr>';
        }).join('');
        Array.prototype.forEach.call(body.querySelectorAll('tr[data-mail-id]'), function (tr) {
            tr.addEventListener('click', function () {
                const id = tr.getAttribute('data-mail-id');
                state.selectedId = id;
                const row = state.rows.find(function (r) { return r.id === id; });
                if (row) markRead(row);
                renderRows();
                setPreview(row || null);
            });
        });
        const selected = state.rows.find(function (r) { return r.id === state.selectedId; }) || rows[0];
        state.selectedId = selected.id;
        Array.prototype.forEach.call(body.querySelectorAll('tr[data-mail-id]'), function (tr) {
            tr.classList.toggle('selected', tr.getAttribute('data-mail-id') === state.selectedId);
        });
        setPreview(selected);
    }
    function bindTabs() {
        Array.prototype.forEach.call(document.querySelectorAll('.inbox-mbx-tab'), function (btn) {
            btn.addEventListener('click', function () {
                state.mailbox = btn.getAttribute('data-mailbox') || ALL;
                Array.prototype.forEach.call(document.querySelectorAll('.inbox-mbx-tab'), function (b) {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
                });
                renderRows();
            });
        });
        Array.prototype.forEach.call(document.querySelectorAll('.inbox-tab'), function (btn) {
            btn.addEventListener('click', function () {
                const pane = btn.getAttribute('data-inbox-tab') || 'received';
                state.pane = pane;
                Array.prototype.forEach.call(document.querySelectorAll('.inbox-tab'), function (b) {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
                });
                const receivedPane = $('inboxReceivedPane');
                const sentPane = $('inboxSentPane');
                if (receivedPane) receivedPane.style.display = pane === 'received' ? '' : 'none';
                if (sentPane) sentPane.style.display = pane === 'sent' ? '' : 'none';
                if (pane === 'sent' && typeof window.loadInboxSent === 'function') window.loadInboxSent();
            });
        });
    }
    async function subscribe() {
        if (!window.__firebaseReady) return;
        const fb = await window.__firebaseReady;
        if (state.unsub) {
            try { state.unsub(); } catch (_) {}
            state.unsub = null;
        }
        const q = fb.firestore.query(
            fb.firestore.collection(fb.db, 'receivedEmails'),
            fb.firestore.orderBy('receivedAt', 'desc'),
            fb.firestore.limit(100)
        );
        state.unsub = fb.firestore.onSnapshot(q, function (snap) {
            const incoming = [];
            const fresh = [];
            snap.forEach(function (doc) {
                const data = doc.data() || {};
                const row = {
                    id: doc.id,
                    from: data.from || '',
                    to: data.to || '',
                    subject: data.subject || '',
                    mailbox: String(data.mailbox || '').toLowerCase(),
                    unread: !!data.unread,
                    receivedAt: data.receivedAt || '',
                    date: data.date || '',
                    textPlain: data.textPlain || '',
                    textHtml: data.textHtml || ''
                };
                incoming.push(row);
                if (!state.seenIds.has(doc.id)) fresh.push(row);
                state.seenIds.add(doc.id);
            });
            state.rows = incoming;
            setCounts();
            renderRows();

            if (fresh.length && isAdminUser()) {
                const visibleFresh = fresh.filter(function (r) {
                    return MAILBOXES.some(function (m) { return m.id === r.mailbox; });
                });
                if (visibleFresh.length) {
                    const latest = visibleFresh[0];
                    if (window.Toast && typeof window.Toast.info === 'function') {
                        window.Toast.info('New mail in ' + mailboxLabel(latest.mailbox) + ': ' + (latest.subject || '(no subject)'));
                    }
                    notifyNative('New mail in ' + mailboxLabel(latest.mailbox), (latest.from || '') + ' — ' + (latest.subject || '(no subject)'));
                    beep();
                    flashTitle(visibleFresh.length);
                }
            }
        }, function (err) {
            console.error('[inbox-receiver] snapshot failed:', err);
            const body = $('inboxReceivedBody');
            if (body) {
                body.innerHTML = '<tr><td colspan="4" class="table-empty" style="color:#c0392b;">Failed to load inbox: ' + esc(err.message || err) + '</td></tr>';
            }
        });
    }
    function initRefresh() {
        const btn = $('inboxRefreshBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            subscribe().catch(function (err) {
                console.error('[inbox-receiver] refresh failed:', err);
            });
            if (typeof window.loadInboxSent === 'function') window.loadInboxSent();
        });
    }
    /* ── Resizable split divider ───────────────────────────
       Drag the small bar between the list and the preview to
       change the split. Stored in localStorage as a percentage
       of the .inbox-split width (8 % .. 75 %). Default = 40 %
       (so the preview gets ~60 %). */
    function initResizableSplit() {
        const split = $('inboxSplit');
        const divider = $('inboxDivider');
        if (!split || !divider) return;
        const STORAGE_KEY = 'inboxSplitRatio';
        const MIN_PCT = 18;   // list column minimum
        const MAX_PCT = 75;   // list column maximum

        function applyPct(pct) {
            const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
            split.style.setProperty('--inbox-list-w', clamped.toFixed(2) + '%');
        }
        // Initial: saved or default 40%
        let saved = parseFloat(localStorage.getItem(STORAGE_KEY) || '');
        if (!isFinite(saved) || saved < MIN_PCT || saved > MAX_PCT) saved = 40;
        applyPct(saved);

        let dragging = false;
        function onDown(ev) {
            ev.preventDefault();
            dragging = true;
            divider.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }
        function onMove(ev) {
            if (!dragging) return;
            const rect = split.getBoundingClientRect();
            if (!rect.width) return;
            const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
            const pct = (x / rect.width) * 100;
            applyPct(pct);
        }
        function onUp() {
            if (!dragging) return;
            dragging = false;
            divider.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Persist current value
            const cur = split.style.getPropertyValue('--inbox-list-w');
            const num = parseFloat(cur);
            if (isFinite(num)) {
                try { localStorage.setItem(STORAGE_KEY, String(num)); } catch (_) {}
            }
        }
        divider.addEventListener('mousedown', onDown);
        divider.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);
        // Double-click resets to default 40 %
        divider.addEventListener('dblclick', function () {
            applyPct(40);
            try { localStorage.setItem(STORAGE_KEY, '40'); } catch (_) {}
        });
        // Keyboard nudges (← / →) when divider is focused
        divider.addEventListener('keydown', function (ev) {
            if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
            ev.preventDefault();
            const cur = parseFloat(split.style.getPropertyValue('--inbox-list-w')) || 40;
            const next = ev.key === 'ArrowLeft' ? cur - 2 : cur + 2;
            applyPct(next);
            try { localStorage.setItem(STORAGE_KEY, String(Math.max(MIN_PCT, Math.min(MAX_PCT, next)))); } catch (_) {}
        });
    }
    function init() {
        bindTabs();
        initRefresh();
        initResizableSplit();
        subscribe().catch(function (err) {
            console.error('[inbox-receiver] init failed:', err);
        });
    }

    window.AdminInboxReceiver = { init: init, refresh: subscribe };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();