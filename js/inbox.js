/* ── Admin Inbox (Phase 1: outbound email) ───────────────────────
 * Wires the dashboard's "Inbox" tab:
 *   • Compose modal → POST to the inbox-mail Worker → Brevo sends the email.
 *   • On success, write a record to Firestore /sentEmails/{auto-id} so the
 *     "Sent" tab can show admin's outbox history.
 *
 * Brevo API key & SMTP creds NEVER touch the browser — the Worker holds
 * them in Cloudflare secrets and fetches Brevo's API server-side.
 *
 * Future phases will add inbound email + Brevo Conversations chats.
 * ─────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    function workerUrl() { return window.INBOX_WORKER_URL || ''; }
    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function plainToHtml(text) {
        const lines = String(text || '').split(/\n{2,}/);
        return lines
            .map(p => '<p style="margin:0 0 12px;">' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>')
            .join('\n');
    }
    function setStatus(el, msg, isError) {
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = isError ? '#c0392b' : '#0a5a68';
    }

    async function sendEmail(args) {
        const url = workerUrl();
        if (!url) throw new Error('INBOX_WORKER_URL not configured (dashboard.html).');
        if (!window.__firebaseReady) throw new Error('Firebase not initialised.');

        const fb = await window.__firebaseReady;
        const user = fb.auth.currentUser;
        if (!user) throw new Error('You must be signed in.');
        const idToken = await user.getIdToken(false);

        const body = { to: args.to, subject: args.subject };
        if (args.html)    body.html = args.html;
        if (args.text)    body.text = args.text;
        if (args.replyTo) body.replyTo = args.replyTo;
        if (args.cc)      body.cc = args.cc;
        if (args.from)    body.from = args.from;

        let res, json;
        try {
            res = await fetch(url.replace(/\/$/, '') + '/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + idToken
                },
                body: JSON.stringify(body)
            });
            json = await res.json().catch(() => ({}));
        } catch (err) {
            throw new Error('Network error: ' + (err.message || 'unknown'));
        }
        if (!res.ok) throw new Error((json && json.error) || ('HTTP ' + res.status));
        return json;
    }

    async function logSent(record) {
        try {
            const fb = await window.__firebaseReady;
            const colRef = fb.firestore.collection(fb.db, 'sentEmails');
            await fb.firestore.addDoc(colRef, Object.assign({}, record, {
                createdAt: fb.firestore.serverTimestamp()
            }));
        } catch (err) {
            console.warn('[inbox] Could not log sent email:', err);
        }
    }

    async function loadSent() {
        const tbody = $('inboxSentBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading…</td></tr>';
        try {
            const fb = await window.__firebaseReady;
            const q = fb.firestore.query(
                fb.firestore.collection(fb.db, 'sentEmails'),
                fb.firestore.orderBy('createdAt', 'desc'),
                fb.firestore.limit(50)
            );
            const snap = await fb.firestore.getDocs(q);
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No emails sent yet. Click Compose to start.</td></tr>';
                return;
            }
            const rows = [];
            snap.forEach(d => {
                const r = d.data() || {};
                const when = r.createdAt && r.createdAt.toDate
                    ? r.createdAt.toDate().toLocaleString()
                    : (r.sentAt || '—');
                rows.push(
                    '<tr>' +
                        '<td>' + escapeHtml(when) + '</td>' +
                        '<td>' + escapeHtml(r.to || '') + '</td>' +
                        '<td>' + escapeHtml(r.subject || '') + '</td>' +
                        '<td>' + escapeHtml(r.sentBy || '') + '</td>' +
                        '<td><span class="badge badge-confirmed">SENT</span></td>' +
                    '</tr>'
                );
            });
            tbody.innerHTML = rows.join('');
        } catch (err) {
            console.error('[inbox] loadSent failed:', err);
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty" style="color:#c0392b;">Failed to load: ' + escapeHtml(err.message || err) + '</td></tr>';
        }
    }

    function ensureComposeModal() {
        let modal = $('inboxComposeModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'inboxComposeModal';
        modal.className = 'inbox-compose-modal';
        // Build the From-mailbox dropdown from window.INBOX_FROM_OPTIONS
        // (defined in dashboard.html). Each entry must:
        //   1) be in the Worker's ALLOWED_SENDERS env var
        //   2) be a verified sender in your Brevo account.
        // First entry = default. Falls back to a single Booking option
        // if dashboard.html didn't declare any.
        const fromOptions = (Array.isArray(window.INBOX_FROM_OPTIONS) && window.INBOX_FROM_OPTIONS.length)
            ? window.INBOX_FROM_OPTIONS
            : [{ email: 'booking@andamanvoyages.in', label: 'Bookings' }];
        const fromOptionsHtml = fromOptions.map(function (opt, i) {
            const safeEmail = escapeHtml(opt.email);
            const safeLabel = escapeHtml(opt.label || opt.email);
            return '<option value="' + safeEmail + '"' + (i === 0 ? ' selected' : '') + '>' +
                       safeLabel + ' &lt;' + safeEmail + '&gt;' +
                   '</option>';
        }).join('');

        modal.innerHTML =
            '<div class="ic-card">' +
                '<div class="ic-head">' +
                    '<h3><i class="fas fa-envelope-open-text"></i> Compose Email</h3>' +
                    '<button type="button" class="ic-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
                '</div>' +
                '<div class="ic-body">' +
                    '<label>From <span class="ic-req">*</span>' +
                        '<select id="icFrom" required>' + fromOptionsHtml + '</select>' +
                    '</label>' +
                    '<label>To <span class="ic-req">*</span><input type="email" id="icTo" placeholder="customer@example.com" required></label>' +
                    '<label>Subject <span class="ic-req">*</span><input type="text" id="icSubject" placeholder="Re: Your Andaman trip enquiry" required maxlength="300"></label>' +
                    '<label>Reply-To (optional)<input type="email" id="icReplyTo" placeholder="info@andamanvoyages.in"></label>' +
                    '<label>Message <span class="ic-req">*</span><textarea id="icBody" rows="10" placeholder="Hi …" required></textarea></label>' +
                    '<div class="ic-status" id="icStatus"></div>' +
                '</div>' +
                '<div class="ic-foot">' +
                    '<button type="button" class="ic-cancel">Cancel</button>' +
                    '<button type="button" class="ic-send"><i class="fas fa-paper-plane"></i> Send</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);

        function close() { modal.classList.remove('open'); }

        modal.addEventListener('click', e => { if (e.target === modal) close(); });
        modal.querySelector('.ic-close').addEventListener('click', close);
        modal.querySelector('.ic-cancel').addEventListener('click', close);
        modal.querySelector('.ic-send').addEventListener('click', onSend);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal.classList.contains('open')) close();
        });

        async function onSend() {
            const fromSel  = $('icFrom');
            const from     = fromSel ? fromSel.value.trim() : '';
            const to       = $('icTo').value.trim();
            const subject  = $('icSubject').value.trim();
            const replyTo  = $('icReplyTo').value.trim();
            const bodyText = $('icBody').value.trim();
            const sendBtn  = modal.querySelector('.ic-send');
            const statusEl = $('icStatus');

            if (!to || !subject || !bodyText) {
                setStatus(statusEl, 'Please fill To, Subject and Message.', true);
                return;
            }
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
            setStatus(statusEl, 'Sending via Brevo as ' + (from || 'default') + '…', false);

            try {
                const result = await sendEmail({
                    to, subject,
                    html: plainToHtml(bodyText),
                    text: bodyText,
                    replyTo: replyTo || undefined,
                    from: from || undefined
                });
                await logSent({
                    from: from || '',
                    to, subject,
                    bodyText,
                    sentBy: result.sentBy || '',
                    messageId: result.messageId || '',
                    sentAt: result.sentAt || new Date().toISOString()
                });
                if (window.Toast) window.Toast.success('Email sent to ' + to);
                close();
                loadSent();
            } catch (err) {
                console.error('[inbox] send failed:', err);
                setStatus(statusEl, '❌ ' + (err.message || 'Send failed'), true);
                if (window.Toast) window.Toast.error('Send failed: ' + (err.message || 'unknown'));
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
            }
        }
        return modal;
    }

    function openCompose(prefill) {
        const modal = ensureComposeModal();
        $('icTo').value      = (prefill && prefill.to)      || '';
        $('icSubject').value = (prefill && prefill.subject) || '';
        $('icReplyTo').value = (prefill && prefill.replyTo) || '';
        $('icBody').value    = (prefill && prefill.body)    || '';
        setStatus($('icStatus'), '');
        modal.classList.add('open');
        setTimeout(() => $('icTo').focus(), 50);
    }
    window.__inboxOpenCompose = openCompose;

    document.addEventListener('DOMContentLoaded', function () {
        const composeBtn = $('inboxComposeBtn');
        if (composeBtn) composeBtn.addEventListener('click', () => openCompose());

        const refreshBtn = $('inboxRefreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', loadSent);

        // Lazy-load Sent table when the Inbox section first becomes active.
        let loadedOnce = false;
        document.querySelectorAll('.sidebar-link[data-section="inbox"]').forEach(link => {
            link.addEventListener('click', () => {
                const t = $('pageTitle');
                if (t) t.textContent = 'Admin Inbox';
                if (!loadedOnce) { loadedOnce = true; loadSent(); }
            });
        });
    });
})();
