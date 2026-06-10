/* ── Backfill: per-package `cities` array (corrected stay distribution) ─
 * Investigation note (Oct 2026): the homepage was showing "3N Havelock"
 * for many packages because js/script.js had a heuristic that gave
 * Havelock weight 4 / Neil weight 3 — wrong by the actual brochures.
 *
 * Per real Bharat Transport & Tourism brochures (5N/6D, 6N/7D, 7N/8D
 * Economy/Standard/Deluxe/Premium plus 4N/5D Honeymoon & Royal):
 *
 *   • 5N variants : 2N Port Blair + 1N Neil + 2N Port Blair
 *                   (Havelock is a DAY-TRIP from Day 3, NO overnight)
 *   • 6N variants : 2N PB + 1N Havelock + 1N Neil + 2N PB
 *   • 7N variants : 2N PB + 1N Havelock + 1N Neil + 3N PB
 *   • Honeymoon   : 1N PB + 2N Havelock + 1N PB
 *   • Royal       : 1N PB + 1N Havelock + 1N Neil + 1N PB
 *
 * This script writes the correct `cities` array onto each package in
 * Firestore so the homepage cards show real per-night routes (not the
 * "3N Havelock" heuristic guess).
 *
 * USAGE
 *   1. Open https://andamanvoyages.in/dashboard while signed in as admin.
 *   2. Open DevTools Console (F12 → Console tab).
 *   3. Paste the WHOLE block below (everything inside the IIFE), Enter.
 *   4. You'll see a green confirmation toast.
 * ─────────────────────────────────────────────────────────────────── */

(async function () {
    if (!window.PackagesStore || typeof window.PackagesStore.publish !== 'function') {
        alert('PackagesStore not available. Make sure you are on /dashboard and signed in as admin.');
        return;
    }

    const ROUTES = {
        // 5N/6D — Havelock is day-trip on Day 3, then overnight at Neil
        '5A': ['2N Port Blair', '1N Neil Island', '2N Port Blair'],
        '5B': ['2N Port Blair', '1N Neil Island', '2N Port Blair'],
        '5C': ['2N Port Blair', '1N Neil Island', '2N Port Blair'],
        '5D': ['2N Port Blair', '1N Neil Island', '2N Port Blair'],
        // 6N/7D — adds 1N Havelock
        '6A': ['2N Port Blair', '1N Havelock', '1N Neil Island', '2N Port Blair'],
        '6B': ['2N Port Blair', '1N Havelock', '1N Neil Island', '2N Port Blair'],
        '6C': ['2N Port Blair', '1N Havelock', '1N Neil Island', '2N Port Blair'],
        '6D': ['2N Port Blair', '1N Havelock', '1N Neil Island', '2N Port Blair'],
        // 7N/8D — extra night at Port Blair for sightseeing
        '7A': ['2N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'],
        '7B': ['2N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'],
        '7C': ['2N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'],
        '7D': ['2N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'],
        // 4N/5D specialty
        'honeymoon-4a-2026': ['1N Port Blair', '2N Havelock', '1N Port Blair'],
        'royal-4b-2026':     ['1N Port Blair', '1N Havelock', '1N Neil Island', '1N Port Blair']
    };

    try {
        const current = await window.PackagesStore.load();
        const list = (current && Array.isArray(current.data)) ? current.data.slice() : [];
        if (!list.length) { alert('No packages found in Firestore.'); return; }

        let updated = 0, skipped = 0;
        for (const pkg of list) {
            if (ROUTES[pkg.id]) {
                pkg.cities = ROUTES[pkg.id];
                updated++;
            } else {
                skipped++;
            }
        }

        await window.PackagesStore.publish(list);
        const summary = '\u2713 cities[] backfilled — updated: ' + updated + ', skipped: ' + skipped;
        console.log('%c' + summary, 'color:#27ae60;font-weight:bold;font-size:1.1rem');
        if (window.Toast && window.Toast.success) window.Toast.success(summary);
        else alert(summary + '. Refresh the homepage to see corrected routes.');
    } catch (err) {
        console.error('[fix-package-cities] failed:', err);
        alert('\u274C Failed: ' + (err && err.message || err));
    }
})();