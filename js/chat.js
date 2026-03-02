// ── AI Chat Widget for Bharat Tours & Travels ─────────────────
(function () {
    'use strict';

    // ── Inject CSS ─────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
    /* Chat Widget */
    .chat-widget {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        font-family: 'Segoe UI', Arial, sans-serif;
    }
    .chat-toggle-btn {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1abc9c, #16a085);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(26,188,156,0.5);
        transition: transform 0.2s, box-shadow 0.2s;
        position: relative;
    }
    .chat-toggle-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(26,188,156,0.6); }
    .chat-toggle-btn i { color: #fff; font-size: 1.5rem; }
    .chat-notif-dot {
        position: absolute;
        top: 4px; right: 4px;
        width: 14px; height: 14px;
        background: #e74c3c;
        border-radius: 50%;
        border: 2px solid #fff;
        animation: pulse-dot 1.5s infinite;
        display: none;
    }
    @keyframes pulse-dot {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.3); }
    }

    /* Chat Panel */
    .chat-panel {
        position: absolute;
        bottom: 76px;
        right: 0;
        width: 420px;
        height: 620px;
        background: #fff;
        border-radius: 18px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.85) translateY(20px);
        transform-origin: bottom right;
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;
    }
    .chat-panel.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
    }

    /* Header */
    .chat-header {
        background: linear-gradient(135deg, #1abc9c, #16a085);
        padding: 1.1rem 1.25rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
    }
    .chat-avatar {
        width: 46px; height: 46px;
        border-radius: 50%;
        background: rgba(255,255,255,0.25);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .chat-avatar i { color: #fff; font-size: 1.35rem; }
    .chat-agent-info { flex: 1; }
    .chat-agent-name { color: #fff; font-weight: 700; font-size: 1.05rem; }
    .chat-agent-status { color: rgba(255,255,255,0.82); font-size: 0.82rem; margin-top: 2px; }
    .chat-close-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        width: 30px; height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 0.9rem;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
    }
    .chat-close-btn:hover { background: rgba(255,255,255,0.35); }

    /* Messages */
    .chat-messages {
        flex: 1 1 0;
        height: 0;
        overflow-y: auto;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        background: #f7f9fc;
        -webkit-overflow-scrolling: touch;
    }
    .chat-bubble {
        max-width: 82%;
        padding: 0.75rem 1rem;
        border-radius: 14px;
        font-size: 0.95rem;
        line-height: 1.6;
        word-break: break-word;
    }
    .chat-bubble.bot {
        background: #fff;
        color: #333;
        border-radius: 4px 14px 14px 14px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
        align-self: flex-start;
    }
    .chat-bubble.user {
        background: linear-gradient(135deg, #1abc9c, #16a085);
        color: #fff;
        border-radius: 14px 14px 4px 14px;
        align-self: flex-end;
    }
    .chat-bubble.typing {
        background: #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
        align-self: flex-start;
        border-radius: 4px 14px 14px 14px;
        padding: 0.7rem 1rem;
    }
    .typing-dots { display: flex; gap: 4px; align-items: center; }
    .typing-dots span {
        width: 7px; height: 7px;
        background: #aaa;
        border-radius: 50%;
        animation: typing-bounce 1.2s infinite;
    }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing-bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
    }

    /* Quick replies */
    .chat-quick-replies {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.5rem 1.25rem 0.75rem;
        background: #f7f9fc;
    }
    .chat-quick-btn {
        padding: 0.4rem 0.9rem;
        border: 1.5px solid #1abc9c;
        background: #fff;
        color: #1abc9c;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s;
        white-space: nowrap;
    }
    .chat-quick-btn:hover { background: #1abc9c; color: #fff; }

    /* Input */
    .chat-input-area {
        display: flex;
        gap: 0.6rem;
        padding: 0.9rem 1.25rem;
        border-top: 1px solid #eee;
        background: #fff;
        flex-shrink: 0;
    }
    .chat-input {
        flex: 1;
        border: 1.5px solid #e0e0e0;
        border-radius: 24px;
        padding: 0.65rem 1.1rem;
        font-family: inherit;
        font-size: 0.95rem;
        outline: none;
        transition: border-color 0.2s;
        background: #f7f9fc;
    }
    .chat-input:focus { border-color: #1abc9c; background: #fff; }
    .chat-send-btn {
        width: 44px; height: 44px;
        border-radius: 50%;
        background: #1abc9c;
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 0.9rem;
        flex-shrink: 0;
        transition: background 0.2s, transform 0.15s;
    }
    .chat-send-btn:hover { background: #16a085; transform: scale(1.08); }
    .chat-send-btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }

    /* Mobile */
    @media (max-width: 600px) {
        .chat-panel {
            width: calc(100vw - 24px);
            height: 80vh;
            right: -8px;
            bottom: 72px;
        }
        .chat-widget { bottom: 16px; right: 16px; }
    }
    `;
    document.head.appendChild(style);

    // ── Inject HTML ────────────────────────────────────────────
    const widget = document.createElement('div');
    widget.className = 'chat-widget';
    widget.id = 'chatWidget';
    widget.innerHTML = `
        <div class="chat-panel" id="chatPanel">
            <div class="chat-header">
                <div class="chat-avatar"><i class="fas fa-robot"></i></div>
                <div class="chat-agent-info">
                    <div class="chat-agent-name">Andaman AI Guide</div>
                    <div class="chat-agent-status"><span style="color:#a8f0de">●</span> Online · Replies instantly</div>
                </div>
                <button class="chat-close-btn" id="chatCloseBtn" title="Close chat">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="chat-messages" id="chatMessages"></div>
            <div class="chat-quick-replies" id="chatQuickReplies"></div>
            <div class="chat-input-area">
                <input type="text" class="chat-input" id="chatInput" placeholder="Ask about packages, prices…" maxlength="300">
                <button class="chat-send-btn" id="chatSendBtn" title="Send">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
        <button class="chat-toggle-btn" id="chatToggleBtn" title="Chat with us">
            <i class="fas fa-comments" id="chatToggleIcon"></i>
            <span class="chat-notif-dot" id="chatNotifDot"></span>
        </button>
    `;
    document.body.appendChild(widget);

    // ── State ──────────────────────────────────────────────────
    const panel       = document.getElementById('chatPanel');
    const messages    = document.getElementById('chatMessages');
    const input       = document.getElementById('chatInput');
    const sendBtn     = document.getElementById('chatSendBtn');
    const toggleBtn   = document.getElementById('chatToggleBtn');
    const closeBtn    = document.getElementById('chatCloseBtn');
    const toggleIcon  = document.getElementById('chatToggleIcon');
    const notifDot    = document.getElementById('chatNotifDot');
    const quickReplies = document.getElementById('chatQuickReplies');

    let isOpen    = false;
    let isBusy    = false;
    let chatHistory = [];
    let hasOpened = false;

    const QUICK_QUESTIONS = [
        '💰 Package prices',
        '🏖️ Best beaches',
        '🤿 Scuba diving',
        '💑 Honeymoon package',
        '📅 Best time to visit',
        '📞 Contact us'
    ];

    // ── Helpers ────────────────────────────────────────────────
    function openChat() {
        isOpen = true;
        panel.classList.add('open');
        toggleIcon.className = 'fas fa-times';
        notifDot.style.display = 'none';
        if (!hasOpened) {
            hasOpened = true;
            addBotMessage('👋 Hi! I\'m your Andaman AI Guide from **Bharat Tours & Travels**. Ask me about packages, beaches, activities, or prices. How can I help? 🌊');
            showQuickReplies();
        }
        setTimeout(() => input.focus(), 200);
    }

    function closeChat() {
        isOpen = false;
        panel.classList.remove('open');
        toggleIcon.className = 'fas fa-comments';
    }

    function scrollToBottom() {
        messages.scrollTop = messages.scrollHeight;
    }

    function formatText(text) {
        // Convert **bold** to <strong>
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function addBotMessage(text) {
        const el = document.createElement('div');
        el.className = 'chat-bubble bot';
        el.innerHTML = formatText(text);
        messages.appendChild(el);
        scrollToBottom();
        return el;
    }

    function addUserMessage(text) {
        const el = document.createElement('div');
        el.className = 'chat-bubble user';
        el.textContent = text;
        messages.appendChild(el);
        scrollToBottom();
    }

    function showTyping() {
        const el = document.createElement('div');
        el.className = 'chat-bubble typing';
        el.id = 'typingIndicator';
        el.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
        messages.appendChild(el);
        scrollToBottom();
    }

    function removeTyping() {
        const el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    function showQuickReplies() {
        quickReplies.innerHTML = '';
        QUICK_QUESTIONS.forEach(q => {
            const btn = document.createElement('button');
            btn.className = 'chat-quick-btn';
            btn.textContent = q;
            btn.addEventListener('click', () => {
                quickReplies.innerHTML = '';
                sendMessage(q.replace(/^[^\w₹]*/, '').trim());
            });
            quickReplies.appendChild(btn);
        });
    }

    // ── Send Message ───────────────────────────────────────────
    async function sendMessage(text) {
        if (!text || isBusy) return;
        isBusy = true;
        sendBtn.disabled = true;
        quickReplies.innerHTML = '';

        addUserMessage(text);
        input.value = '';
        showTyping();

        chatHistory.push({ role: 'user', text });

        try {
            const res = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: chatHistory.slice(-10) })
            });

            const data = await res.json();
            removeTyping();

            const reply = data.reply || 'Sorry, I couldn\'t get a response. Please try again!';
            addBotMessage(reply);
            chatHistory.push({ role: 'bot', text: reply });

        } catch {
            removeTyping();
            addBotMessage('Oops! Something went wrong. Please check your connection or contact us directly. 😊');
        }

        isBusy = false;
        sendBtn.disabled = false;
        input.focus();
    }

    // ── Event Listeners ────────────────────────────────────────
    toggleBtn.addEventListener('click', () => isOpen ? closeChat() : openChat());
    closeBtn.addEventListener('click', closeChat);

    sendBtn.addEventListener('click', () => sendMessage(input.value.trim()));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input.value.trim());
        }
    });

    // Show notification dot after 3 seconds if not opened
    setTimeout(() => {
        if (!hasOpened) notifDot.style.display = 'block';
    }, 3000);
})();