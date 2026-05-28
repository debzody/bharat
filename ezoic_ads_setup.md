# Ezoic Ads — Setup Guide

This site uses **Ezoic** as the display-ad layer (auto-rotating AdSense / Media.net / 9 other networks per visitor for max RPM). This doc tracks what's already wired up and what you still need to do in the Ezoic dashboard.

---

## ✅ Step 1 — Header scripts (DONE — committed)

Privacy + Ezoic header scripts are loaded at the very top of `<head>` on **every public page**:

| Page | Status |
|------|--------|
| `index.html` | ✅ |
| `about.html` | ✅ |
| `cabs.html` | ✅ |
| `flights.html` | ✅ |
| `gallery.html` | ✅ |
| `package.html` | ✅ |
| `terms.html` | ✅ |
| `privacy.html` | ✅ |

**Skipped on purpose** (admin / private — Ezoic should NOT fire here):
- `dashboard.html`, `bookings.html`, `checkout.html`, `profile.html`, `settings.html`
- `customize.html`, `migrate.html`
- `AgodaPartnerVerification.htm`, `googlea56f1cf68bec5877.html` (verification stubs)

The exact block in each public page:

```html
<!-- ── EzoicAds: privacy + header (must load BEFORE any other ad/analytics) ── -->
<script data-cfasync="false" src="https://cmp.gatekeeperconsent.com/min.js"></script>
<script data-cfasync="false" src="https://the.gatekeeperconsent.com/cmp.min.js"></script>
<script async src="//www.ezojs.com/ezoic/sa.min.js"></script>
<script>
    window.ezstandalone = window.ezstandalone || {};
    ezstandalone.cmd = ezstandalone.cmd || [];
</script>
<script src="//ezoicanalytics.com/analytics.js"></script>
```

`data-cfasync="false"` is essential — the site is on Cloudflare and without that attribute Rocket Loader would re-order the privacy scripts and break GDPR/CCPA consent.

---

## 🛠 Step 2 — `ads.txt` auto-refresh (workflow ready, ONE thing to configure)

The site is on **GitHub Pages** (static), so the `.htaccess` / nginx / PHP redirect approaches Ezoic suggests are not available. We use a different — actually better — approach:

> A scheduled **GitHub Action** (`.github/workflows/refresh-ads-txt.yml`) fetches the latest manifest from Ezoic's `srv.adstxtmanager.com` URL **every day** and commits the updated `/ads.txt` to `main`. Always live, always fresh, zero infra cost.

### One-time configuration (do this once, takes 2 minutes)

1. **Get your Ezoic ads.txt URL**
   - Open the Ezoic dashboard → **Monetization → Ads.txt Manager**.
   - Copy the URL Ezoic shows you. It looks like:
     ```
     https://srv.adstxtmanager.com/<YOUR_NUMERIC_ID>/andamanvoyages.in
     ```
   - **Important:** the docs use `19390` as a placeholder — your real ID will be different.

2. **Add it as a GitHub repo variable**
   - Open https://github.com/debzody/bharat/settings/variables/actions
   - Click **"New repository variable"**.
   - Name: `EZOIC_ADSTXT_URL`
   - Value: paste the URL from step 1.
   - Click **Add variable**. Done.
   - (Use **Variables**, not **Secrets** — it's a public URL.)

3. **Trigger the first refresh manually**
   - Open https://github.com/debzody/bharat/actions
   - Click **"Refresh ads.txt"** in the left sidebar.
   - Click **"Run workflow"** → branch `main` → **Run workflow**.
   - Wait ~30 seconds. The action will fetch the manifest, prepend your AdSense line, and commit to `main`.

4. **Verify**
   - Open https://andamanvoyages.in/ads.txt — you should now see ~50+ lines starting with the Andaman Voyages header comment, then the AdSense line, then the Ezoic-managed sellers.

After that, the workflow runs **daily at 03:30 UTC (≈ 09:00 IST)** automatically. If Ezoic adds or removes a seller, your `/ads.txt` is updated within 24 hours.

### Manual refresh

Anytime you want a fresh fetch:
- Go to **Actions → Refresh ads.txt → Run workflow**.

### What if the variable isn't set yet?

The workflow gracefully no-ops with a warning — it won't fail or break anything until you set `EZOIC_ADSTXT_URL`.

---

## ⏭ Step 3 — Ad placements (next, after Step 2 is verified)

Two paths:

### A) Auto-Ads (recommended — start here)

In the Ezoic dashboard → **EzoicAds → Ad Settings → Auto-Insert Ads**, toggle ON. Ezoic uses ML to decide ad placement based on layout analysis of each page.

- Pros: zero code on our side, Ezoic optimizes RPM automatically.
- Cons: less granular control; sometimes places ads where they hurt UX.

### B) Manual placeholders (more control)

Drop `<div id="ezoic-pub-ad-placeholder-101"></div>` (or whatever IDs Ezoic gives you in their dashboard) where you want ads to appear. Examples for our site:

- **Between hero and packages grid** on `index.html`
- **Between FAQ entries** on `index.html`
- **Above the inclusions list** on `package.html`
- **Between gallery rows** on `gallery.html`

Ezoic's dashboard generates the exact div IDs — paste them where you want ads.

**Don't place ads inside:**
- Modals (login, register, profile, payment)
- Booking flow / checkout
- Chat widget
- Above-the-fold hero (kills LCP / Core Web Vitals)

---

## 🚦 Verification checklist

After Step 1 + Step 2:

- [ ] View source on `https://andamanvoyages.in/` — confirm Ezoic block is at the top of `<head>`.
- [ ] Open https://andamanvoyages.in/ads.txt — confirm full Ezoic manifest is served (50+ lines).
- [ ] DevTools → Network → filter "ezoic" or "gatekeeper" — all 5 scripts return 200.
- [ ] DevTools Console → no errors mentioning `ezstandalone`.
- [ ] Ezoic dashboard → site status shows "Integrated" / green check.

---

## 💰 Realistic revenue expectations

For a site with 5 K visits/mo:
- **Auto-Ads only** ≈ ₹1,500-4,000/mo (low CPM until traffic grows).
- **+ Strategic affiliate widgets** (Booking.com, Travelpayouts hotels, GetYourGuide) ≈ ₹3,000-15,000/mo. *Most travel-site revenue comes from affiliates, not display ads.*
- **+ Newsletter sponsorships** (once you have 1K+ subscribers) ≈ ₹2,000-10,000/mo.

Tip: Ezoic itself usually pays **2-3× what AdSense alone would** because it auto-tests multiple networks per visitor and picks the highest bidder.

---

## 🆘 Troubleshooting

### "Empty manifest fetched" workflow error
- The `EZOIC_ADSTXT_URL` value is wrong. Double-check the publisher ID in the Ezoic dashboard.

### Ezoic dashboard shows "site not detected"
- Ezoic crawls your site to verify the header scripts are present. After the first deploy, wait ~6-24 h; their crawler has a backlog.
- If still red after 48 h: check that you're not blocking `*.ezojs.com` or `*.gatekeeperconsent.com` in Cloudflare WAF / firewall rules.

### Ads not appearing despite green status
- Auto-Ads needs ~24-72 h after enabling to start serving.
- Try in incognito (your AdSense / ad-blocker may be filtering Ezoic).
- Some India-specific advertisers fill slowly; wait a few days for inventory to ramp.

### Refunds / cancel-booking flow broken after Ezoic ads enabled
- Should never happen — `dashboard.html` and `bookings.html` are excluded from Ezoic. If somehow Ezoic auto-detects them, blacklist them in **Ezoic Site Settings → Page exclusions**.

---

## Files of interest

| File | Purpose |
|------|---------|
| `index.html` + 7 other public pages | Header scripts injected at top of `<head>` |
| `ads.txt` | Auto-refreshed daily by the workflow |
| `.github/workflows/refresh-ads-txt.yml` | The daily fetch + commit workflow |
| `ezoic_ads_setup.md` | This file — keeps the setup story in one place |