/* ── brevo.js — minimal Brevo v3 transactional-email send ──── */

export async function sendBrevoEmail(env, opts) {
    if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY secret not set');
    const fromEmail = opts.fromEmail || env.REPORT_FROM_EMAIL || env.FROM_EMAIL;
    const fromName  = opts.fromName  || env.REPORT_FROM_NAME  || env.FROM_NAME || 'Andaman Voyages';
    if (!fromEmail) throw new Error('Brevo: from email not configured');
    if (!opts.to)   throw new Error('Brevo: to email is required');

    const body = {
        sender:   { email: fromEmail, name: fromName },
        to:       [{ email: opts.to, name: opts.toName || '' }],
        subject:  String(opts.subject || '(no subject)'),
        htmlContent: String(opts.html || ''),
        textContent: String(opts.text || stripHtml(opts.html || ''))
    };
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Brevo send failed: ' + res.status + ' ' + txt);
    }
    return res.json();
}

function stripHtml(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}