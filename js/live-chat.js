/* ── LIVE Chat widget ─────────────────────────────────────────
 * Distinct orange-red "LIVE" bubble that opens a Firestore-backed
 * chat with a real human. Hides AI bot + WhatsApp FAB while open.
 *
 * Persists messages to /chats/{sessionId}/messages so admin can
 * read & reply from the dashboard. When the WhatsApp Cloud API
 * bridge is configured, every message also DMs the admin's WhatsApp.
 * ─────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    function getProvider() {
        try {
            var raw = localStorage.getItem('siteSettings');
            if (!raw) return 'custom';
            return ((JSON.parse(raw) || {}).chatProvider || 'custom').toLowerCase();
        } catch (_) { return 'custom'; }
    }
    if (getProvider() !== 'custom') return;

    var path = (location.pathname || '').toLowerCase();
    if (path.indexOf('/dashboard') === 0 || path.indexOf('/migrate') === 0) return;

    var SESSION_KEY = 'liveChatSessionId';
    var sessionId = (function () {
        try {
            var s = localStorage.getItem(SESSION_KEY);
            if (s && s.length > 8) return s;
        } catch (_) {}
        var n = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem(SESSION_KEY, n); } catch (_) {}
        return n;
    })();

    /* CSS — uses only single quotes and concat to avoid template literal issues */
    var CSS = '';
    CSS += '.lc-btn{position:fixed;bottom:28px;left:28px;z-index:99999;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#e74c3c 0%,#ff6b35 100%);border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 6px 24px rgba(231,76,60,.55);transition:transform .2s,box-shadow .2s}';
    CSS += '.lc-btn:hover{transform:scale(1.1);box-shadow:0 8px 32px rgba(231,76,60,.7)}';
    CSS += '.lc-btn i{color:#fff;font-size:1.35rem;pointer-events:none}';
    CSS += '.lc-btn .lc-label{color:#fff;font-size:.58rem;font-weight:800;letter-spacing:.12em;line-height:1;pointer-events:none}';
    CSS += '.lc-btn::before{content:"";position:absolute;inset:-4px;border-radius:50%;background:rgba(231,76,60,.35);animation:lc-ping 1.6s cubic-bezier(0,0,.2,1) infinite;z-index:-1}';
    CSS += '@keyframes lc-ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.5);opacity:0}}';
    CSS += '.lc-dot-new{position:absolute;top:2px;right:2px;width:14px;height:14px;background:#2ecc71;border:2px solid #fff;border-radius:50%;display:none}';
    CSS += 'body.lc-active .chat-widget-btn,body.lc-active .ck-whatsapp-fab,body.lc-active .chat-panel-wrap.open{display:none !important}';
    CSS += '.lc-panel{position:fixed;bottom:28px;left:28px;z-index:99998;width:420px;max-width:calc(100vw - 32px);height:min(640px,calc(100vh - 80px));background:#fff;border-radius:18px;box-shadow:0 16px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom left;transform:scale(.88) translateY(16px);opacity:0;pointer-events:none;transition:transform .28s cubic-bezier(.34,1.5,.64,1),opacity .22s ease}';
    CSS += '.lc-panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}';
    CSS += '.lc-head{background:linear-gradient(135deg,#e74c3c 0%,#ff6b35 100%);padding:1.05rem 1.2rem;color:#fff;display:flex;align-items:center;gap:.7rem;flex-shrink:0}';
    CSS += '.lc-avatar{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0}';
    CSS += '.lc-info{flex:1;min-width:0}';
    CSS += '.lc-title{font-weight:800;font-size:1.02rem;display:flex;align-items:center;gap:.45rem}';
    CSS += '.lc-pill{background:#fff;color:#e74c3c;padding:1px 8px;border-radius:999px;font-size:.62rem;font-weight:800;letter-spacing:.12em}';
    CSS += '.lc-status{font-size:.8rem;opacity:.92;margin-top:2px}';
    CSS += '.lc-dot{display:inline-block;width:8px;height:8px;background:#2ecc71;border-radius:50%;margin-right:5px;box-shadow:0 0 0 0 rgba(46,204,113,.7);animation:lc-pulse 1.6s infinite}';
    CSS += '@keyframes lc-pulse{0%{box-shadow:0 0 0 0 rgba(46,204,113,.7)}70%{box-shadow:0 0 0 8px rgba(46,204,113,0)}100%{box-shadow:0 0 0 0 rgba(46,204,113,0)}}';
    CSS += '.lc-close{background:rgba(255,255,255,.22);border:0;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}';
    CSS += '.lc-close:hover{background:rgba(255,255,255,.36)}';
    CSS += '.lc-msgs{flex:1 1 0;height:0;overflow-y:auto;padding:1.2rem 1.1rem;display:flex;flex-direction:column;gap:.85rem;background:#fff5f1;scroll-behavior:smooth}';
    CSS += '.lc-msgs::-webkit-scrollbar{width:5px}';
    CSS += '.lc-msgs::-webkit-scrollbar-thumb{background:#e3c5b9;border-radius:10px}';
    CSS += '.lc-bubble{max-width:82%;padding:.7rem 1rem;border-radius:14px;font-size:.94rem;line-height:1.55;word-break:break-word}';
    CSS += '.lc-bubble.them{background:#fff;color:#2c3e50;border-radius:4px 14px 14px 14px;box-shadow:0 2px 6px rgba(0,0,0,.07);align-self:flex-start}';
    CSS += '.lc-bubble.them .lc-sender{font-size:.72rem;font-weight:700;color:#e74c3c;margin-bottom:2px}';
    CSS += '.lc-bubble.me{background:linear-gradient(135deg,#e74c3c,#ff6b35);color:#fff;border-radius:14px 14px 4px 14px;align-self:flex-end;box-shadow:0 2px 6px rgba(231,76,60,.32)}';
    CSS += '.lc-bubble.system{background:rgba(0,0,0,.04);color:#5a6877;font-size:.82rem;align-self:center;border-radius:999px;padding:.35rem .85rem}';
    CSS += '.lc-input-bar{display:flex;gap:.55rem;padding:.85rem 1rem;background:#fff;border-top:1px solid #f3dcd3;flex-shrink:0}';
    CSS += '.lc-input{flex:1;border:1.5px solid #f0d4c8;border-radius:24px;padding:.65rem 1rem;font:inherit;font-size:.94rem;outline:none;background:#fffaf7}';
    CSS += '.lc-input:focus{border-color:#e74c3c;background:#fff}';
    CSS += '.lc-send{width:44px;height:44px;border:0;border-radius:50%;background:linear-gradient(135deg,#e74c3c,#ff6b35);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.95rem;box-shadow:0 2px 8px rgba(231,76,60,.3)}';
    CSS += '.lc-send:hover:not(:disabled){transform:scale(1.08)}';
    CSS += '.lc-send:disabled{opacity:.55;cursor:not-allowed}';
    CSS += '@media (max-width:520px){.lc-panel{width:calc(100vw - 16px);left:8px;bottom:18px;height:min(85vh,calc(100vh - 40px))}.lc-btn{bottom:18px;left:16px}}';

    var styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    /* Floating button */
    var btn = document.createElement('button');
    btn.className = 'lc-btn';
    btn.id = 'lcBtn';
    btn.title = 'Live chat with our team';
    btn.innerHTML = '<i class="fas fa-comment-dots"></i><span class="lc-label">LIVE</span><span class="lc-dot-new" id="lcDotNew"></span>';
    document.body.appendChild(btn);

    /* Panel */
    var panel = document.createElement('div');
    panel.className = 'lc-panel';
    panel.id = 'lcPanel';
    panel.innerHTML =
        '<div class="lc-head">' +
            '<div class="lc-avatar"><i class="fas fa-headset"></i></div>' +
            '<div class="lc-info">' +
                '<div class="lc-title">Live chat <span class="lc-pill">LIVE</span></div>' +
                '<div class="lc-status"><span class="lc-dot"></span>Talk to a real person</div>' +
            '</div>' +
            '<button class="lc-close" id="lcClose" aria-label="Close"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="lc-msgs" id="lcMsgs"></div>' +
        '<div class="lc-input-bar">' +
            '<input class="lc-input" id="lcInput" type="text" placeholder="Type your message..." maxlength="500" autocomplete="off">' +
            '<button class="lc-send" id="lcSend" title="Send"><i class="fas fa-paper-plane"></i></button>' +
        '</div>';
    document.body.appendChild(panel);

    var msgsEl  = document.getElementById('lcMsgs');
    var input   = document.getElementById('lcInput');
    var sendBtn = document.getElementById('lcSend');
    var newDot  = document.getElementById('lcDotNew');

    var isOpen = false, isBusy = false, opened = false;

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function addBubble(role, text, senderName) {
        var d = document.createElement('div');
        if (role === 'me') {
            d.className = 'lc-bubble me';
            d.textContent = text;
        } else if (role === 'system') {
            d.className = 'lc-bubble system';
            d.textContent = text;
        } else {
            d.className = 'lc-bubble them';
            var html = '';
            if (senderName) html += '<div class="lc-sender">' + escHtml(senderName) + '</div>';
            html += escHtml(text).replace(/\n/g, '<br>');
            d.innerHTML = html;
        }
        msgsEl.appendChild(d);
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    /* Firestore wiring (lazy) */
    var fbState = { ready: false, fb: null, unsubMsgs: null, msgIds: new Set(), seeded: false };
    async function ensureFb() {
        if (fbState.ready) return fbState.fb;
        if (!window.__firebaseReady) return null;
        try {
            var fb = await window.__firebaseReady;
            fbState.fb = fb;
            fbState.ready = true;
            subscribe();
            return fb;
        } catch (err) { console.warn('[live-chat] firebase init failed:', err); return null; }
    }

    function subscribe() {
        if (!fbState.fb || fbState.unsubMsgs) return;
        var fb = fbState.fb;
        try {
            var ref = fb.firestore.query(
                fb.firestore.collection(fb.db, 'chats', sessionId, 'messages'),
                fb.firestore.orderBy('createdAt', 'asc')
            );
            fbState.unsubMsgs = fb.firestore.onSnapshot(ref, function (snap) {
                snap.docChanges().forEach(function (ch) {
                    if (ch.type !== 'added') return;
                    var d = ch.doc.data() || {};
                    var id = ch.doc.id;
                    if (fbState.msgIds.has(id)) return;
                    fbState.msgIds.add(id);
                    if (d.role === 'admin' || d.role === 'agent' || d.role === 'whatsapp') {
                        addBubble('them', d.text || '', d.senderName || 'Andaman Voyages Team');
                        if (!isOpen && newDot) newDot.style.display = 'block';
                    }
                });
            }, function (err) { console.warn('[live-chat] snapshot failed:', err); });
        } catch (err) { console.warn('[live-chat] subscribe failed:', err); }
    }

    async function persist(role, text) {
        var fb = await ensureFb();
        if (!fb) return;
        try {
            var col = fb.firestore.collection(fb.db, 'chats', sessionId, 'messages');
            await fb.firestore.addDoc(col, {
                role: role,
                text: String(text || ''),
                createdAt: fb.firestore.serverTimestamp()
            });
            var parent = fb.firestore.doc(fb.db, 'chats', sessionId);
            var patch = {
                lastMessage: String(text || '').slice(0, 280),
                lastMessageAt: fb.firestore.serverTimestamp(),
                lastMessageBy: role,
                userAgent: String(navigator.userAgent || '').slice(0, 200),
                page: location.pathname + location.search,
                channel: 'live-chat'
            };
            if (role === 'user') patch.unreadByAdmin = true;
            try {
                var u = (window.UsersStore && window.UsersStore.getCurrentUser && window.UsersStore.getCurrentUser()) || null;
                if (u) {
                    patch.customerEmail = u.email || '';
                    patch.customerName = u.fullName || u.username || '';
                    patch.customerUid = u.uid || u.id || '';
                }
            } catch (_) {}
            await fb.firestore.setDoc(parent, patch, { merge: true });
        } catch (err) { console.warn('[live-chat] persist failed:', err); }
    }

    async function pingWhatsApp(text) {
        try {
            var s = (window.SettingsStore && window.SettingsStore.cached && window.SettingsStore.cached()) || {};
            if (!s.whatsappBridgeEnabled || !s.whatsappBridgeWorkerUrl) return;
            var url = String(s.whatsappBridgeWorkerUrl).replace(/\/+$/, '') + '/notify';
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sessionId, preview: String(text || '').slice(0, 500) })
            }).catch(function () {});
        } catch (_) {}
    }

    function open() {
        if (isOpen) return;
        isOpen = true;
        panel.classList.add('open');
        document.body.classList.add('lc-active');
        if (newDot) newDot.style.display = 'none';
        if (!opened) {
            opened = true;
            addBubble('them',
                'Hi there! 👋 You are now connected to our team. Send us your question and a real human will reply here within ~10 minutes during business hours (Mon-Sat 9 AM - 9 PM IST).',
                'Andaman Voyages Team');
            ensureFb();
        }
        setTimeout(function () { try { input.focus(); } catch (_) {} }, 250);
    }
    function close() {
        if (!isOpen) return;
        isOpen = false;
        panel.classList.remove('open');
        document.body.classList.remove('lc-active');
    }

    async function send(text) {
        text = (text || '').trim();
        if (!text || isBusy) return;
        isBusy = true;
        sendBtn.disabled = true;
        addBubble('me', text);
        input.value = '';
        persist('user', text).catch(function () {});
        pingWhatsApp(text);
        if (!fbState.seeded) {
            fbState.seeded = true;
            setTimeout(function () {
                addBubble('system', 'Message delivered. We will reply here as soon as someone is available.');
            }, 400);
        }
        isBusy = false;
        sendBtn.disabled = false;
        try { input.focus(); } catch (_) {}
    }

    btn.addEventListener('click', function () { isOpen ? close() : open(); });
    document.getElementById('lcClose').addEventListener('click', close);
    sendBtn.addEventListener('click', function () { send(input.value); });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen) close();
    });
})();
