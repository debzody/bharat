# /customize Page — Email Send Setup

The `/customize` page sends enquiries directly from the browser using **EmailJS** — no server / no Firebase Cloud Functions / no Firebase Blaze plan required. Free tier: **200 emails/month**, more than enough for enquiries.

The page tries 3 senders in order:

1. **EmailJS**  (preferred — once you fill in the 3 IDs in `customize.html`)
2. **Firestore `mail/{ref}`** (only used if you've installed the Firebase "Trigger Email" extension)
3. **`mailto:`** (last-resort fallback that opens the user's email client)

So even before you set anything up, the page works (via mailto). After 5 minutes of EmailJS setup, it sends silently in the background.

---

## Quick setup — EmailJS (recommended, ~5 min)

### 1. Create an EmailJS account

Go to **https://www.emailjs.com/** and sign up (free).

### 2. Add your email service

In the EmailJS dashboard:
- **Email Services** → **Add New Service** → pick **Gmail** (or Outlook, custom SMTP, etc.)
- Authorize with the `booking@andamanvoyages.in` Gmail account.
- Copy the **Service ID** (looks like `service_abc123`).

### 3. Create the template

- **Email Templates** → **Create New Template**
- **Subject** field: `{{subject}}`
- **To Email** field: `{{to_email}}`
- **Reply To** field: `{{reply_to}}`
- **CC** field: `{{cc}}`
- **Content** (switch to "Code editor" mode):
  ```html
  {{{message_html}}}
  ```
  (triple braces = unescaped — required so our pretty HTML renders).
  Or, if you prefer plain text, use `{{message_text}}`.
- **Save**, copy the **Template ID** (looks like `template_xyz456`).

### 4. Get your Public Key

- **Account** → **General** (or **API Keys**)
- Copy the **Public Key** (looks like `abCDef123ghIJKlMno`).

### 5. Paste them into `customize.html`

Open `customize.html`, find this block near the top:

```html
<script>
  window.EMAILJS_CONFIG = {
    publicKey:  "",
    serviceId:  "",
    templateId: ""
  };
</script>
```

Fill in the three values, commit & push. Done.

### 6. Test

1. Open https://andamanvoyages.in/customize
2. Log in, fill the form, click **Send Enquiry**
3. The button shows "Sending…", then jumps to the success state — no popup.
4. Check `booking@andamanvoyages.in` — the email should arrive in a few seconds.
5. The user (CC) should also have a copy.

If something goes wrong, check the browser console for an `[customize] EmailJS error:` log line — EmailJS returns descriptive 400/401/403 messages.

---

## Optional — Firebase "Trigger Email" extension (alternate path)

Use this only if you don't want EmailJS. Requires Firebase **Blaze** (pay-as-you-go) plan — Spark won't run extensions.

Install: Firebase Console → Extensions → "Trigger Email from Firestore" → fill in SMTP creds, set "Email documents collection" to `mail`. Then re-publish `firestore.rules` (already updated in this commit). The page will write a doc to `mail/{ref}` and the extension dispatches it.

---

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| User sees "Network issue — opening your email client as a backup" | Neither EmailJS nor Firestore extension is configured | Fill in `EMAILJS_CONFIG` (above). |
| EmailJS returns 400 "service not found" | Wrong Service ID | Re-copy from EmailJS dashboard. |
| EmailJS returns 412 Precondition Failed | Domain not whitelisted | EmailJS → Account → Security → enable "Allow EmailJS API" or whitelist `andamanvoyages.in`. |
| Email lands in spam | Sender domain not verified | Add SPF + DKIM for `andamanvoyages.in` in DNS, or use a verified sender service. |
| Want to remove the user CC | Privacy / volume | In `js/customize.js`, blank the `cc:` field in `sendViaEmailJS`. |