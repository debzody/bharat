/* bookings-page.js — renders /bookings list. Reads Firestore + localStorage.
 *
 * Cancellation flow (user-side, from this page):
 *   1. User clicks "Cancel" on a booking card.
 *   2. We confirm via Toast.confirm (or native confirm fallback).
 *   3. Mark Firestore doc status='cancelled' (if it lives in Firestore).
 *   4. Mirror change in localStorage `bookings` array.
 *   5. Re-render the list immediately so the UI shows "Cancelled".
 *   6. Fire-and-forget BookingEmails.sendBookingCancellation in the
 *      background — no mailto:, no manual email composition.
 */
(function () {
    'use strict';
    var R = '₹';
    var _bookings = [];
    var _activeFilter = 'all';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtINR(n) { var v = Number(n) || 0; return R + v.toLocaleString('en-IN'); }
    function fmtDate(s) {
        if (!s) return '—';
        try {
            var d = (s && s.toDate) ? s.toDate() : new Date(s);
            if (isNaN(d.getTime())) return String(s);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (_) { return String(s); }
    }

    function loadFromLocalStorage(uid) {
        try {
            var arr = JSON.parse(localStorage.getItem('bookings') || '[]');
            if (!Array.isArray(arr)) return [];
            return arr.filter(function (b) {
                if (!b || !uid) return false;
                return b.userId === uid || b.userId === 'guest';
            });
        } catch (_) { return []; }
    }

    async function loadFromFirestore(uid) {
        if (!uid || !window.__firebaseReady) return [];
        try {
            var fb = await window.__firebaseReady;
            var q = fb.firestore.query(
                fb.firestore.collection(fb.db, 'bookings'),
                fb.firestore.where('userId', '==', uid)
            );
            var snap = await fb.firestore.getDocs(q);
            var out = [];
            snap.forEach(function (doc) {
                var data = doc.data() || {};
                data.id = doc.id;
                data._fsId = doc.id;
                out.push(data);
            });
            return out;
        } catch (err) {
            console.warn('[bookings-page] Firestore load failed:', err);
            return [];
        }
    }

    function getCurrentUid() {
        try {
            if (window.__authInstance && window.__authInstance.currentUser) {
                return window.__authInstance.currentUser.uid;
            }
        } catch (_) {}
        try {
            var cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (cu && (cu.uid || cu.id)) return cu.uid || cu.id;
        } catch (_) {}
        return null;
    }

    function mergeBookings(fsArr, lsArr) {
        var byRef = {};
        lsArr.forEach(function (b) {
            var k = b.booking_ref || b.id;
            if (k) byRef[k] = b;
        });
        fsArr.forEach(function (b) {
            var k = b.booking_ref || b.id;
            if (k) {
                var existing = byRef[k] || {};
                byRef[k] = Object.assign({}, existing, b);
            }
        });
        var arr = Object.keys(byRef).map(function (k) { return byRef[k]; });
        arr.sort(function (a, b) {
            var ta = +new Date(a.createdAt || a.travel_date || 0);
            var tb = +new Date(b.createdAt || b.travel_date || 0);
            return tb - ta;
        });
        return arr;
    }

    function applyFilter(bookings, filter) {
        if (!filter || filter === 'all') return bookings.slice();
        var today = new Date(); today.setHours(0, 0, 0, 0);
        return bookings.filter(function (b) {
            var status = String(b.status || 'confirmed').toLowerCase();
            if (filter === 'cancelled') return status === 'cancelled';
            if (status === 'cancelled') return false;
            var dt = b.travel_date || b.travelDate || '';
            if (!dt) return filter === 'upcoming';
            var d = new Date(dt + (String(dt).length === 10 ? 'T00:00:00' : ''));
            if (isNaN(d.getTime())) return filter === 'upcoming';
            if (filter === 'upcoming') return d.getTime() >= today.getTime();
            if (filter === 'completed') return d.getTime() < today.getTime();
            return true;
        });
    }

    function emptyHtml(filter) {
        var msg = (filter === 'cancelled') ? 'No cancelled bookings.'
            : (filter === 'upcoming') ? 'No upcoming trips. Time to plan one!'
            : (filter === 'completed') ? 'No completed trips yet.'
            : 'No bookings yet.';
        return '<div class="bookings-empty-inline"><i class="fas fa-suitcase"></i><h3>' +
            esc(msg) + '</h3><p>Browse our <a href="/#packages">Andaman packages</a> and book your dream trip!</p></div>';
    }

    function bookingCard(b) {
        var ref = b.booking_ref || b.id || '—';
        var pkg = b.package_label || b.package_name || 'Andaman Package';
        var travel = fmtDate(b.travel_date || b.travelDate);
        var adults = (b.adults != null ? b.adults : (b.guests || '—'));
        var children = (b.children != null ? b.children : 0);
        var dur = b.duration || '—';
        var meals = b.meals || '';
        var total = b.total_trip_cost != null ? b.total_trip_cost : (b.price || 0);
        var advance = (b.advance_paid != null ? b.advance_paid : 0);
        var balance = (b.balance_due != null ? b.balance_due : Math.max(0, total - advance));
        var status = String(b.status || 'confirmed').toLowerCase();
        var paymentId = b.payment_id || '';
        var isFree = (Number(advance) <= 0) || /^FREE-/i.test(String(paymentId));
        var statusClass = 'bk-status bk-status-' + status;
        var statusLabel = status === 'cancelled' ? 'Cancelled'
            : status === 'completed' ? 'Completed' : 'Confirmed';

        var travellerLine = esc(adults) + ' adult' + (Number(adults) !== 1 ? 's' : '');
        if (Number(children) > 0) {
            travellerLine += ', ' + esc(children) + ' child' + (Number(children) !== 1 ? 'ren' : '');
        }

        // Use the booking ref as the key for the cancel button — matches
        // the merged record (Firestore doc id OR localStorage id).
        var cancelKey = b.booking_ref || b.id || '';

        var rows = '';
        rows += '<div class="bk-row"><span class="bk-k"><i class="fas fa-hashtag"></i> Ref</span><span class="bk-v">' + esc(ref) + '</span></div>';
        rows += '<div class="bk-row"><span class="bk-k"><i class="fas fa-calendar-day"></i> Travel</span><span class="bk-v">' + esc(travel) + '</span></div>';
        rows += '<div class="bk-row"><span class="bk-k"><i class="fas fa-clock"></i> Duration</span><span class="bk-v">' + esc(dur) + '</span></div>';
        rows += '<div class="bk-row"><span class="bk-k"><i class="fas fa-users"></i> Travellers</span><span class="bk-v">' + travellerLine + '</span></div>';
        if (meals) rows += '<div class="bk-row"><span class="bk-k"><i class="fas fa-utensils"></i> Meals</span><span class="bk-v">' + esc(meals) + '</span></div>';
        rows += '<hr class="bk-sep">';
        rows += '<div class="bk-row"><span class="bk-k">Total Trip Cost</span><span class="bk-v"><strong>' + fmtINR(total) + '</strong></span></div>';
        if (isFree) {
            rows += '<div class="bk-row" style="color:#0a5a68;"><span class="bk-k"><i class="fas fa-gift"></i> Advance</span><span class="bk-v"><strong>FREE</strong></span></div>';
        } else {
            rows += '<div class="bk-row" style="color:#0a5a68;"><span class="bk-k">Advance Paid</span><span class="bk-v"><strong>' + fmtINR(advance) + '</strong></span></div>';
        }
        rows += '<div class="bk-row" style="color:#a04000;"><span class="bk-k">Balance on travel</span><span class="bk-v"><strong>' + fmtINR(balance) + '</strong></span></div>';
        if (paymentId) {
            rows += '<div class="bk-row" style="font-size:.78rem;color:#7f8c8d;"><span class="bk-k"><i class="fas fa-receipt"></i> ' + (isFree ? 'Reference' : 'Payment ID') + '</span><span class="bk-v">' + esc(paymentId) + '</span></div>';
        }

        var foot = '';
        if (status !== 'cancelled') {
            foot = '<div class="bk-foot">' +
                '<button type="button" class="bk-action bk-action-cancel" data-cancel-ref="' + esc(cancelKey) + '">' +
                    '<i class="fas fa-times-circle"></i> Cancel' +
                '</button>' +
                '<a href="tel:+918880195191" class="bk-action"><i class="fas fa-phone-alt"></i> Help</a>' +
            '</div>';
        } else if (b.cancelledAt) {
            foot = '<div class="bk-foot" style="font-size:.78rem;color:#7f8c8d;">' +
                '<i class="fas fa-info-circle"></i> Cancelled on ' + esc(fmtDate(b.cancelledAt)) +
            '</div>';
        }

        return '<div class="bk-card bk-card-' + esc(status) + '">' +
            '<div class="bk-head">' +
                '<div class="bk-pkg"><i class="fas fa-suitcase-rolling"></i> <strong>' + esc(pkg) + '</strong></div>' +
                '<span class="' + statusClass + '">' + esc(statusLabel) + '</span>' +
            '</div>' +
            '<div class="bk-body">' + rows + '</div>' +
            foot +
        '</div>';
    }

    // ── Cancellation: update Firestore + localStorage, then send mail in background ──
    async function updateFirestoreCancelled(booking) {
        if (!window.__firebaseReady) return false;
        try {
            var fb = await window.__firebaseReady;
            // Firestore doc id is stored on _fsId (set during load). Fall
            // back to id only if it looks like a Firestore-style id.
            var docId = booking._fsId || booking.id;
            if (!docId) return false;
            var ref = fb.firestore.doc(fb.db, 'bookings', String(docId));
            await fb.firestore.updateDoc(ref, {
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
                cancelledBy: 'customer'
            });
            return true;
        } catch (err) {
            console.warn('[bookings-page] Firestore cancel update failed:', err);
            return false;
        }
    }

    function updateLocalStorageCancelled(booking) {
        try {
            var arr = JSON.parse(localStorage.getItem('bookings') || '[]');
            if (!Array.isArray(arr)) return;
            var key = booking.booking_ref || booking.id;
            var changed = false;
            for (var i = 0; i < arr.length; i++) {
                var b = arr[i];
                if (!b) continue;
                if ((b.booking_ref && key && b.booking_ref === key) ||
                    (b.id && key && String(b.id) === String(key))) {
                    b.status = 'cancelled';
                    b.cancelledAt = new Date().toISOString();
                    b.cancelledBy = 'customer';
                    changed = true;
                }
            }
            if (changed) localStorage.setItem('bookings', JSON.stringify(arr));
        } catch (err) {
            console.warn('[bookings-page] localStorage cancel update failed:', err);
        }
    }

    function findBookingByKey(key) {
        if (!key) return null;
        for (var i = 0; i < _bookings.length; i++) {
            var b = _bookings[i];
            if (!b) continue;
            if ((b.booking_ref && b.booking_ref === key) ||
                (b.id && String(b.id) === String(key))) {
                return b;
            }
        }
        return null;
    }

    function showToast(kind, msg) {
        try {
            if (window.Toast && window.Toast[kind]) {
                window.Toast[kind](msg);
                return;
            }
        } catch (_) {}
        console.log('[bookings-page]', kind, msg);
    }

    function confirmCancel(onYes) {
        var msg = 'Cancel this booking?\n\nWe will mark it as cancelled and our team will reach out within 1–2 working days regarding any applicable refund.';
        try {
            if (window.Toast && typeof window.Toast.confirm === 'function') {
                window.Toast.confirm(msg, {
                    onYes: onYes,
                    onNo: function () {}
                });
                return;
            }
        } catch (_) {}
        if (window.confirm(msg)) onYes();
    }

    async function handleCancelClick(key, btn) {
        var booking = findBookingByKey(key);
        if (!booking) {
            showToast('error', 'Booking not found.');
            return;
        }
        if (String(booking.status || '').toLowerCase() === 'cancelled') {
            showToast('info', 'Already cancelled.');
            return;
        }

        // Disable button immediately to prevent double-clicks
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking…';
        }

        // ── Block cancel if Razorpay payment is AUTHORIZED (not captured) ──
        // An AUTHORIZED payment has only a card hold; money hasn't moved.
        // Razorpay rejects refunds on uncaptured payments, so we must not
        // allow the booking to be cancelled in this state. The card hold
        // will expire automatically; the admin needs to capture or void it
        // via the Razorpay Dashboard first.
        var isRzp = booking.payment_id && /^pay_/.test(String(booking.payment_id || '')) &&
                    !/^FREE-/i.test(String(booking.payment_id || ''));
        if (isRzp && window.REFUND_WORKER_URL) {
            try {
                var statusRes = await fetch(window.REFUND_WORKER_URL.replace(/\/+$/, '') +
                    '/payment-status/' + encodeURIComponent(booking.payment_id));
                if (statusRes.ok) {
                    var statusData = await statusRes.json();
                    if (statusData && String(statusData.status || '').toLowerCase() === 'authorized') {
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fas fa-times-circle"></i> Cancel';
                        }
                        showToast('error',
                            'Cannot cancel yet — your payment is still being processed (AUTHORIZED). ' +
                            'Please contact us at +91 88801 95191 or wait a few minutes and try again.'
                        );
                        return;
                    }
                }
            } catch (_) {
                // If live check fails, allow the cancel to proceed —
                // better to let the customer cancel than to block them
                // on a network error.
            }
        }

        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling…';
        }

        // 1. Update Firestore (authoritative store)
        var fsOk = await updateFirestoreCancelled(booking);

        // 2. Mirror in localStorage so /bookings keeps showing it cancelled
        updateLocalStorageCancelled(booking);

        // 3. Update the in-memory record + UI immediately
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
        booking.cancelledBy = 'customer';
        render();

        // 4. Fire-and-forget cancellation email — runs in background, no popup
        if (window.BookingEmails && window.BookingEmails.sendBookingCancellation) {
            window.BookingEmails.sendBookingCancellation(booking, {
                cancelledBy: 'customer (self-service from /bookings)',
                reason: 'Cancelled by customer from My Bookings page'
            }).then(function (sent) {
                if (sent) {
                    console.log('[bookings-page] Cancellation email queued for', booking.booking_ref || booking.id);
                } else {
                    console.warn('[bookings-page] Cancellation email NOT sent — see earlier console warnings.');
                }
            }).catch(function (err) {
                console.warn('[bookings-page] Cancellation email error:', err);
            });
        } else {
            console.warn('[bookings-page] BookingEmails helper not loaded — cancellation email skipped.');
        }

        // 5. Auto-process refund (best-effort, runs in background).
        //    Skips silently for FREE bookings, 0–7 day no-refund slabs,
        //    or when REFUND_WORKER_URL isn't configured. Only logged-in
        //    admins can actually trigger Razorpay refunds (the Worker
        //    enforces this); for customer self-service the refund
        //    request is parked for admin approval — they get the
        //    cancellation email and follow up manually.
        var refundMsg = '';
        if (window.Refund && window.Refund.processRefund) {
            try {
                var refund = await window.Refund.processRefund(booking, {
                    reason: 'Customer cancellation from /bookings'
                });
                if (refund && refund.ok && !refund.skipped) {
                    await window.Refund.saveRefundToBooking(booking, refund);
                    window.Refund.logRefund(booking, refund, 'customer-self-service');
                    refundMsg = ' ₹' + Number(refund.amount).toLocaleString('en-IN') +
                                ' refund ' + (refund.status === 'processed' ? 'processed' : 'initiated') +
                                ' to your original payment method (3–5 working days).';
                    render();   // re-render so the card shows refund status
                } else if (refund && refund.skipped) {
                    console.log('[bookings-page] Refund skipped:', refund.reason);
                } else if (refund && !refund.ok) {
                    // Most common: customer is not an admin → Worker
                    // returns 403. That's fine; admin will refund manually
                    // from /dashboard. Just log it.
                    console.log('[bookings-page] Refund deferred to admin:', refund.error);
                }
            } catch (err) {
                console.warn('[bookings-page] Refund call threw:', err);
            }
        }

        // 6. Notify user
        if (fsOk) {
            showToast('success', 'Booking cancelled.' + (refundMsg || ' Our team will contact you shortly regarding refunds.'));
        } else {
            showToast('warning', 'Cancellation marked locally. If you do not hear from us in 1–2 days, please call +91 88801 95191.');
        }
    }

    function wireCancelButtons() {
        var host = document.getElementById('bookingsContainer');
        if (!host) return;
        if (host.__cancelDelegated) return;
        host.__cancelDelegated = true;
        host.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest && e.target.closest('.bk-action-cancel');
            if (!btn || !host.contains(btn)) return;
            e.preventDefault();
            var key = btn.getAttribute('data-cancel-ref') || '';
            if (!key) return;
            confirmCancel(function () {
                handleCancelClick(key, btn);
            });
        });
    }

    function render() {
        var host = document.getElementById('bookingsContainer');
        if (!host) return;
        var filtered = applyFilter(_bookings, _activeFilter);
        if (!filtered.length) {
            host.innerHTML = emptyHtml(_activeFilter);
            return;
        }
        host.innerHTML = filtered.map(bookingCard).join('');
        wireCancelButtons();
    }

    async function loadAndRender() {
        var uid = getCurrentUid();
        var host = document.getElementById('bookingsContainer');
        if (host) {
            host.innerHTML = '<div class="bookings-empty-inline" style="padding:2rem;">' +
                '<i class="fas fa-spinner fa-spin"></i>' +
                '<h3 style="margin-top:.5rem;">Loading your bookings…</h3>' +
                '</div>';
        }
        var ls = loadFromLocalStorage(uid);
        var fs = await loadFromFirestore(uid);
        _bookings = mergeBookings(fs, ls);
        render();
    }

    window.loadAndRenderUserBookings = loadAndRender;
    window.renderBookings = function (filter) {
        _activeFilter = filter || 'all';
        render();
    };
})();
