/* customize.js - powers /customize page (login-gated builder + email enquiry)
   Sends a pre-filled mailto: to booking@andamanvoyages.in. No payment.
*/
(function () {
    'use strict';

    var TARGET_EMAIL = 'booking@andamanvoyages.in';
    var $   = function (s, r) { return (r || document).querySelector(s); };
    var $all= function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    function readUser() {
        try {
            var raw = localStorage.getItem('currentUser');
            var tok = localStorage.getItem('token');
            if (!raw || !tok) return null;
            var u = JSON.parse(raw);
            return (u && (u.uid || u.id)) ? u : null;
        } catch (e) { return null; }
    }
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    /* Login gate */
    function refreshGate() {
        var user = readUser(), gate = $('#czGate'), builder = $('#czBuilder'), success = $('#czSuccess');
        if (!gate || !builder) return;
        if (success && success.style.display && success.style.display !== 'none') return;
        if (user) {
            gate.style.display = 'none';
            builder.style.display = '';
            prefillContact(user);
            updateSummary();
        } else {
            gate.style.display = '';
            builder.style.display = 'none';
        }
    }
    function prefillContact(u) {
        if (!u) return;
        var n = $('#czName');  if (n && !n.value) n.value = u.fullName || u.username || '';
        var e = $('#czEmail'); if (e && !e.value) e.value = u.email || '';
        var p = $('#czPhone'); if (p && !p.value && u.phone) p.value = u.phone;
    }

    /* Chip toggling */
    function wireChips() {
        $all('.cz-chips').forEach(function (group) {
            var single = group.dataset.czSingle === '1';
            group.addEventListener('click', function (e) {
                var chip = e.target.closest('.cz-chip');
                if (!chip) return;
                if (single) {
                    $all('.cz-chip', group).forEach(function (c) { if (c !== chip) c.classList.remove('checked'); });
                    chip.classList.add('checked');
                } else {
                    chip.classList.toggle('checked');
                }
                updateSummary();
            });
        });
    }
    function getChips(g) {
        var grp = document.querySelector('[data-cz-group="' + g + '"]');
        if (!grp) return [];
        return $all('.cz-chip.checked', grp).map(function (c) { return c.dataset.value; });
    }

    /* Activity rows */
    function wireActs() {
        $all('.cz-act input[type="checkbox"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                cb.closest('.cz-act').classList.toggle('checked', cb.checked);
                updateSummary();
            });
        });
    }
    function getActs() {
        return $all('.cz-act input[type="checkbox"]:checked').map(function (cb) { return cb.dataset.name; });
    }

    /* Live summary */
    function pillify(arr) {
        if (!arr || !arr.length) return null;
        return arr.map(function (v) { return '<span class="cz-pill">' + escHtml(v) + '</span>'; }).join('');
    }
    function updateSummary() {
        var adults    = parseInt(($('#czAdults') || {}).value || '2', 10);
        var children  = parseInt(($('#czChildren') || {}).value || '0', 10);
        var start     = ($('#czStart') || {}).value || '';
        var end       = ($('#czEnd') || {}).value || '';
        var islands   = getChips('islands');
        var hotels    = getChips('hotel');
        var vibes     = getChips('vibe');
        var inclusions= getChips('inclusions');
        var acts      = getActs();
        var budget    = ($('#czBudget') || {}).value || '';

        var trav = adults + ' Adult' + (adults !== 1 ? 's' : '');
        if (children > 0) trav += ' + ' + children + ' Child' + (children !== 1 ? 'ren' : '');
        var sumT = $('#sumTravellers'); if (sumT) sumT.textContent = trav;

        var sumDates = $('#sumDates');
        if (sumDates) {
            if (start && end)   { sumDates.textContent = start + ' \u2192 ' + end; sumDates.classList.remove('cz-summary-empty'); }
            else if (start)     { sumDates.textContent = 'From ' + start; sumDates.classList.remove('cz-summary-empty'); }
            else                { sumDates.textContent = '\u2014 pick dates \u2014'; sumDates.classList.add('cz-summary-empty'); }
        }

        function setRow(id, v, empty) {
            var el = document.getElementById(id); if (!el) return;
            if (Array.isArray(v) && v.length)            { el.innerHTML = pillify(v); el.classList.remove('cz-summary-empty'); }
            else if (typeof v === 'string' && v)         { el.textContent = v; el.classList.remove('cz-summary-empty'); }
            else                                          { el.textContent = empty; el.classList.add('cz-summary-empty'); }
        }
        setRow('sumIslands', islands,    '\u2014 none yet \u2014');
        setRow('sumHotel',   hotels,     '\u2014 not chosen \u2014');
        setRow('sumVibe',    vibes,      '\u2014 any \u2014');
        setRow('sumActs',    acts,       '\u2014 none \u2014');
        setRow('sumIncl',    inclusions, '\u2014 defaults \u2014');
        setRow('sumBudget',  budget,     '\u2014 flexible \u2014');
    }
    function wireLiveUpdates() {
        ['czAdults','czChildren','czStart','czEnd','czBudget','czCity','czNotes','czName','czEmail','czPhone','czPreferred'].forEach(function (id) {
            var el = document.getElementById(id); if (!el) return;
            el.addEventListener('change', updateSummary);
            el.addEventListener('input',  updateSummary);
        });
    }

    /* Build payload + email body */
    function buildEnquiry() {
        var u = readUser() || {};
        var ref = 'CUST-' + Date.now().toString().slice(-7) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
        return {
            ref: ref, createdAt: new Date().toISOString(),
            user: { uid: u.uid || u.id || '', email: u.email || '', username: u.username || '' },
            traveller: {
                name:  ($('#czName')  || {}).value || '',
                email: ($('#czEmail') || {}).value || '',
                phone: ($('#czPhone') || {}).value || '',
                preferred: ($('#czPreferred') || {}).value || ''
            },
            trip: {
                start:    ($('#czStart')    || {}).value || '',
                end:      ($('#czEnd')      || {}).value || '',
                adults:   parseInt(($('#czAdults')   || {}).value || '0', 10),
                children: parseInt(($('#czChildren') || {}).value || '0', 10),
                islands: getChips('islands'), hotel: getChips('hotel'),
                vibe: getChips('vibe'), inclusions: getChips('inclusions'),
                activities: getActs(),
                budget: ($('#czBudget') || {}).value || '',
                city:   ($('#czCity')   || {}).value || '',
                notes:  ($('#czNotes')  || {}).value || ''
            }
        };
    }
    function buildEmailBody(d) {
        var L = [];
        L.push('NEW CUSTOM-TRIP ENQUIRY  (' + d.ref + ')');
        L.push('Submitted: ' + d.createdAt);
        L.push('');
        L.push('-- TRAVELLER --');
        L.push('Name:        ' + d.traveller.name);
        L.push('Email:       ' + d.traveller.email);
        L.push('Phone:       ' + d.traveller.phone);
        L.push('Preferred:   ' + d.traveller.preferred);
        L.push('Account:     ' + (d.user.username || '(none)') + ' / ' + (d.user.email || '') + ' (uid ' + (d.user.uid || '?') + ')');
        L.push('');
        L.push('-- TRIP --');
        L.push('Dates:       ' + (d.trip.start || '?') + ' to ' + (d.trip.end || '?'));
        L.push('Travellers:  ' + d.trip.adults + ' adult(s) + ' + d.trip.children + ' child(ren)');
        L.push('Departure:   ' + (d.trip.city || '(not specified)'));
        L.push('Budget:      ' + (d.trip.budget || '(flexible)'));
        L.push('');
        L.push('Islands:     ' + (d.trip.islands.join(', ')    || '(any)'));
        L.push('Hotel:       ' + (d.trip.hotel.join(', ')      || '(not chosen)'));
        L.push('Vibe:        ' + (d.trip.vibe.join(', ')       || '(any)'));
        L.push('Inclusions:  ' + (d.trip.inclusions.join(', ') || '(defaults)'));
        L.push('Activities:  ' + (d.trip.activities.join(', ') || '(none)'));
        L.push('');
        if (d.trip.notes) { L.push('-- NOTES --'); L.push(d.trip.notes); L.push(''); }
        L.push('-- REPLY --');
        L.push('Please send a personalised quote within 2 working hours to:');
        L.push('  Email:    ' + d.traveller.email);
        L.push('  WhatsApp: ' + d.traveller.phone);
        L.push('');
        L.push('Reference: ' + d.ref);
        return L.join('\n');
    }
    function validateForm(d) {
        var errs = [];
        if (!d.traveller.name)  errs.push('Please enter your full name.');
        if (!d.traveller.email) errs.push('Please enter your email.');
        if (!d.traveller.phone) errs.push('Please enter your phone / WhatsApp number.');
        if (!d.trip.start)      errs.push('Please pick a start date.');
        if (!d.trip.islands.length) errs.push('Please pick at least one island.');
        return errs;
    }
    function persistEnquiry(d) {
        try {
            if (window.firebase && firebase.firestore) {
                firebase.firestore().collection('customEnquiries').doc(d.ref).set(d).catch(function () {});
            }
        } catch (e) {}
        try {
            var key = 'customEnquiries';
            var arr = JSON.parse(localStorage.getItem(key) || '[]');
            arr.push(d); localStorage.setItem(key, JSON.stringify(arr.slice(-20)));
        } catch (e) {}
    }
    function toast(msg, type) {
        if (window.Toast && typeof Toast.show === 'function') Toast.show(msg, type || 'success');
        else if (typeof window.alert === 'function') alert(msg);
    }

    function showSuccess(d) {
        var success = document.getElementById('czSuccess');
        var builder = document.getElementById('czBuilder');
        var nameEl  = document.getElementById('czSuccessName');
        var refEl   = document.getElementById('czSuccessRef');
        if (nameEl) nameEl.textContent = (d.traveller.name || '').split(' ')[0] || 'there';
        if (refEl)  refEl.textContent  = d.ref;
        if (builder) builder.style.display = 'none';
        if (success) {
            success.style.display = '';
            try { success.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        }
    }

    function sendEnquiry() {
        if (!readUser()) {
            toast('Please log in to send an enquiry.', 'warning');
            refreshGate();
            return;
        }
        var d = buildEnquiry();
        var errs = validateForm(d);
        if (errs.length) { toast(errs[0], 'warning'); return; }

        persistEnquiry(d);

        var subject = 'Custom Andaman Trip Enquiry - ' + (d.traveller.name || 'Guest') + ' (' + d.ref + ')';
        var body    = buildEmailBody(d);
        var mailto  = 'mailto:' + TARGET_EMAIL +
                      '?subject=' + encodeURIComponent(subject) +
                      '&body='    + encodeURIComponent(body);

        // Open the user's mail client. Use a hidden anchor for best compatibility.
        try {
            var a = document.createElement('a');
            a.href = mailto;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { document.body.removeChild(a); }, 500);
        } catch (e) {
            window.location.href = mailto;
        }

        toast('Enquiry sent! Check your email client.', 'success');
        showSuccess(d);
    }

    /* Login button on the gate */
    function wireGateLogin() {
        var btn = document.getElementById('czGateLoginBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (typeof window.openLogin === 'function') {
                window.openLogin();
            } else {
                window.location.href = '/#login';
            }
        });
    }

    /* Submit button */
    function wireSubmit() {
        var btn = document.getElementById('czSubmitBtn');
        if (btn) btn.addEventListener('click', sendEnquiry);
    }

    /* Re-check auth state when other tabs/auth events fire */
    function wireAuthEvents() {
        window.addEventListener('storage', function (e) {
            if (e.key === 'currentUser' || e.key === 'token') refreshGate();
        });
        window.addEventListener('auth:login',  refreshGate);
        window.addEventListener('auth:logout', refreshGate);
    }

    /* ── Init ───────────────────────────────────────────────── */
    function init() {
        // Today's date as a sensible minimum
        var today = new Date().toISOString().slice(0, 10);
        var s = document.getElementById('czStart'); if (s && !s.min) s.min = today;
        var e = document.getElementById('czEnd');   if (e && !e.min) e.min = today;

        wireChips();
        wireActs();
        wireLiveUpdates();
        wireGateLogin();
        wireSubmit();
        wireAuthEvents();
        refreshGate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
