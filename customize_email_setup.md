# /customize Page — Direct Email Send Setup

The `/customize` page now sends enquiries **directly** (no `mailto:` popup) by writing a document to a Firestore collection that the **Firebase "Trigger Email" extension** watches and dispatches via SMTP.

## What the page does on click

1. Validates the form.
2. Writes an audit copy to `customEnquiries/{ref}`.
3. Writes a mail doc to `mail/{ref}` in this shape:
   ```js
   {
     to: ["booking@andamanvoyages.in"],
     cc: ["the-user-who-submitted@example.com"],
     replyTo: "the-user-who-submitted@example.com",
     message: { subject, text, html },
     meta: { ref, type: "customEnquiry", userUid, createdAt }
   }
   ```
4. The **Trigger Email** extension picks up the new doc, sends the email through your configured SMTP server, and stamps `delivery: { state: "SUCCESS", ... }` on the same doc.
5. The page shows the success state to the user.

If Firestore is unreachable (offline / blocked), the page falls back to a `mailto:` link as a backup.

## One-time Firebase setup

### 1. Install the "Trigger Email" extension

In the Firebase console:

```
Extensions → Browse the Hub → "Trigger Email from Firestore" (by Firebase) → Install in project
```

Configuration values to use:

| Field | Value |
|---|---|
| **Authentication Type** | `UsernamePassword` |
| **SMTP connection URI** | e.g. `smtps://booking%40andamanvoyages.in@smtp.gmail.com:465` (URL-encode the `@` as `%40`) |
| **SMTP password** | A Gmail **App Password** (not the account password) — generate at https://myaccount.google.com/apppasswords |
| **Email documents collection** | `mail` |
| **Default `from` address** | `Andaman Voyages <booking@andamanvoyages.in>` |
| **Default `reply-to` address** | leave blank — the page sets it per-enquiry |
| **Users collection** *(optional)* | leave blank |

> **Note on Gmail SMTP:** Gmail's free tier allows ~500 emails/day per account. For higher volume, switch to SendGrid (`smtps://apikey:YOUR_KEY@smtp.sendgrid.net:465`), Mailgun, or Amazon SES.

### 2. Update Firestore rules

Already done in this commit — see `firestore.rules`. Re-deploy them:

```
Firebase Console → Firestore Database → Rules → Publish
```

The new rules allow any signed-in user to **create** docs in `mail` and `customEnquiries`, but only admins can read/update/delete other users' enquiries.

### 3. Verify

1. Open https://andamanvoyages.in/customize while signed in.
2. Fill the form, click **Send Enquiry**.
3. In the Firebase console, open Firestore → `mail` → the new doc. After ~30 s the doc should have `delivery.state: "SUCCESS"`.
4. Check `booking@andamanvoyages.in` — the email should be there.
5. The user should also have a CC copy in their inbox.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| User sees toast: "Network issue — opening your email client as a backup" | Firestore write failed (rules or offline) | Verify rules deployed; check browser console for the exact error. |
| Mail doc has `delivery.state: "ERROR"` | SMTP credentials wrong | Re-enter Gmail App Password in extension config. |
| Email goes to spam | Sender domain not verified | Set up SPF + DKIM for `andamanvoyages.in` in your DNS. |
| Want to disable user CC | privacy / volume | In `js/customize.js`, remove the `cc` line in `sendViaFirestoreMail`. |

## Local development (no SMTP)

If you're testing locally without the extension installed, the page will still write to `mail/{ref}` — those docs just won't be delivered. The fallback `mailto:` won't trigger as long as the write succeeds.