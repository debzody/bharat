/* ── Admin Inbox ──────────────────────────────────────────────────
 * Wires the dashboard's "Inbox" tab:
 *   • Compose modal → POST to the inbox-mail Worker → Brevo sends the email.
 *     On success, write a record to Firestore /sentEmails/{auto-id}.
 *   • Received tab → reads /receivedEmails (populated by the email-router
 *     Cloudflare Worker — see workers/email-router/) and shows a list +
 *     preview pane. Reply button prefills the Compose modal with the
 *     correct From / To / Subject / quoted body.
 *
 * Outbound: Brevo API key + SMTP creds never touch the browser — the
 *   inbox-mail Worker holds them in Cloudflare secrets.
 * Inbound: the email-router Worker authenticates as a Firebase service
 *   account and writes /receivedEmails docs via the REST API. The browser
 *   only reads (admin rule).
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
        // The compose dropdown is built once in ensureComposeModal(), so to
        // honour `prefill.from` (passed by Reply) we set the <select> value
        // post-creation. Falls back silently if the requested mailbox isn't
        // in INBOX_FROM_OPTIONS.
        if (prefill && prefill.from) {
            const sel = $('icFrom');
            if (sel) {
                const want = String(prefill.from).toLowerCase();
                for (const opt of sel.options) {
                    if (opt.value.toLowerCase() === want) { sel.value = opt.value; break; }
                }
            }
        }
        setStatus($('icStatus'), '');
        modal.classList.add('open');
        setTimeout(() => $('icTo').focus(), 50);
    }
    window.__inboxOpenCompose = openCompose;

    /* ── Received pane ─────────────────────────────────────── */

    // In-memory cache of the most-recent /receivedEmails docs, keyed by
    // doc.id. Lets the click handler render the preview pane without a
    // second fetch.
    let _receivedCache = {};

    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    }
    function shortAddr(s) {
        // "Foo Bar <foo@bar.com>" → "Foo Bar"
        // "foo@bar.com"            → "foo@bar.com"
        const m = String(s || '').match(/^([^<]+?)\s*<.+>$/);
        return (m ? m[1] : (s || '')).trim();
    }
    function emailOnly(s) {
        const m = String(s || '').match(/<([^>]+)>/);
        return m ? m[1].trim() : String(s || '').trim();
    }
    function safeMailbox(envTo) {
        // Cloudflare may give us "booking@andamanvoyages.in" or
        // "Bookings <booking@andamanvoyages.in>" depending on routing.
        return emailOnly(envTo).toLowerCase();
    }

    async function loadReceived() {
        const tbody = $('inboxReceivedBody');
        const countEl = $('inboxReceivedCount');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Loading…</td></tr>';
        try {
            const fb = await window.__firebaseReady;
            const q = fb.firestore.query(
                fb.firestore.collection(fb.db, 'receivedEmails'),
                fb.firestore.orderBy('receivedAt', 'desc'),
                fb.firestore.limit(100)
            );
            const snap = await fb.firestore.getDocs(q);
            _receivedCache = {};
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No emails received yet. Cloudflare Email Routing will start populating this once Phase 1 setup is complete.</td></tr>';
                if (countEl) countEl.textContent = '0';
                return;
            }
            const rows = [];
            let unread = 0;
            snap.forEach(d => {
                const r = d.data() || {};
                _receivedCache[d.id] = r;
                if (r.unread) unread++;
                const when = fmtDate(r.receivedAt);
                const fromShort = escapeHtml(shortAddr(r.from || r.envelopeFrom || ''));
                const subj = escapeHtml(r.subject || '(no subject)');
                const mbx = escapeHtml(r.mailbox || safeMailbox(r.envelopeTo));
                rows.push(
                    '<tr data-id="' + escapeHtml(d.id) + '"' + (r.unread ? ' class="unread"' : '') + '>' +
                        '<td>' + escapeHtml(when) + '</td>' +
                        '<td>' + fromShort + '</td>' +
                        '<td>' + subj + '</td>' +
                        '<td>' + mbx + '</td>' +
                    '</tr>'
                );
            });
            tbody.innerHTML = rows.join('');
            if (countEl) countEl.textContent = String(unread || snap.size);
            wireReceivedRows();
        } catch (err) {
            console.error('[inbox] loadReceived failed:', err);
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty" style="color:#c0392b;">Failed to load: ' + escapeHtml(err.message || err) + '</td></tr>';
        }
    }

    function wireReceivedRows() {
        const tbody = $('inboxReceivedBody');
        if (!tbody) return;
        tbody.querySelectorAll('tr[data-id]').forEach(tr => {
            tr.addEventListener('click', () => {
                tbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                renderPreview(tr.dataset.id);
            });
        });
    }

    function renderPreview(docId) {
        const pane = $('inboxPreview');
        if (!pane) return;
        const r = _receivedCache[docId];
        if (!r) {
            pane.innerHTML = '<div class="inbox-preview-empty"><i class="fas fa-circle-exclamation"></i><p>Email not in cache. Click Refresh.</p></div>';
            return;
        }
        const subj = escapeHtml(r.subject || '(no subject)');
        const from = escapeHtml(r.from || r.envelopeFrom || '');
        const to   = escapeHtml(r.to   || r.envelopeTo   || '');
        const cc   = r.cc ? '<div class="ipv-row"><strong>Cc:</strong> ' + escapeHtml(r.cc) + '</div>' : '';
        const date = escapeHtml(fmtDate(r.receivedAt));
        const mbx  = escapeHtml(r.mailbox || safeMailbox(r.envelopeTo));

        const spamScore = Number(r.spamScore || 0);
        const spamWarn = (spamScore >= 5)
            ? '<div class="ipv-spam"><i class="fas fa-triangle-exclamation"></i> Spam score: ' +
              escapeHtml(String(r.spamScore)) + ' &mdash; treat with care.</div>'
            : '';

        let bodyHtml = '';
        if (r.textPlain) {
            bodyHtml = '<pre>' + escapeHtml(r.textPlain) + '</pre>';
        } else if (r.textHtml) {
            // Render HTML inside a sandboxed iframe so we never execute
            // scripts or expose tokens to the email body.
            const blob = encodeURIComponent(String(r.textHtml));
            bodyHtml = '<iframe sandbox srcdoc="' + escapeHtml(r.textHtml) +
                       '" style="width:100%;border:0;height:60vh;" title="email body"></iframe>';
            // Note: setting srcdoc via attribute requires the HTML to be
            // attribute-escaped (which escapeHtml does).
            void blob;
        } else {
            bodyHtml = '<em style="color:#9aa7b1;">(empty body)</em>';
        }

        let attachHtml = '';
        if (Array.isArray(r.attachments) && r.attachments.length) {
            attachHtml = '<div class="ipv-attach"><strong><i class="fas fa-paperclip"></i> Attachments (' +
                r.attachments.length + ')</strong><ul>' +
                r.attachments.map(a => '<li>' +
                    escapeHtml(a.filename || 'unnamed') +
                    ' &middot; ' + escapeHtml(a.mimeType || '') +
                    ' &middot; ' + Math.round((Number(a.sizeBytes) || 0) / 1024) + ' KB' +
                '</li>').join('') +
                '</ul><small>Attachment contents aren\'t mirrored here yet — see the forwarded copy in Gmail.</small></div>';
        }

        pane.innerHTML =
            spamWarn +
            '<div class="ipv-head">' +
                '<h3 class="ipv-subject">' + subj + '</h3>' +
                '<div class="ipv-meta">' +
                    '<div class="ipv-row"><strong>From:</strong> ' + from + '</div>' +
                    '<div class="ipv-row"><strong>To:</strong> ' + to + '</div>' +
                    cc +
                    '<div class="ipv-row"><strong>Mailbox:</strong> ' + mbx +
                        ' &middot; <strong>Received:</strong> ' + date + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="ipv-actions">' +
                '<button type="button" class="ipv-reply" data-action="reply"><i class="fas fa-reply"></i> Reply</button>' +
                '<button type="button" data-action="reply-all"><i class="fas fa-reply-all"></i> Reply All</button>' +
                '<button type="button" data-action="forward"><i class="fas fa-share"></i> Forward</button>' +
                '<button type="button" data-action="mark-read"><i class="fas fa-check"></i> Mark read</button>' +
            '</div>' +
            '<div class="ipv-body">' + bodyHtml + '</div>' +
            attachHtml;

        pane.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => onPreviewAction(btn.dataset.action, docId));
        });
    }

    function quoteBody(r) {
        // Build a quoted reply preamble: each line of the original body
        // is prefixed with "> " so the customer can see what we're
        // replying to. Truncate to 8 KB so a 100 KB email doesn't blow
        // up the textarea.
        const src = (r.textPlain || stripTags(r.textHtml || '')).slice(0, 8000);
        const when = r.date || fmtDate(r.receivedAt);
        const sender = r.from || r.envelopeFrom || '';
        const head = '\n\nOn ' + when + ', ' + sender + ' wrote:\n';
        const quoted = src.split('\n').map(l => '> ' + l).join('\n');
        return head + quoted;
    }

    function stripTags(html) {
        return String(html || '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n');
    }

    async function markRead(docId) {
        // Best-effort write — the rule we shipped denies browser writes
        // to /receivedEmails (only the service account can mutate it).
        // We update the in-memory cache + DOM so the bold styling clears
        // immediately, even though the underlying doc still says unread.
        // A future enhancement would expose a /mark-read endpoint on the
        // email-router Worker. For now this is purely a UX nicety.
        const r = _receivedCache[docId];
        if (r) r.unread = false;
        const tr = document.querySelector('#inboxReceivedBody tr[data-id="' + cssEscape(docId) + '"]');
        if (tr) tr.classList.remove('unread');
        const countEl = $('inboxReceivedCount');
        if (countEl) {
            const n = Math.max(0, parseInt(countEl.textContent || '0', 10) - 1);
            countEl.textContent = String(n);
        }
    }
    function cssEscape(s) {
        // Minimal CSS attribute-selector escape — Firestore IDs are hex
        // here so this is mostly a guard against the doc ID format
        // changing in the future.
        return String(s).replace(/(["\\])/g, '\\$1');
    }

    function onPreviewAction(action, docId) {
        const r = _receivedCache[docId];
        if (!r) return;
        const subj = String(r.subject || '');
        const senderEmail = emailOnly(r.from || r.envelopeFrom || '');
        // The mailbox we'll reply FROM should be the original recipient
        // (booking@, info@ or cancellation@), so the customer's reply
        // continues to land on the same desk. Falls back to the first
        // INBOX_FROM_OPTIONS entry if the captured value isn't an
        // address we can send from.
        const fromMailbox = safeMailbox(r.envelopeTo || r.to || '');
        const replySubject = /^re:/i.test(subj) ? subj : ('Re: ' + subj);

        if (action === 'reply') {
            openCompose({
                to: senderEmail,
                subject: replySubject,
                body: quoteBody(r),
                from: fromMailbox
            });
            markRead(docId);
            return;
        }
        if (action === 'reply-all') {
            // Cc everyone on the original except the mailbox we're replying
            // FROM (no point bcc'ing yourself).
            const ccList = String(r.cc || '').split(',').map(s => emailOnly(s)).filter(Boolean)
                .filter(e => e.toLowerCase() !== fromMailbox);
            const subjectLine = replySubject;
            openCompose({
                to: senderEmail,
                subject: subjectLine,
                body: quoteBody(r),
                from: fromMailbox
            });
            // Compose modal doesn't expose Cc as a field yet; surface it
            // in the body so the admin can paste manually if needed.
            if (ccList.length) {
                const cc = '\n\n[Reply All — also notify: ' + ccList.join(', ') + ']';
                const ta = $('icBody');
                if (ta) ta.value = cc + ta.value;
            }
            markRead(docId);
            return;
        }
        if (action === 'forward') {
            openCompose({
                to: '',
                subject: /^fwd:/i.test(subj) ? subj : ('Fwd: ' + subj),
                body: '\n\n---------- Forwarded message ----------\nFrom: ' +
                      (r.from || '') + '\nDate: ' + (r.date || fmtDate(r.receivedAt)) +
                      '\nSubject: ' + subj + '\nTo: ' + (r.to || '') + '\n\n' +
                      (r.textPlain || stripTags(r.textHtml || '')),
                from: fromMailbox
            });
            return;
        }
        if (action === 'mark-read') {
            markRead(docId);
            return;
        }
    }

    /* ── Tab switching (Sent / Received) ───────────────────── */

    function switchTab(name) {
        document.querySelectorAll('.inbox-tab').forEach(t => {
            const isMe = t.dataset.inboxTab === name;
            t.classList.toggle('active', isMe);
            t.setAttribute('aria-selected', isMe ? 'true' : 'false');
        });
        document.querySelectorAll('.inbox-pane').forEach(p => {
            p.style.display = (p.dataset.inboxPane === name) ? '' : 'none';
        });
    }

    /* ── DOM-ready wiring (replaces the old short version) ─── */

    document.addEventListener('DOMContentLoaded', function () {
        const composeBtn = $('inboxComposeBtn');
        if (composeBtn) composeBtn.addEventListener('click', () => openCompose());

        // Refresh button reloads BOTH panes so the badge counts stay
        // in sync regardless of which tab the admin is on.
        const refreshBtn = $('inboxRefreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => {
            loadSent();
            loadReceived();
        });

        // Tabs
        document.querySelectorAll('.inbox-tab').forEach(t => {
            t.addEventListener('click', () => switchTab(t.dataset.inboxTab));
        });

        // Lazy-load both lists when the Inbox section first becomes active.
        let loadedOnce = false;
        document.querySelectorAll('.sidebar-link[data-section="inbox"]').forEach(link => {
            link.addEventListener('click', () => {
                const t = $('pageTitle');
                if (t) t.textContent = 'Admin Inbox';
                if (!loadedOnce) {
                    loadedOnce = true;
                    loadReceived();
                    loadSent();
                }
            });
        });
    });
})();
