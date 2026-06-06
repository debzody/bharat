/* ── One-off price fix: align Firestore packages with 2026 PDF brochures ──
 * The live prices on andamanvoyages.in are stored in Firestore (not in
 * data/packages.json — that file is only a static fallback). Several
 * packages were drifting from the official PDF cost sheets in package/.
 *
 * This script reads the current package list from Firestore via
 * PackagesStore.load(), patches the per-head price (and matching fields
 * such as pricePerHead, pricing.perPersonDouble, etc.) to the values
 * printed in the 2026 brochures, then re-publishes the list.
 *
 * Source of truth (verbatim "PACKAGE COST" line in each PDF):
 *   5A Economy 5N6D       Rs 15,500 / per head
 *   5B Standard 5N6D      Rs 18,500 / per head
 *   5C Deluxe 5N6D        Rs 20,500 / per head
 *   5D Premium 5N6D       Rs 22,500 / per head
 *   6A Economy 6N7D       Rs 17,500 / per head
 *   6B Standard 6N7D      Rs 20,500 / per head
 *   6C Deluxe 6N7D        Rs 22,500 / per head
 *   6D Premium 6N7D       Rs 24,500 / per head
 *   4A Honeymoon 4N5D     Rs 29,500 / per head
 *   4B Royal 4N5D         Rs 29,500 / per head
 *
 * USAGE
 *   1. Open https://andamanvoyages.in/dashboard while signed in as admin.
 *   2. Open DevTools Console (F12 → Console tab).
 *   3. Paste the WHOLE block below (everything inside the IIFE), Enter.
 *   4. Wait for "✓ Prices updated" toast / log.
 * ─────────────────────────────────────────────────────────────────── */

(async function () {
    if (!window.PackagesStore || typeof window.PackagesStore.publish !== 'function') {
        alert('PackagesStore not available. Make sure you are on /dashboard and signed in as admin.');
        return;
    }

    // ── Authoritative price table (matches PDFs in package/) ─────
    //   Keyed by every id we have ever used for that package, so the
    //   patch works regardless of which historical id is stored in
    //   Firestore.
    const PRICE_BY_ID = {
        // 5N/6D
        '5A':                15500,
        '5N6D-5A':           15500,
        '5B':                18500,
        '5N6D-5B':           18500,
        '5C':                20500,
        '5N6D-5C':           20500,
        '5D':                22500,
        '5N6D-5D':           22500,
        // 6N/7D
        '6A':                17500,
        '6N7D-6A':           17500,
        '6B':                20500,
        '6N7D-6B':           20500,
        '6C':                22500,
        '6N7D-6C':           22500,
        '6D':                24500,
        '6N7D-6D':           24500,
        // 4N/5D specials
        'honeymoon-4a-2026': 29500,
        'royal-4b-2026':     29500
    };

    // Fallback by name match (for packages whose Firestore doc id was
    // changed at some point but whose name still mentions the code).
    const PRICE_BY_NAME_RE = [
        { re: /honeymoon.*\(4a\)/i,      price: 29500 },
        { re: /royal.*\(4b\)/i,          price: 29500 },
        { re: /economy.*\(5a\)/i,        price: 15500 },
        { re: /standard.*\(5b\)/i,       price: 18500 },
        { re: /deluxe.*\(5c\)/i,         price: 20500 },
        { re: /premium.*\(5d\)/i,        price: 22500 },
        { re: /economy.*\(6a\)/i,        price: 17500 },
        { re: /standard.*\(6b\)/i,       price: 20500 },
        { re: /deluxe.*\(6c\)/i,         price: 22500 },
        { re: /premium.*\(6d\)/i,        price: 24500 }
    ];

    function targetPriceFor(pkg) {
        if (!pkg) return null;
        const id = String(pkg.id || '');
        if (PRICE_BY_ID[id] != null) return PRICE_BY_ID[id];
        const name = String(pkg.name || pkg.title || '');
        for (const row of PRICE_BY_NAME_RE) {
            if (row.re.test(name)) return row.price;
        }
        return null;
    }

    try {
        const current = await window.PackagesStore.load();
        const list = (current && Array.isArray(current.data)) ? current.data.slice() : [];
        if (!list.length) {
            alert('No packages found in Firestore. Nothing to fix.');
            return;
        }

        const changes = [];
        const next = list.map(pkg => {
            const target = targetPriceFor(pkg);
            if (target == null) return pkg;       // not a managed package, leave it alone
            const before = Number(pkg.price);
            if (before === target) return pkg;    // already correct

            const patched = { ...pkg, price: target };

            // Keep parallel price fields in sync if they exist on the doc
            if (pkg.pricePerHead != null)              patched.pricePerHead = target;
            if (pkg.pricing && typeof pkg.pricing === 'object') {
                patched.pricing = { ...pkg.pricing };
                if (pkg.pricing.perPersonDouble != null) patched.pricing.perPersonDouble = target;
                if (pkg.pricing.perPersonTriple != null) patched.pricing.perPersonTriple = target;
            }

            changes.push({
                id:    pkg.id,
                name:  pkg.name || pkg.title || '(unnamed)',
                from:  before,
                to:    target
            });
            return patched;
        });

        if (!changes.length) {
            console.log('%c✓ All package prices already match the 2026 PDFs — nothing to do.',
                'color:#27ae60;font-weight:bold');
            if (window.Toast && window.Toast.info) window.Toast.info('Prices already correct');
            else alert('All prices already match the PDFs.');
            return;
        }

        console.group('%cPackage price fix — preview', 'color:#1a5fa6;font-weight:bold');
        console.table(changes);
        console.groupEnd();

        const proceed = confirm(
            'Update ' + changes.length + ' package(s) in Firestore to match the 2026 PDFs?\n\n' +
            changes.map(c => '• ' + c.name + ': ₹' + c.from + ' → ₹' + c.to).join('\n')
        );
        if (!proceed) {
            console.log('Aborted by user.');
            return;
        }

        await window.PackagesStore.publish(next);
        console.log('%c✓ Prices updated in Firestore (' + changes.length + ' package(s))',
            'color:#27ae60;font-weight:bold;font-size:1.1rem');
        if (window.Toast && window.Toast.success) window.Toast.success('Package prices fixed (' + changes.length + ')');
        else alert('✓ Prices updated. Reload any open package pages to see the change.');
    } catch (err) {
        console.error('[fix-package-prices] failed:', err);
        alert('❌ Failed: ' + (err && err.message || err));
    }
})();
